# Diseño: Fixes de agenda + Gestión de consentimiento informado

**Fecha:** 2026-06-09
**Estado:** Aprobado por Francisco
**Entrega:** 2 PRs — PR 1 (fixes inmediatos), PR 2 (consentimientos)

---

## PR 1 — Fixes inmediatos

### 1.1 Tipos de sesión en agenda → 3

En `services/frontend/src/pages/Appointments/NewAppointmentPage.tsx`, `SESSION_TYPES`
queda con 3 tipos alineados con los formatos de historia clínica (Apertura/Evolución/Cierre):

| id | label | duración |
|---|---|---|
| `initial` | Sesión inicial | 60 min |
| `followup` | Seguimiento | 50 min |
| `discharge` | Sesión de alta | 50 min |

Se eliminan `psychometric` (Evaluación psicométrica), `crisis` (Atención en crisis) y
`family` (Sesión familiar), junto con sus iconos importados si quedan sin uso.

### 1.2 Error 500 al "Iniciar sesión"

**Causa raíz:** el ENUM `appointment_status` de PostgreSQL no incluye `IN_PROGRESS`
(solo `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `RESCHEDULED`).
El backend (`internal/appointments/service/update_status.go`) y el frontend ya envían
`IN_PROGRESS`; Postgres rechaza el valor → 500.

**Fix:** migración `000009_appointment_in_progress`:
```sql
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS' AFTER 'CONFIRMED';
```
Down migration: no-op (Postgres no soporta eliminar valores de ENUM; documentar).
Sin cambios de código Go ni TS.

### 1.3 Eliminación total de "SOAP" visible al usuario

| Archivo | Cambio |
|---|---|
| `pages/Appointments/AppointmentPage.tsx` | Eliminar `SOAPForm`, `SOAP_FIELDS` y el panel "Crear registro SOAP". En su lugar, botón "Registrar nota de sesión" que navega a `/patients/:id/records/new?appointment={id}` (flujo v2 ya existente) |
| `pages/Settings/SettingsPage.tsx` | "Formato SOAP" → "Formato de nota"; "borrador SOAP" → "borrador IA"; eliminar plantilla demo "SOAP estándar"; renombrar `SOAP_STYLES` → `NOTE_STYLES` |
| `pages/ClinicalRecords/ClinicalRecordPage.tsx` | El visor de registros v1 se conserva (Resolución 1995: los registros antiguos deben poder leerse), pero las etiquetas en pantalla dejan de decir "SOAP": encabezado "Registro (formato anterior)", secciones con sus nombres (Subjetivo, Objetivo, Evaluación, Plan) sin la sigla |
| `pages/AIDrafts/AIDraftPage.tsx` | Textos visibles "SOAP" → "borrador estructurado". La lógica del pipeline v1 no se toca (ai-service la usa) |

Los identificadores internos de código pueden conservar nombres si renombrarlos no
aporta (regla: cero "SOAP" visible al usuario; en código, renombrar donde sea barato).

---

## PR 2 — Gestión de consentimiento informado

### Decisiones de producto (2026-06-09)

1. Los 4 tipos existentes son correctos: `TREATMENT`, `RECORDING`, `DATA_PROCESSING`,
   `INFORMATION_SHARING`. El **texto** de cada documento no existe aún — se redacta y
   gestiona dentro del sistema (plantillas).
2. Firma **en consultorio** Y **remota por link** (ambas).
3. **Una firma por proceso** — no se firma en cada cita. Cada cita muestra el
   consentimiento vigente que la cubre (vínculo derivado, sin FK nueva).
4. Debe quedar **evidencia de que leyó y aceptó**: snapshot del texto firmado, hash,
   timestamp, y para firma remota IP + user-agent (cifrados).

### 2.1 Schema (migración 000010)

**Tabla nueva `consent_templates`** — el contenido editable de cada tipo:
```sql
CREATE TABLE consent_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    consent_type    consent_type NOT NULL,
    version         INT  NOT NULL DEFAULT 1,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,          -- sin PII: no se cifra
    updated_by      UUID NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, consent_type, version)
);
```
Editar una plantilla crea una versión nueva (`is_active` pasa a la última; las
anteriores quedan como historial inmutable). Los consentimientos firmados guardan su
propio snapshot (`document_enc` + `document_template_hash`) — las ediciones de
plantilla nunca los afectan.

**Tabla nueva `consent_sign_tokens`** — links de firma remota:
```sql
CREATE TABLE consent_sign_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    consent_type    consent_type NOT NULL,
    template_id     UUID NOT NULL REFERENCES consent_templates(id),
    token_hash      TEXT NOT NULL UNIQUE,   -- SHA-256 del token; el token nunca se persiste
    created_by      UUID NOT NULL REFERENCES users(id),
    expires_at      TIMESTAMPTZ NOT NULL,   -- 7 días
    used_at         TIMESTAMPTZ,            -- un solo uso
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Columnas nuevas en `consents`:**
```sql
ALTER TABLE consents ADD COLUMN scan_file_enc BYTEA;     -- archivo subido, cifrado con DEK
ALTER TABLE consents ADD COLUMN evidence_enc  BYTEA;     -- JSON cifrado: {accepted_at, ip, user_agent, channel}
ALTER TABLE consents ADD COLUMN template_id   UUID REFERENCES consent_templates(id);
```
El archivo se guarda **en la BD** (no filesystem): volumen bajo (una clínica), y los
backups diarios existentes lo cubren sin cambios. Límite de subida: 10 MB
(PDF/JPG/PNG). `scan_path_enc` queda sin uso (deprecado, no se elimina).

