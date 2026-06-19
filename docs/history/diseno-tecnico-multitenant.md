# Diseño técnico — Fundación Multi-Tenant SaaS (Ola 2)

**Fecha:** 2026-06-15 · **Estado:** PROPUESTA — pendiente de aprobación
**Objetivo:** convertir SGHCP de "sistema a medida para Marcela" en **producto SaaS vendible**,
empezando por el segmento **psicólogo solo** (1 org = 1 profesional), con la puerta abierta a
clínicas multi-profesional después (el RBAC ya lo soporta).
**Norte:** grande en arquitectura, pequeño en gasto. No construir IA nueva hasta tener tenants pagando.

---

## 0. Evaluación del punto de partida (qué YA existe)

Auditoría del 2026-06-15. La arquitectura fue diseñada multi-tenant desde el día 1:

| Capacidad | Estado | Evidencia |
|---|---|---|
| Tenant boundary en datos | ✅ existe | `organization_id` en todas las tablas desde `000001` |
| Aislamiento en queries | ✅ correcto | lookups por id van `WHERE id=$1 AND organization_id=$2`; el `orgID` viene del JWT, no del body |
| Login por tenant | ✅ existe | `Login(orgSlug, email, …)`, resuelve org por slug |
| Roles/permisos | ✅ maduro | 6 roles **globales** del sistema + 42 permisos por módulo (core/billing/analytics/inventory) |
| Plan de suscripción | ✅ campo listo | `organizations.plan plan_tier DEFAULT 'STARTER'`, `is_active` |
| Contenedor de branding | ✅ vacío listo | `organizations.settings JSONB DEFAULT '{}'` |
| Provisioning / signup | ❌ falta | no hay `CreateOrganization`; la org se siembra a mano |
| Branding por-tenant | ❌ hardcodeado | "Marcela Chapués" clavado en `notify/resend.go` y `templates.go` |
| Verificación de email | ❌ falta | el usuario nace activo sin confirmar correo |
| Aislamiento defensa-en-profundidad | ⚠️ solo a nivel app | falta RLS de Postgres (hoy depende de que cada query incluya el WHERE) |
| Cobro | ❌ falta | sin pasarela |

**Conclusión:** ~60-70 % del trabajo duro (modelo de datos + aislamiento en queries) **ya está pago**.
Lo que falta es la capa de *operación SaaS*, no una reescritura.

---

## 1. Modelo de tenant

- **Tenant = `organization`.** Un psicólogo solo = 1 org con 1 usuario que tiene los roles
  `CLINIC_ADMIN` (gestiona su cuenta/config/cobro) + `PROFESSIONAL` (acceso clínico).
- **Sin per-seat todavía.** Precio plano por org. Cuando entren clínicas, se reusa `Invite`
  (ya existe) para sumar usuarios y los roles `PROFESSIONAL/INTERN/RECEPTIONIST` ya están.
- **`SYSTEM_ADMIN`** = tú (operador del SaaS). Consola mínima de super-admin (ver §6), no día 1.

---

## 2. Cambios de modelo de datos (mínimos)

### 2.1 Branding → `organizations.settings` JSONB (sin migración)
Esquema tipado que vive en `settings.branding`:
```jsonc
{
  "branding": {
    "display_name": "Marcela Chapués · Psicóloga Clínica",  // pie de emails y PDF
    "public_name":  "Marcela Chapués",                        // portal de reservas
    "from_email":   "citas@marcelachapues.com",               // remitente (ver nota Resend)
    "reply_to":     "hola@marcelachapues.com",
    "logo_url":     null,                                      // opcional, fase 2
    "brand_color":  "#0f766e",
    "locale":       "es-CO"
  }
}
```
> **Nota Resend:** enviar desde un `from` por-tenant requiere dominio verificado por tenant. Para
> el MVP usamos **un remitente del producto** (`no-reply@<producto>.com`) con `reply-to` al correo
> del psicólogo, y el `display_name` del tenant en el cuerpo. Dominio propio del tenant = feature
> premium posterior. (Decisión D4: nombre del producto.)

### 2.2 Suscripción → 1 migración pequeña (`000018_subscription.up.sql`)
```sql
ALTER TABLE organizations
  ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'trialing',  -- trialing|active|past_due|canceled
  ADD COLUMN trial_ends_at       TIMESTAMPTZ,
  ADD COLUMN provider_customer_id TEXT,   -- id del cliente en Wompi/MercadoPago
  ADD COLUMN current_period_end  TIMESTAMPTZ;
-- `plan` (plan_tier) e `is_active` ya existen.
```

