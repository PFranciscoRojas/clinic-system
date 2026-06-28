# STATUS — Estado del proyecto SGHCP

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-06-27)

**El proyecto evolucionó de sistema a medida → vertical SaaS multi-tenant de psicología.**

| Ola | Estado | Resumen |
|---|---|---|
| Fases 1–5 (core) | ✅ producción | Historia clínica, consentimientos, plan terapéutico, PDF export con Nº HC |
| Ola 2 — SaaS multi-tenant | ✅ producción | RLS por tenant, signup self-serve, trial, gating 402, cobro MP suscripción |
| Ola Booking | ✅ producción | `/book/:slug` público, tarjeta/PSE/Efecty, diferidos, emails, agenda integrada. Pagos por tenant (migración 000042). Webhook secret per-org cifrado (migración 000043). Badge test/producción en Ajustes (migración 000044). |
| Ola 3 — IA | ✅ producción | Recap pre-sesión, borrador clínico (estructurado/narrativo), plan TCC, detección de riesgo. Prefs de estilo+tono por profesional (migración 000037). Activo en VPS |
| BC-6 Facturación | ✅ producción | Tarjeta/PSE/Efecty/Nequi, semana/mes/3meses/año, balance-por-paciente |
| Ola Notificaciones | ✅ producción | Email diferido/conflicto a admins, WhatsApp `cita_confirmada` verificado (es_CO). Bloqueado por cargo pendiente Meta. |
| Ola Integraciones | ✅ producción | Google Calendar OAuth per-profesional, sync SGHCP→Google, grabación con IndexedDB |
| Ola Legal (Colombia) | ✅ producción | ToS + Política privacidad (Ley 1581/Ley 1480), DPA Encargado-Responsable, checkbox aceptación signup, modal DPA, banner IA reforzado. Migración 000038 |
| Ola Gobernanza (sesión 6) | ✅ producción | Cuenta desactivada → 403 español. Eliminación con confirmación por correo + reactivación. CLINIC_ADMIN solo-lectura clínica (migración 000039). Break-the-glass con audit trail. CMS legal editable (migración 000040, Markdown, editor con preview). |
| Ola Tabs clínicos (sesión 7) | ✅ producción | Rediseño tabs perfil paciente: Agenda (citas) + Historia clínica (registros+Dx+Plan). Break-the-glass refinado: solo al abrir contenido confidencial (Dx, Plan, SOAP), no al ver metadata. RiskBanner y "Sesión pasada" ocultos para admin puro. Razón justificada persiste en sessionStorage por paciente. |
| Ola Need-to-know (sesión 8) | ✅ producción | `patient_staff_rel` enforced: profesionales solo ven HC de sus propios pacientes (403 NO_PATIENT_ACCESS). Migración 000041 backfilla desde appointments + clinical_records; appointment creation auto-registra en patient_staff_rel. Adendas ocultas para CLINIC_ADMIN puro. "Iniciar/Finalizar sesión" y controles de grabación ocultos para admin puro. Bug fix: tras fallo de upload de audio, recovery banner aparece sin F5. |

### Últimos commits a `main`

- `c6191d3` feat(admin): pestaña Plataforma en SuperAdmin con config MP por BD + nav limpio para SYSTEM_ADMIN — 2026-06-27
- `829d4ec` feat(settings): pestaña Integraciones con gate de contraseña (CLINIC_ADMIN) — 2026-06-27
- `8580e05` fix(booking): use WithOrgScope in orgWebhookSecret to satisfy RLS — 2026-06-27
- `d5c7b58` feat(orgs): modo test/producción visible en Ajustes → Pagos — 2026-06-27
- `c45a264` feat(booking): añadir items.description y payer first/last_name a preferencia MP — 2026-06-27

> Commits directos a `main` (flujo actual). Branch protection sigue pendiente (BACKLOG → Infraestructura).
> **CI/CD:** `core-api` y `ai-service` se construyen en GitHub Actions y se despliegan a ghcr.io. El VPS solo hace `docker pull` — sin builds locales.

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **WhatsApp Meta API** | Cargo COP $90.675 pagado. Pendiente: confirmar que la API se desbloqueó, configurar `tpl_reminder_24h` y `tpl_reminder_2h` en Ajustes → Integraciones con los nombres exactos de las plantillas aprobadas. | 🟡 verificar desbloqueo |
| **Validación de demanda** | Conseguir 2-3 psicólogas externas en beta de diseño (acceso gratis 2 semanas, acompañamiento 1ª sesión en vivo). Sin esto, el go-live 1.0.0 carece de señal de mercado. 2 contactos disponibles (colegas de la esposa). | 🔴 sin iniciar |

---

## Roadmap próximo

| Versión | Hito |
|---|---|
| `1.0.0` | Go-live real: precio real ($180.000), `ALLOW_DATA_RESET=false`, ✅ `MP_WEBHOOK_ENFORCE=true` (activo desde sesión 12), validación legal por abogado (ToS/privacidad ya publicados como borrador) |
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
| `core-api:8080` | ✅ producción — imagen `ghcr.io/pfranciscorojas/clinic-system-core-api:latest` (build en CI) |
| `ai-service` | ✅ producción — `ghcr.io/pfranciscorojas/clinic-system-ai-service:latest` (whisper.tiny + spaCy sm) |
| `frontend` (Caddy :80/:443) | ✅ producción |
| Backups | `pg_dump` cifrado GPG → Backblaze B2 |
| **Disco** | ~40% (15/38 GB) — cron semanal: `docker builder prune -af` + `system prune`. Alerta email si >80% |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `MP_ACCESS_TOKEN` — MercadoPago producción SaaS (suscripciones); sobrerideable desde UI en Operador → Plataforma (tabla `platform_settings`)
- `MP_WEBHOOK_SECRET` — ✅ configurado (global); sobrerideable desde UI en Operador → Plataforma
- `MP_WEBHOOK_ENFORCE=true` — ✅ activado (sesión 12); org payment configs usa secret per-tenant vía `WithOrgScope`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Calendar OAuth (añadidos 2026-06-24)
- `ALLOW_DATA_RESET=true` → cambiar a `false` en go-live (1.0.0)
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`
- Marcela org: `fbf1fb3d-607d-4f4d-9870-05e95f63a1a3` (slug `marcelachapues`) — token MP **live** ✅

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.25, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000045_platform_settings` |
| CI/CD | `.github/workflows/build-ai-service.yml` + `build-core-api.yml` | Build+push ghcr.io + deploy SSH al VPS (secrets: `VPS_HOST`, `VPS_SSH_KEY`, `GHCR_TOKEN`) |
| Claude skills | `~/.claude/commands/` | Sincronizadas 2026-06-27 |

---

## Marco legal (Colombia)

| Ley | Aplica a |
|---|---|
| Ley 1581/2012 | Protección de datos — habeas data; base del modelo de cifrado PII |
| Resolución 1995/1999 | Historia clínica: retención mínima 15 años; motiva audit log WORM |
| Ley 23/1981 | Secreto profesional médico |
| Ley 1273/2009 | Delitos informáticos — seguridad en transporte y almacenamiento |
| Decreto 1227/2015 | Identidad de género → `gender` es TEXT libre, nunca ENUM |
