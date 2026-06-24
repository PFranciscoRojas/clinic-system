# STATUS — Estado del proyecto SGHCP

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-06-23)

**El proyecto evolucionó de sistema a medida → vertical SaaS multi-tenant de psicología.**

| Ola | Estado | Resumen |
|---|---|---|
| Fases 1–5 (core) | ✅ producción | Historia clínica, consentimientos, plan terapéutico, PDF export con Nº HC |
| Ola 2 — SaaS multi-tenant | ✅ producción | RLS por tenant, signup self-serve, trial, gating 402, cobro MP suscripción |
| Ola Booking | ✅ producción | `/book/:slug` público, tarjeta/PSE/Efecty, diferidos, emails, agenda integrada |
| Ola 3 — IA | ✅ producción | Recap pre-sesión, borrador SOAP, plan TCC, detección de riesgo — activo en VPS |
| BC-6 Facturación | ✅ producción | Tarjeta/PSE/Efecty/Nequi, semana/mes/3meses/año, balance-por-paciente |
| Ola Notificaciones | ✅ producción | Email diferido/conflicto a admins, WhatsApp templates (en revisión Meta) |
| Ola Integraciones | ✅ producción | Google Calendar OAuth per-profesional, sync SGHCP→Google, grabación con IndexedDB |

### Últimos commits a `main` — todos desplegados

- `99ba8a0` feat(booking): eliminar flujo de solicitudes web (booking_requests) — 2026-06-23
- `9a38fbb` fix(appointments): casts explícitos en CTE hold_conflict para evitar ambigüedad de tipos — 2026-06-23
- `1127937` fix(appointments): cast modality a appointment_modality ENUM en INSERT — 2026-06-23
- `c6a7470` chore: log unhandled handler errors at ERROR level — 2026-06-23
- `cab4182` fix(admin): limpiar ai_suggestions y auto-FK antes de borrar pacientes/citas — 2026-06-23
- `954a137` feat(gcal): sync automático al conectar + limpieza al desconectar — 2026-06-23
- `8299a76` fix(gcal): excluir /api/* del navigateFallback del service worker — 2026-06-23
- `82de8b1` feat(gcal): backfill de citas existentes al conectar — 2026-06-23

> Commits directos a `main` (flujo actual). Branch protection sigue pendiente (BACKLOG → Infraestructura).

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **MP webhook** | `MP_WEBHOOK_ENFORCE=false` en VPS — secreto mal configurado; hacer un pago real y capturar log de firma para corregir y volver a `true` | 🔴 pendiente |
| **WhatsApp templates** | 3 plantillas `recordatorio_cita_24h`, `recordatorio_cita_2h`, `cita_confirmada` en revisión con Meta. Una vez aprobadas, configurar en Ajustes → Notificaciones con Phone Number ID `1138431989358649`. Necesita System User token permanente (el temporal caduca en 24h) | 🟡 en revisión Meta |

---

## Roadmap próximo

| Versión | Hito |
|---|---|
| `1.0.0` | Go-live real: token MP producción, precio real, `ALLOW_DATA_RESET=false`, `MP_WEBHOOK_ENFORCE=true` |
| post-1.0 | Google Calendar bidireccional (Google→SGHCP): webhooks de push, sync_token, reconciliación |
| post-1.0 | Google Calendar: verificación de app con Google para >100 usuarios (actualmente testing mode) |
| post-1.0 | Videollamada / Zoom nativa |
| post-1.0 | RIPS/ADRES export |
| post-1.0 | PHQ-9 y escalas de evaluación clínica integradas |

---

## Punto de integración — Booking público

- Ruta pública: `GET /book/:slug` → React booking page → `POST /appointments` (status `PENDING_PAYMENT`)
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
| `core-api:8080` | ✅ producción (rebuild 2026-06-23, migración 000036 aplicada) |
| `ai-service` | ✅ producción (`Dockerfile.patch` rebuild #79) |
| `frontend` (Caddy :80/:443) | ✅ producción |
| Backups | `pg_dump` cifrado GPG → Backblaze B2 |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `MP_ACCESS_TOKEN` — MercadoPago producción (actualmente token de prueba)
- `MP_WEBHOOK_SECRET` — ✅ configurado y obligatorio (B-11 cerrado 2026-06-22)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Calendar OAuth (añadidos 2026-06-24)
- `ALLOW_DATA_RESET=true` → cambiar a `false` en go-live (1.0.0)
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.25, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000036_drop_booking_requests` |
| Claude skills | `~/.claude/commands/` | Sincronizadas 2026-06-24 |

---

## Marco legal (Colombia)

| Ley | Aplica a |
|---|---|
| Ley 1581/2012 | Protección de datos — habeas data; base del modelo de cifrado PII |
| Resolución 1995/1999 | Historia clínica: retención mínima 15 años; motiva audit log WORM |
| Ley 23/1981 | Secreto profesional médico |
| Ley 1273/2009 | Delitos informáticos — seguridad en transporte y almacenamiento |
| Decreto 1227/2015 | Identidad de género → `gender` es TEXT libre, nunca ENUM |