### 2.3 Verificación de email → misma migración
```sql
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
-- backfill: los usuarios existentes (Marcela) se marcan verificados
UPDATE users SET email_verified_at = NOW();
```

---

## 3. PR-MT1 · Branding por-tenant (des-hardcodear)

**Por qué primero:** hoy *todo* correo a pacientes dice "Marcela Chapués". Sin esto, un 2º tenant
es inservible. Riesgo bajo, desbloquea todo lo demás.

**Backend**
- `internal/orgs/` (nuevo BC ligero, o extender `auth`): `GetBranding(ctx, orgID) → Branding`,
  con default sano si `settings.branding` está vacío.
- `notify`: `ResendNotifier` recibe el `Branding` del tenant en cada envío. Las plantillas
  (`templates.go`) toman `display_name`, `reply_to`, `brand_color` como parámetros — quitar los
  literales "Marcela Chapués" / colores fijos.
- Los emisores (booking confirm/reject, consent-to-sign, password-reset) resuelven el branding por
  `org_id` antes de encolar el correo.
- PDF export: el pie usa `display_name` del tenant.

**Frontend**
- Settings → Organización: card "Identidad / Marca" (nombre público, color, reply-to, logo futuro).
  Permiso `organization:configure` (ya existe).

**Aceptación:** crear una org de prueba con branding propio → su email de consentimiento NO dice
"Marcela Chapués". Sin migración.

---

## 4. PR-MT2 · RLS + test de aislamiento (defensa en profundidad)

**Por qué antes de abrir signups:** cuando entren extraños, el aislamiento no puede depender solo
de que el dev recuerde el `WHERE organization_id`. RLS lo garantiza a nivel de motor. Además es
**activo de venta/cumplimiento** (Ley 1581).

**Diseño**
- Habilitar `ROW LEVEL SECURITY` en las tablas con `organization_id` (patients, clinical_records,
  appointments, consents, ai_drafts, treatment_plans, etc.).
- Política: `USING (organization_id = current_setting('app.current_org', true)::uuid)`.
- La app fija el GUC por request: `SET LOCAL app.current_org = $orgID` al inicio de la transacción,
  tomando el `orgID` del JWT (middleware ya lo tiene en claims).
- El `app_user` de la BD **no** es superusuario (RLS no se bypassa). Migraciones corren con rol
  dueño que sí puede.

**Complejidad / riesgo:** es el PR más delicado — exige envolver las queries en una transacción con
el GUC seteado (pgx). Mitigación: helper `withTenant(ctx, orgID, fn)` que abre tx, hace `SET LOCAL`,
ejecuta y commitea. Migrar repos a ese helper de forma incremental. **Las cláusulas `WHERE` actuales
se quedan** (cinturón + tirantes).

**Aceptación:** test que crea 2 orgs con datos y verifica que, con el GUC de la org A, una query sin
filtro explícito **no** devuelve filas de la org B.

> Alternativa si MT2 se vuelve muy pesado: posponerlo a justo-antes-del-go-live-comercial y abrir
> signups solo en beta cerrada (invitación manual). Decisión de riesgo, no técnica.

---

## 5. PR-MT3 · Provisioning + signup self-serve

**La columna vertebral SaaS.** Reusa toda la infra de tokens (reset/invite) que ya construiste.

**Flujo**
1. `POST /api/v1/auth/signup` `{ name, email, password, professional_name, license? }`
2. Servicio en 1 transacción:
   - genera `slug` desde `name` (slugify + sufijo numérico si colisiona),
   - `INSERT organizations (name, slug, plan='STARTER', subscription_status='trialing',
     trial_ends_at=now()+14d, settings con branding default)`,
   - `INSERT users (org_id, email, email_hash, password_hash, email_verified_at=NULL)`,
   - `user_roles`: liga al usuario con los roles globales `CLINIC_ADMIN` + `PROFESSIONAL`,
   - `INSERT professional_profiles` (nombre, tarjeta) — ya existe el BC.
3. Genera token `verify:<hash>` en Redis (TTL 24h) → email "Confirma tu correo" (reusa Resend).
4. `POST /auth/verify-email {token}` → sella `email_verified_at`.
5. **Login exige `email_verified_at IS NOT NULL`** (además de `is_active`).

**Anti-abuso:** rate-limit por IP, sin enumeración (mismo 200 que en reset), captcha si hace falta.

**Frontend:** página pública `/signup` + `/verify-email`. La de login ahora pregunta el `org_slug`
o — mejor UX — **login por email global** que resuelve la org (ya existe `FindUserByEmailGlobal`).
→ *Mejora UX recomendada: eliminar el campo "organización" del login.*

