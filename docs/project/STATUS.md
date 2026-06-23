# STATUS — Estado del proyecto SGHCP

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-06-23)

**El proyecto evolucionó de sistema a medida → vertical SaaS multi-tenant de psicología.**

| Ola | Estado | Resumen |
|---|---|---|
| Fases 1–5 (core) | ✅ producción | Historia clínica, consentimientos, plan terapéutico, PDF export |
| Ola 2 — SaaS multi-tenant | ✅ producción | RLS por tenant, signup self-serve, trial, gating 402, cobro MP suscripción |
| Ola Booking | ✅ producción | `/book/:slug` público, tarjeta/PSE/Efecty, diferidos, emails, agenda integrada |
| **Ola 3 — IA** | 🟡 en progreso | Recap pre-sesión + plan terapéutico sugerido (Whisper + Sonnet) |
| BC-6 Facturación | ✅ producción | Tarjeta/PSE/Efecty/Nequi, semana/mes/3meses/año, balance-por-paciente |

### Últimos commits a `main` (sesión 2026-06-23) — desplegados

- `448abed` fix(booking): eliminado `payment_methods` de la preferencia (bloqueaba PSE); email "Tu horario está apartado" para pagos diferidos (Efecty/cash) con fecha de cita, plazo y link al comprobante
- `e03d511` fix(booking): eliminado `expiration_date_to` de la preferencia — bloqueaba el redirect PSE al banco
- `6110a83` feat(booking): deadline del comprobante antes de la cita (hold capeado a `scheduled_at − 2h`); botón "Finalizar" en pantalla de reserva apartada
- `291c743` feat(booking): soporte de pagos diferidos (Efecty/efectivo); página de retorno con 5 estados explícitos (confirmada/apartada/fallida/procesando/confirmando); fix crítico RLS `BusyHolds` (los holds no se aplicaban a disponibilidad desde migración 000032); 404 del endpoint status = fallo definitivo (resuelve PSE rechazado colgado en "Confirmando"); migración 000033 (`payment_voucher_url`)
- `1515290` fix(booking): sin redirección automática (quitado `auto_return`); `?slug=` en back_url; retryHref/homeHref nunca caen al host del API; copy "no cierres esta página" corregido

> Commits directos a `main` (flujo actual). Branch protection sigue pendiente (BACKLOG → Infraestructura).

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **UI** | Botón "Cambiar correo del admin" en Configuración | 🟡 pendiente |
| **MP webhook** | `MP_WEBHOOK_ENFORCE=false` en VPS — secreto mal configurado; hacer un pago real y capturar log de firma para corregir y volver a `true` | 🔴 pendiente |

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
| `core-api:8080` | ✅ producción (rebuild 2026-06-23, migración 000033 aplicada) |
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
| Migrations | `services/core-api/migrations/` | Última: `000033_booking_voucher` |
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
