# STATUS — Estado del proyecto SGHCP

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-06-30)

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
| Ola Plantillas de registro (sesión 15–16) | ✅ producción | Formatos clínicos definibles por el profesional en Markdown; parser → `SectionDef[]`; tabla `clinical_record_templates` (migración 000046); CRUD + preview en vivo en Settings; `TemplatedSectionsForm` renderiza tipos + widgets existentes; AI worker usa schema dinámico; `template_id` viaja en todo el flujo audio→draft→aprobación; PDF renderer usa etiquetas y orden del schema cuando `template_id` presente. |
| Ola Legal (Colombia) | ✅ producción | ToS + Política privacidad (Ley 1581/Ley 1480), DPA Encargado-Responsable, checkbox aceptación signup, modal DPA, banner IA reforzado. Migración 000038 |
| Ola Gobernanza (sesión 6) | ✅ producción | Cuenta desactivada → 403 español. Eliminación con confirmación por correo + reactivación. CLINIC_ADMIN solo-lectura clínica (migración 000039). Break-the-glass con audit trail. CMS legal editable (migración 000040, Markdown, editor con preview). |
| Ola Tabs clínicos (sesión 7) | ✅ producción | Rediseño tabs perfil paciente: Agenda (citas) + Historia clínica (registros+Dx+Plan). Break-the-glass refinado: solo al abrir contenido confidencial (Dx, Plan, SOAP), no al ver metadata. RiskBanner y "Sesión pasada" ocultos para admin puro. Razón justificada persiste en sessionStorage por paciente. |
| Ola Need-to-know (sesión 8) | ✅ producción | `patient_staff_rel` enforced: profesionales solo ven HC de sus propios pacientes (403 NO_PATIENT_ACCESS). Migración 000041 backfilla desde appointments + clinical_records; appointment creation auto-registra en patient_staff_rel. Adendas ocultas para CLINIC_ADMIN puro. "Iniciar/Finalizar sesión" y controles de grabación ocultos para admin puro. Bug fix: tras fallo de upload de audio, recovery banner aparece sin F5. |

### Últimos commits a `main`

- `aec74c3` fix(clinical): PDF con códigos crudos sin traducir + vista previa incompleta — 2026-06-30
- `b2b3057` fix(agenda): AssignPatient no vinculaba al profesional con el paciente — 2026-06-30
- `1568af3` feat(clinical): autoguardado real en el servidor para registros clínicos (Fase 2) — 2026-06-30
- `a368d42` fix(clinical): atacar la pérdida de contenido al escribir desde la raíz (Fase 1) — 2026-06-30
- `e10237c`/`7dc76c3` fix(agenda): selector de profesional enviaba el ID del admin — 2026-06-30
- `929ac9c`/`7f217cf`/`ec85011`/`ac1467a`/`00a7213` fix(clinical): picker de formato, 4 vs 7 formatos, crash SPA — 2026-06-30

> Commits directos a `main` (flujo actual). Branch protection sigue pendiente (BACKLOG → Infraestructura).
> **CI/CD:** `test → build → smoke`. `go test ./...` bloquea el build; `tsc --noEmit` corre en cada PR de frontend; smoke test de 8 pasos HTTP corre tras cada deploy al VPS.
> **Frontend:** se construye **manualmente** en el VPS (`docker run node:20-alpine npm run build`). El CI no tiene workflow de deploy para frontend.

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
| `core-api:8080` | ✅ producción — CI deploy `aec74c3` (migración 000048 aplicada) |
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
- Marcela org (real, 5 usuarios): `aa2cbd1f-76b2-4cf9-bdde-dcf403ad1f04` (slug `marcela-chapues`) — token MP **live** ✅
- Marcela org #2 (`ps.marcelachapues@gmail.com`, CLINIC_ADMIN+PROFESSIONAL, 3 pacientes — **ya no vacía**, en uso activo desde sesión 23): `fbf1fb3d-607d-4f4d-9870-05e95f63a1a3` (slug `marcelachapues`)

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.25, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000048_clinical_record_autosave` (`finalized_at` en `clinical_records`) |
| CI/CD | `.github/workflows/build-ai-service.yml` + `build-core-api.yml` | Build+push ghcr.io + deploy SSH al VPS (secrets: `VPS_HOST`, `VPS_SSH_KEY`, `GHCR_TOKEN`) |
| Claude skills | `~/.claude/commands/` + `~/.claude/skills/` | `ui-ux-pro-max` instalada; `ui-styling` (Tailwind/shadcn) desinstalada 2026-06-28 — proyecto usa inline styles |

---

## Marco legal (Colombia)

| Ley | Aplica a |
|---|---|
| Ley 1581/2012 | Protección de datos — habeas data; base del modelo de cifrado PII |
| Resolución 1995/1999 | Historia clínica: retención mínima 15 años; motiva audit log WORM |
| Ley 23/1981 | Secreto profesional médico |
| Ley 1273/2009 | Delitos informáticos — seguridad en transporte y almacenamiento |
| Decreto 1227/2015 | Identidad de género → `gender` es TEXT libre, nunca ENUM |