**Aceptación:** un extraño se registra → recibe correo → confirma → entra a su org vacía con trial
de 14 días, sin que tú toques nada.

---

## 6. PR-MT4 · Onboarding self-serve + trial

- Tras verificar: wizard guiado (ya existe onboarding parcial) — perfil, horario, plantillas de
  consentimiento sembradas por defecto, primer paciente de ejemplo opcional.
- Banner de "Te quedan N días de prueba" leyendo `trial_ends_at`.
- Al expirar trial sin pago → `subscription_status='past_due'` → middleware de gating (§7).

**Consola super-admin (mínima, opcional aquí):** `SYSTEM_ADMIN` lista orgs, ve estado de
suscripción, puede suspender (`is_active=false`). Sin impersonation todavía.

---

## 7. PR-MT5 · Cobro + gating de suscripción

**Pasarela:** Wompi (Bancolombia, nativo CO, tokenización + suscripciones recurrentes) **o**
MercadoPago (más amplio LATAM). → **Decisión D1**.

**Flujo**
- Checkout desde Settings → Plan: tokeniza tarjeta / PSE, crea suscripción en el proveedor,
  guarda `provider_customer_id`.
- **Webhook** `POST /api/v1/billing/webhook` (verificado por firma) actualiza
  `subscription_status` + `current_period_end` ante `payment.succeeded` / `failed` / `canceled`.
- **Middleware de gating:** si `subscription_status NOT IN ('trialing','active')` → bloquea todo
  salvo endpoints de `auth`, `billing` y `organization:configure` (para que pueda pagar/exportar).
  Respuesta `402 Payment Required` que el frontend traduce a la pantalla de "reactiva tu plan".
- **Exportar siempre disponible:** aunque esté suspendido, puede exportar sus historias (deber
  legal de custodia del dato — Res. 1995/1999).

**Aceptación:** trial expira → acceso bloqueado con pantalla de pago → paga → webhook reactiva →
acceso restaurado.

---

## 8. Secuencia, esfuerzo y dependencias

```
Ola 0 (tú): cuenta Backblaze + rotar API key        ── en paralelo, no bloquea código
        │
MT1 Branding ──► MT3 Signup ──► MT4 Onboarding ──► MT5 Cobro
        │              ▲
MT2 RLS ───────────────┘  (recomendado antes de abrir signups públicos;
                           posponible a beta cerrada si pesa demasiado)
```

| PR | Esfuerzo relativo | Migración | Riesgo |
|----|---|---|---|
| MT1 Branding | M | no | bajo |
| MT2 RLS + test | **L** | sí (políticas) | medio (toca acceso a datos) |
| MT3 Signup + verify | M | sí (`000018`) | bajo-medio |
| MT4 Onboarding | S-M | no | bajo |
| MT5 Cobro Wompi | **L** | no (usa cols de `000018`) | medio (integración externa + webhooks) |

Cada uno es un PR independiente, `main` siempre compila, deploy incremental al VPS.

---

## 9. Decisiones abiertas (las necesito para finalizar)

| # | Decisión | Recomendación | Afecta |
|---|---|---|---|
| **D1** | Pasarela de pago | **Wompi** (CO-first; PSE + tarjeta). MercadoPago al expandir a LATAM | MT5 |
| **D2** | Precio y planes | 1 plan solo simple, ~**$59.000–$99.000 COP/mes** (anchla: SaludTools ~$168k, Mentalyc USD20-70). Sin tier confuso al inicio | MT5, MT4 |
| **D3** | ¿Plan gratis permanente? | **No** — solo trial 14 días. Gratis = carrera al piso del commodity; diferénciate por valor | MT4, MT5 |
| **D4** | Nombre/marca del producto | Necesario para `from-email`, dominio y página pública. Hoy todo es "marcelachapues.com" | MT1, MT3 |
| **D5** | Duración del trial | **14 días** | MT3, MT4 |
| **D6** | ¿RLS ahora o beta cerrada primero? | **Ahora** si vamos a abrir signup público; beta cerrada permite posponer MT2 | orden MT2 |

---

## 10. Lo que este diseño deliberadamente NO hace todavía
- IA nueva (recap pre-sesión, detección de riesgo) → Ola 3, después de tener tenants pagando.
- Per-seat / facturación por usuario → cuando entren clínicas.
- Dominio de email propio por tenant → premium posterior.
- Multi-región / escalado de infra → cuando el VPS apriete (cola de jobs ya usa Redis Streams).
- Impersonation de soporte, RIPS/DIAN, WhatsApp → olas posteriores del roadmap.
