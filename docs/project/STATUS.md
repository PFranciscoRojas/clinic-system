# STATUS — Estado del proyecto SGHCP

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-06-22)

**El proyecto evolucionó de sistema a medida → vertical SaaS multi-tenant de psicología.**

| Ola | Estado | Resumen |
|---|---|---|
| Fases 1–5 (core) | ✅ producción | Historia clínica, consentimientos, plan terapéutico, PDF export |
| Ola 2 — SaaS multi-tenant | ✅ producción | RLS por tenant, signup self-serve, trial, gating 402, cobro MP suscripción |
| Ola Booking | ✅ producción | `/book/:slug` público, pago MP único, emails 24h/2h, agenda integrada |
| **Ola 3 — IA** | 🟡 en progreso | Recap pre-sesión + plan terapéutico sugerido (Whisper + Sonnet) |
| BC-6 Facturación | ✅ producción | Tarjeta/PSE/Efecty/Nequi, semana/mes/3meses/año, balance-por-paciente |

### Últimos commits a `main` (sesión 2026-06-22) — desplegados

- `9adcb1c` feat(rls): `bookings`, `booking_requests`, `consent_sign_tokens`, `consent_templates` bajo RLS por tenant (migración 000032 + resolvers SECURITY DEFINER `booking_org`/`consent_token_org`). `dbctx.WithOrgScope` para handlers públicos; `bookingrequests` y `booking` convertidos a scope; provisioning de signup fija scope al sembrar plantillas; arregla bug latente (firma pública leía `patients` sin scope). Cierra **bloqueante RLS**. Verificado en prod (fail-closed, resolver, write/read con scope, cross-org bloqueado)
- `eb62f60` feat(booking): aceptación obligatoria de la política de reembolso/cancelación antes de pagar — checkbox en el paso de datos del wizard público, botón deshabilitado hasta aceptar, checkout rechaza sin `policy_accepted` y sella `policy_accepted_at` (migración 000031). Cierra **B6**
- `07ae88f` fix(billing): firma de webhook MP obligatoria — quitado el fail-open. `VerifyWebhook` falla cerrado con secreto vacío; `config.Load` exige `MP_WEBHOOK_SECRET` cuando hay `MP_ACCESS_TOKEN`. Cierra **B-11**. Secreto añadido al `.env` del VPS
- `7e2e132` feat(patients): Nº de HC consecutivo por tenant (`patient_code`, patrón `invoice_number` con advisory lock), asignado al registrar; migración 000030 con backfill (lift FORCE RLS); franja de identificación muestra `HC-000001` + Fecha de apertura (cierra Sección I del Formato 1)
- `8b38fd1` fix(agenda): el popover de agendado rápido detecta solapamiento con citas del día (`byDay`) y muestra estado "ocupado" en vez de proponer una hora que luego choca

> Commits directos a `main` (flujo actual). Branch protection sigue pendiente (BACKLOG → Infraestructura).

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **UI** | Botón "Cambiar correo del admin" en Configuración | 🟡 pendiente |

---

## Roadmap próximo

| Versión | Hito |
|---|---|
| `1.0.0` | Go-live real: token MP producción, precio real, `ALLOW_DATA_RESET=false` |
| post-1.0 | Google Calendar OAuth + sync |
| post-1.0 | Recordatorios WhatsApp (Meta API / Twilio) |
| post-1.0 | Videollamada / Zoom nativa |
| post-1.0 | RIPS/ADRES export |
| post-1.0 | PHQ-9 y escalas de evaluación clínica integradas |

---

## Punto de integración — Booking público

- Ruta pública: `GET /book/:org_slug` → React booking page → `POST /appointments` (status `PENDING_PAYMENT`)
- MP webhook → `PAID` → status `SCHEDULED` → email 24h/2h
- Cita puede ser guest (sin paciente) o ligada a paciente registrado
- Asignación de paciente: `POST /appointments/:id/patient` (desde `NewPatientPage?appointment_id=`)
- Permisos: `appointments:manage` controla Cancelar/Reagendar; `billing:manage_rates` controla BC-6

---

## Estado VPS (Hetzner CX21 · 87.99.137.79)

| Componente | Estado |
|---|---|
| `postgres:5432` | ✅ corriendo |
| `redis:6379` | ✅ corriendo |
| `core-api:8080` | ✅ producción (rebuild 2026-06-22, migración 000032 aplicada) |
| `ai-service` | ✅ producción (`Dockerfile.patch` rebuild #79) |
| `frontend` (Caddy :80/:443) | ✅ producción |
| Backups | `pg_dump` cifrado GPG → Backblaze B2 |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `MP_ACCESS_TOKEN` — MercadoPago producción (actualmente token de prueba)
- `MP_WEBHOOK_SECRET` — ✅ configurado y obligatorio (B-11 cerrado 2026-06-22)
- `ALLOW_DATA_RESET=true` → cambiar a `false` en go-live (1.0.0)
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.21, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000032_rls_public_booking_consent` |
| Claude skills | `~/.claude/commands/` | Sincronizadas en sesión 2026-06-22 |

---

## Marco legal (Colombia)

| Ley | Aplica a |
|---|---|
| Ley 1581/2012 | Protección de datos — habeas data; base del modelo de cifrado PII |
| Resolución 1995/1999 | Historia clínica: retención mínima 15 años; motiva audit log WORM |
| Ley 23/1981 | Secreto profesional médico |
| Ley 1273/2009 | Delitos informáticos — seguridad en transporte y almacenamiento |
| Decreto 1227/2015 | Identidad de género → `gender` es TEXT libre, nunca ENUM |
