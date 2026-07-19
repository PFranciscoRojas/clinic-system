# STATUS — Estado del proyecto Chapni

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-07-19)

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
| Ola Plantillas — tipos genéricos + fix de versionado (sesión 2026-07-15) | ✅ producción | Motivada por que la IA no llenaba "Evaluación del cierre de sesión" en la plantilla real de Marcela: el `ai_schema` de varios widgets (`session_evaluation`, `task_adherence`, `functionality`, `formulation_5f`, `spa_history`, `functional_analysis`) estaba desincronizado del componente React real desde que se construyeron — la IA nunca los llenó bien. Fix de fondo: nuevos tipos genéricos `multiselect` y `{pills}`/`{allow_other}` (PR #199) para checklists/radio-buttons declarativos sin construir un widget bespoke en Go+Python+React cada vez — el ai_schema se deriva de `options` automáticamente. Los 4 formatos de Marcela reescritos con la sintaxis nueva (mental_exam/task_checklist/risk siguen como widget por valor de UX/legal genuino). Al editar los 4 templates en vivo se destapó un bug real preexistente: `recordtemplates.Update` mutaba la misma fila en sitio, rompiendo borradores en curso (422 al autosave/finalize) **y** dejando que un PDF de un registro ya firmado se re-renderizara con el schema de hoy en vez del vigente al aprobarse (violaba la inmutabilidad que la propia migración 000046 ya prometía por Res. 1995/1999) — arreglado en PR #200: cada edición ahora archiva la fila vieja y crea una versión nueva activa; los registros quedan anclados para siempre a su `template_id`. |
| Ola Legal (Colombia) | ✅ producción | ToS + Política privacidad (Ley 1581/Ley 1480), DPA Encargado-Responsable, checkbox aceptación signup, modal DPA, banner IA reforzado. Migración 000038 |
| Ola Gobernanza (sesión 6) | ✅ producción | Cuenta desactivada → 403 español. Eliminación con confirmación por correo + reactivación. CLINIC_ADMIN solo-lectura clínica (migración 000039). Break-the-glass con audit trail. CMS legal editable (migración 000040, Markdown, editor con preview). |
| Ola Tabs clínicos (sesión 7) | ✅ producción | Rediseño tabs perfil paciente: Agenda (citas) + Historia clínica (registros+Dx+Plan). Break-the-glass refinado: solo al abrir contenido confidencial (Dx, Plan, SOAP), no al ver metadata. RiskBanner y "Sesión pasada" ocultos para admin puro. Razón justificada persiste en sessionStorage por paciente. |
| Ola Need-to-know (sesión 8) | ✅ producción | `patient_staff_rel` enforced: profesionales solo ven HC de sus propios pacientes (403 NO_PATIENT_ACCESS). Migración 000041 backfilla desde appointments + clinical_records; appointment creation auto-registra en patient_staff_rel. Adendas ocultas para CLINIC_ADMIN puro. "Iniciar/Finalizar sesión" y controles de grabación ocultos para admin puro. Bug fix: tras fallo de upload de audio, recovery banner aparece sin F5. |
| Auditoría 360° + endurecimiento (sesión 25) | ✅ Fases 1–2 en producción | Auditoría completa (código, BD, IA, seguridad, UX) → plan en `docs/ai/PLAN_AUDIT_FIXES.md`. **Fase 1** (PR #107): docker.sock eliminado de core-api (era root en host vía RCE), hashes PII → HMAC-SHA256 con `SEARCH_PEPPER` + `cmd/rehash` ejecutado en prod (7 users, 4 patients), upload de audio con `MaxBytesReader` + UUID validado. **Fase 2** (PR #108): single-flight en refresh de token (f

### Tareas clínica feedback (2026-07-02) — `tareas_clinica.md`

Feedback de uso del sistema de IA clínica. **Todos los 7 puntos resueltos y desplegados en producción** (sesión del 2026-07-02):

| Punto | Categoría | Descripción | PR |
|---|---|---|---|
| 1 | 🐛 bug | Borrador re-aprobable → registros duplicados (RLS fail-closed sin GUC tenant) | #113 |
| 5 | 🐛 bug | Desfase de fecha (UTC vs local Bogotá) en registros clínicos | #113 |
| 2 | 🤖 IA | Resumen borrador no se adapta al formato configurado (schema desincronizados) | #114 |
| 6 | 🤖 IA | Falta campo "enfoque terapéutico" en perfil profesional | #115 |
| 7 | 🤖 IA | Salidas IA no orientadas al enfoque del profesional | #115 |
| 3 | 🎨 UX | Sin ruta para volver a sesión con borrador IA en proceso | #116 |
| 4 | 🎨 UX | Recap pre-sesión no colapsable | #116 |

Plan técnico en `docs/ai/PLAN_IA_puntos_2_6_7.md` (Puntos 2, 6, 7).

### Auditoría 360° (2026-07-01) — plan de corrección en `docs/ai/PLAN_AUDIT_FIXES.md`

Auditoría técnica completa (código, BD, IA, seguridad, UX). Plan de 6 fases; features de producto → BACKLOG. **Las 6 fases completadas** (cerrada 2026-07-09 con el anti-injection, PR #162 — ver `docs/ai/PLAN_AUDIT_FIXES.md` para el detalle original de cada punto):

| Fase | Estado | Contenido |
|---|---|---|
| 1 — Seguridad crítica | ✅ prod (PR #107) | docker.sock fuera de core-api (era RCE→root); hashes PII con HMAC-SHA256 + `SEARCH_PEPPER` (antes SHA-256 sin sal, reversible); `cmd/rehash` migró hashes existentes; cap real de upload de audio (`MaxBytesReader` + UUID) |
| 2 — Bugs de sesión/auth | ✅ prod (PR #108) | single-flight en refresh (evita logout en plena sesión); `localStorage` selectivo (borradores clínicos sobreviven); refresh relee usuario desde BD (roles revocados/inactivos ya no sobreviven el TTL); 3 fetch ad-hoc → `api.getBlob` |
| 3 — IA guardrails | ✅ resuelto (cerró con PR #162) | ✅ `temperature=0.2` (`ai-service/config.py`); ✅ anonimización con nombres literales del paciente + NER + regex doc/teléfono/email (`anonymization/ner.py`); ✅ ICD-10 validado vía FK `patient_diagnoses_icd10_code_fkey` → `ErrUnknownCode`; ✅ jobs huérfanos recuperados (`worker.py`: `_sweep_stuck` + `_reclaim_stale` vía XCLAIM); ✅ anti-injection estructural (PR #162): contenido no confiable viaja en envelopes `<transcripcion>`/`<historia_clinica>` anclados en los system prompts, con neutralización de tags embebidos (`prompt_guard.py` + tests) |
| 4 — Plataforma/perf | ✅ resuelto | cache `SubscriptionGate` con TTL 60s (`middleware/subscription.go`); staticcheck en CI (`build-core-api.yml`) |
| 5 — Tests | ✅ resuelto | testcontainers + tests de aislamiento RLS (`internal/integration/{infra,rls,needtoknow}_test.go`); vitest para `client.ts` y `RecordForm` |
| 6 — Frontend refactor | ✅ resuelto | `SettingsPage` partido en 10 secciones bajo `components/settings/` (191 líneas, solo orquesta); `logout` hace `flushClinicalDrafts()` antes de invalidar el token (`AuthContext.tsx`) |

### Últimos PRs a `main` (sesiones 2026-07-17→18, todos desplegados por CI)

- `#202` feat(clinical): **métricas de edición de borradores IA** (feedback loop fase 1, tabla `draft_feedback`) — en prod desde 2026-07-17. Pendientes de fases siguientes: perfil de estilo por profesional, eval set, fase 2 con consentimientos.
- `#203` fix(db): hard-delete de organización desde Superadmin fallaba contra el `audit_log` append-only.
- `#204` fix(clinical): **retiro de widgets bespoke desincronizados** — solo quedan `mental_exam`/`risk`/`treatment_plan`/`diagnoses` (con `risk` como único AI-fillable; el ai-service descarta fail-closed valores IA para los manual-only); campos nuevos siempre como `multiselect`/`select` de plantilla.
- `#205` chore(docs): cierre del ítem de verificación de `ai_schema` en BACKLOG + hallazgo `record_type` INITIAL vs plantilla EVOLUTION registrado.
- `#206` feat(clinical): **builder visual de plantillas** sobre el source Markdown (Settings → Formatos).

**Sesión 2026-07-19 (marketing, sin PRs en `clinic-system` — todo en el repo `../chapni`):** batch semanal `chapni-social` completo (5 slots 07-20→24 generados, aprobados con 3 rondas de ajustes de copy, renderizados y **programados ✅** — log `d89029f`); **guía nueva del hub: "Secreto profesional Ley 1090"** escrita, buildeada y **desplegada a chapni.com/recursos** (`c1c4dbe` + wrangler deploy, smoke 200) — 5ª guía, se estrena en el slot educativo del lunes 07-27; reglas nuevas de vocabulario CO y anti-jerga (SOAP) en `strategy.md` de la skill; Artifact semanal con captions copiables publicado.

> Flujo actual: rama `fix/*` → PR → squash-merge → CI deploy. ✅ Branch protection activa desde 2026-07-09.
> **CI/CD:** core-api `test → build → smoke`; ai-service `pytest → build → deploy`; **frontend `build → rsync al VPS → smoke` (automatizado desde #185)**; `smoke.yml` también corre por `workflow_dispatch` tras cambios manuales.

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **WhatsApp Meta API** | Cargo COP $90.675 pagado. Pendiente: confirmar que la API se desbloqueó, configurar `tpl_reminder_24h` y `tpl_reminder_2h` en Ajustes → Integraciones con los nombres exactos de las plantillas aprobadas. | 🟡 verificar desbloqueo |
| **Validación de demanda** | Conseguir 2-3 psicólogas externas en beta de diseño (acceso gratis 2 semanas, acompañamiento 1ª sesión en vivo). Sin esto, el go-live 1.0.0 carece de señal de mercado. 2 contactos disponibles (colegas de la esposa). Fases 1-2 de la auditoría deben cerrarse antes de la beta (logout/pérdida de borrador ya resueltos). | 🔴 sin iniciar |
| **Validación de demanda B2B (clínicas)** | Señal orgánica en producción: ninguna aún (solo 5 orgs totales, casi todas internas/de prueba, 1 solo signup real de tercero). Señal de mercado (2026-07-06): sí existe — competidores colombianos (Psiris, MedSystem, RIPS/CIE10/Res. 1888) e IPS de salud mental reales en Bogotá/Medellín ya operan sin solución especializada en psicología+cifrado. Pendiente decidir: entrevistas directas con 3-5 IPS/clínicas antes del plan B2B completo, o construirlo ya con esta señal. | 🟡 en evaluación |

---

## Roadmap próximo

| Versión | Hito |
|---|---|
| `1.0.0` | Go-live real: precio real ($180.000), ✅ reset de datos ya no expuesto a tenants reales (`is_internal`, 2026-07-07), ✅ `MP_WEBHOOK_ENFORCE=true` (activo desde sesión 12), validación legal por abogado (ToS/privacidad ya publicados como borrador) |
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
| `core-api:8080` | ✅ producción — CI deploy (último: PR #206, 2026-07-18, builder visual de plantillas). |
| `ai-service` | ✅ producción — CI deploy (último: PR #204, 2026-07-17: descarte fail-closed de valores IA en widgets manual-only). Pipeline validado E2E con audio de 58 min (2026-07-11). |
| `frontend` (Caddy :80/:443) | ✅ producción — **CI deploy automático desde PR #185** (`build-frontend.yml`: build en Actions + rsync in-place al bind mount, sin restart de Caddy). Último: PR #206 (2026-07-18). **Dominio:** `https://app.chapni.com`; `api.marcelachapues.com` legacy (mantiene `/api` para webhooks, redirige 308 el resto). |
| Backups | `pg_dump` diario cifrado GPG → Backblaze B2 + **snapshot cifrado del `.env`** (desde 2026-07-13). Llave GPG rotada 2026-07-13: `backups@chapni.com` (privada en máquina del operador + LastPass; la vieja solo lee dumps ≤ 2026-07-13). **Restore probado**: RTO datos ~15 s — runbook en `docs/ops/DR_RUNBOOK.md`. |
| **Disco** | ~27% (9,4/38 GB tras el barrido de audios PHI 2026-07-13) — cron semanal en el **host**: `0 4 * * 0 docker system prune -af` → `/var/log/docker-prune.log`. Alerta email si >80% |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `SEARCH_PEPPER` — ✅ añadido 2026-07-02 (fail-closed al boot). Llave HMAC de los hashes de búsqueda de PII; independiente de `MASTER_KEY`. Generado en el VPS, nunca salió del servidor. Rehash ya corrido (7 usuarios, 4 pacientes)
- `MP_ACCESS_TOKEN` — MercadoPago producción SaaS (suscripciones); sobrerideable desde UI en Operador → Plataforma (tabla `platform_settings`)
- `MP_WEBHOOK_SECRET` — ✅ configurado (global); sobrerideable desde UI en Operador → Plataforma
- `MP_WEBHOOK_ENFORCE=true` — ✅ activado (sesión 12); org payment configs usa secret per-tenant vía `WithOrgScope`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Calendar OAuth (añadidos 2026-06-24)
- ~~`ALLOW_DATA_RESET`~~ — eliminado 2026-07-07: el env var global exponía el botón de reset a cualquier CLINIC_ADMIN real. Reemplazado por chequeo `organizations.is_internal` dentro del handler (solo org operador + org demo del smoke test), sin flag que apagar/prender
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`
- Marcela org (real, 5 usuarios): `aa2cbd1f-76b2-4cf9-bdde-dcf403ad1f04` (slug `marcela-chapues`) — token MP **live** ✅ · desde sesión 24 usa **plantillas personalizadas para los 4 formatos** (Apertura `ee720934`, Plan Terapéutico `6c0c21db`, Nota de Evolución `9e3d4685`, Informe de Cierre `89995be0`) — ya no formato integrado
- Marcela org #2 (`ps.marcelachapues@gmail.com`, CLINIC_ADMIN+PROFESSIONAL, 3 pacientes): `fbf1fb3d-607d-4f4d-9870-05e95f63a1a3` (slug `marcelachapues`) — el usuario la considera de prueba; candidata a marcar `is_test` y eliminar desde Superadmin → Tenants (igual que `consultorio-aurora`). `marcela-chapues` es la real y queda protegida (no eliminable).

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.25, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000063_patient_search_tokens` (índice de búsqueda cifrada) + `000062_org_is_test` — ejecutadas en prod 2026-07-10. Ojo: 000052 ya existía (`org_signup_lead`), por eso el salto de numeración |
| CI/CD | `.github/workflows/build-ai-service.yml` + `build-core-api.yml` | Build+push ghcr.io + deploy SSH al VPS (secrets: `VPS_HOST`, `VPS_SSH_KEY`, `GHCR_TOKEN`) |
| Claude skills | `~/.claude/commands/` + `~/.claude/skills/` | `chapni-social` (NO sincronizada al repo `claude-skills`) es ahora un sistema de content-ops completo: auditoría de estado (paso 0, comandos `estado`/`semana`), log con confirmación de publicación en el repo chapni, sinergia con el hub `/recursos`, política de slots perdidos, ritual dominical en batch, generador de banners (`render_banner.py`) y bios/perfiles oficiales documentados. Supervisada por rutina cloud dominical (reporte a Gmail). `ui-ux-pro-max` instalada; `ui-styling` desinstalada 2026-06-28 |

---

## Marco legal (Colombia)

| Ley | Aplica a |
|---|---|
| Ley 1581/2012 | Protección de datos — habeas data; base del modelo de cifrado PII |
| Resolución 1995/1999 | Historia clínica: retención mínima 15 años; motiva audit log WORM |
| Ley 23/1981 | Secreto profesional médico |
| Ley 1273/2009 | Delitos informáticos — seguridad en transporte y almacenamiento |
| Decreto 1227/2015 | Identidad de género → `gender` es TEXT libre, nunca ENUM |
