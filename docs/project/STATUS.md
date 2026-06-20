# STATUS — Estado del proyecto SGHCP

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-06-20)

**El proyecto evolucionó de sistema a medida → vertical SaaS multi-tenant de psicología.**

| Ola | Estado | Resumen |
|---|---|---|
| Fases 1–5 (core) | ✅ producción | Historia clínica, consentimientos, plan terapéutico, PDF export |
| Ola 2 — SaaS multi-tenant | ✅ producción | RLS por tenant, signup self-serve, trial, gating 402, cobro MP suscripción |
| Ola Booking | ✅ producción | `/book/:slug` público, pago MP único, emails 24h/2h, agenda integrada |
| **Ola 3 — IA** | 🟡 en progreso | Recap pre-sesión + plan terapéutico sugerido (Whisper + Sonnet) |
| BC-6 Facturación | ✅ producción | Tarjeta/PSE/Efecty/Nequi, semana/mes/3meses/año, balance-por-paciente |

### Últimos PRs (semana 2026-06-20)

- `#106` fix(clinical): guard ALL array `.includes()` against stale localStorage — FunctionalAnalysisPanel, MentalExamChecklist, ClinicalFormulation5F, RecordSectionsForm
- `#105` fix(clinical): guard `sessionEval.axis/.barriers` undefined crash on stale localStorage
- `#104` feat(clinical): rewrite F4 Informe de Cierre to match exact paper format (linear I→II→III→IV→V)
- `#103` feat(clinical): rewrite F3 Evolución to match exact paper format
- `#102` feat(clinical): rewrite F2 Plan Terapéutico to match exact paper format
- `#101` feat(clinical): rewrite F1 Sesión Inicial to match exact paper format

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **B-11** | Enforce firma webhook MP — quitar fail-open, exigir `MP_WEBHOOK_SECRET` → 401 | 🔴 pendiente |
| **B6** | Política de reembolso/cancelación en booking con check de aceptación | 🟡 pendiente |
| **RLS** | Aplicar RLS a `ai_drafts` + endpoints públicos booking/consents | 🟡 pendiente |
| **UI** | Botón "Cambiar correo del admin" en Configuración | 🟡 pendiente |

---

## Roadmap próximo

| Versión | Hito |
|---|---|
| `1.0.0` | Go-live real: token MP producción, precio real, `ALLOW_DATA_RESET=false`, política reembolso (B6), MP_WEBHOOK_SECRET obligatorio (B-11) |
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
| `core-api:8080` | ✅ producción |
| `ai-service` | ✅ producción (`Dockerfile.patch` rebuild #79) |
| `frontend` (Caddy :80/:443) | ✅ producción |
| Backups | `pg_dump` cifrado GPG → Backblaze B2 |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `MP_ACCESS_TOKEN` — MercadoPago producción (actualmente token de prueba)
- `MP_WEBHOOK_SECRET` — **pendiente de hacer obligatorio** (B-11)
- `ALLOW_DATA_RESET=true` → cambiar a `false` en go-live (1.0.0)
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.21, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000028_patient_emergency_contact` |
| Claude skills | `~/.claude/commands/` | Sincronizadas en sesión 2026-06-20 |

---

## Marco legal (Colombia)

| Ley | Aplica a |
|---|---|
| Ley 1581/2012 | Protección de datos — habeas data; base del modelo de cifrado PII |
| Resolución 1995/1999 | Historia clínica: retención mínima 15 años; motiva audit log WORM |
| Ley 23/1981 | Secreto profesional médico |
| Ley 1273/2009 | Delitos informáticos — seguridad en transporte y almacenamiento |
| Decreto 1227/2015 | Identidad de género → `gender` es TEXT libre, nunca ENUM |