### 2.2 Backend (Go — módulo `consents`)

**Endpoints autenticados** (permisos existentes `consents:*`):
- `GET    /api/v1/consent-templates` — lista las 4 plantillas activas
- `PUT    /api/v1/consent-templates/{type}` — edita → crea versión nueva (CLINIC_ADMIN y PROFESSIONAL)
- `POST   /api/v1/patients/{pid}/consents/sign` — firma en consultorio: `{consent_type, accepted: true, signature_png_base64}`. Snapshot del texto activo → `document_enc`; firma → `signature_enc`; evidencia → `evidence_enc` (channel `IN_OFFICE`)
- `POST   /api/v1/patients/{pid}/consents/upload` — multipart: `consent_type`, `signed_at`, archivo. → `scan_file_enc`, método `PHYSICAL_SCAN`
- `POST   /api/v1/patients/{pid}/consents/send-link` — genera token, guarda hash, envía email vía Resend con la URL pública
- `GET    /api/v1/consents/{id}/document` — descifra y devuelve: texto firmado, firma PNG (base64) o archivo (content-type correcto), evidencia
- `POST   /api/v1/consents/{id}/revoke` — `{reason}` → `revoked_at`, `revocation_reason`

**Endpoints públicos** (rate-limited, mismo middleware de Fase 0):
- `GET  /api/v1/public/consents/sign/{token}` — valida token (hash, no expirado, no usado); devuelve título, texto y primer nombre del paciente
- `POST /api/v1/public/consents/sign/{token}` — `{accepted: true, signature_png_base64}` → crea el consent (igual que en consultorio, channel `REMOTE_LINK`, guarda IP + user-agent cifrados), marca `used_at`

**Validaciones:** firma requiere `accepted=true` y firma no vacía; upload valida
content-type y tamaño; token de un solo uso y expiración; todo escribe en `audit_log`
(create/sign/view-document/revoke) siguiendo el patrón de `patients`.

**El POST actual de consents (metadata sin documento) se elimina** — queda reemplazado
por los 3 caminos reales (sign / upload / send-link).

### 2.3 Frontend (React)

**Configuración → "Plantillas de consentimiento":** lista de los 4 tipos con título,
versión y fecha; editor (textarea grande) que guarda versión nueva.

**Perfil del paciente → pestaña Consentimientos**, cada tipo con su estado:
- Sin firmar → botones: **Firmar ahora** · **Enviar link** · **Subir firmado**
- Firmado → fecha, método (consultorio / remoto / archivo), botón **Ver**, botón **Revocar** (pide motivo)
- Revocado → fecha y motivo, opción de volver a firmar

**Modal "Firmar ahora":** texto completo scrolleable, checkbox "Leí y acepto",
canvas de firma (dibujo con dedo/mouse, botón limpiar), Guardar deshabilitado hasta
aceptar + firmar.

**Página pública de firma remota** (ruta pública del SPA `/sign/{token}`):
misma experiencia del modal, optimizada para celular. Estados: token inválido/expirado/usado.

**Modal "Ver":** texto firmado (snapshot descifrado), imagen de la firma o visor del
archivo subido (PDF embebido / imagen), fecha, método, versión de plantilla y evidencia.

**Chip en la página de la cita (`AppointmentPage`):** derivado del consent `TREATMENT`
activo y no revocado del paciente:
- ✓ "Consentimiento firmado el {fecha}" + botón **Ver** (abre el modal de arriba)
- ⚠ "Sin consentimiento" + link a la pestaña Consentimientos del paciente

### 2.4 Seguridad

- Cifrado AES-256-GCM con DEK por documento (patrón existente, `crypto.Seal/Open`).
- `document_enc` guarda el texto EXACTO aceptado; `document_template_hash` = SHA-256 del texto.
- Token remoto: 32 bytes aleatorios, solo se persiste su SHA-256, expira en 7 días, un solo uso.
- Endpoints públicos detrás del rate limiting existente.
- Auditoría en `audit_log` para create/sign/view/revoke.

### 2.5 Testing

- Unit tests Go: transición de versiones de plantillas, validación de token
  (expirado/usado/inválido), validaciones de firma y upload, revocación.
- Tests de handler con repo fake siguiendo el patrón del módulo `clinicalrecords`.
- Verificación manual en producción post-deploy: firmar en consultorio, firmar por
  link desde celular, subir PDF, ver documento, chip en cita.

---

## Fuera de alcance (explícito)

- Firma con validez criptográfica avanzada (certificados digitales) — la evidencia
  es snapshot + hash + timestamp + firma manuscrita digital, suficiente para el MVP.
- Recordatorios automáticos de links no firmados.
- Consentimientos por cita individual (se decidió: una firma por proceso).
