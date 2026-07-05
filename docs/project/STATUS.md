# STATUS — Estado del proyecto Chapni

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-07-03)

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

Auditoría técnica completa (código, BD, IA, seguridad, UX). Plan de 6 fases; features de producto → BACKLOG. **Fases 1 y 2 completadas y desplegadas** (2026-07-02):

| Fase | Estado | Contenido |
|---|---|---|
| 1 — Seguridad crítica | ✅ prod (PR #107) | docker.sock fuera de core-api (era RCE→root); hashes PII con HMAC-SHA256 + `SEARCH_PEPPER` (antes SHA-256 sin sal, reversible); `cmd/rehash` migró hashes existentes; cap real de upload de audio (`MaxBytesReader` + UUID) |
| 2 — Bugs de sesión/auth | ✅ prod (PR #108) | single-flight en refresh (evita logout en plena sesión); `localStorage` selectivo (borradores clínicos sobreviven); refresh relee usuario desde BD (roles revocados/inactivos ya no sobreviven el TTL); 3 fetch ad-hoc → `api.getBlob` |
| 3 — IA guardrails | ⬜ siguiente | temperature=0.2, anonimización (email + nombres literales), anti-injection, ICD-10 validado, jobs huérfanos del worker |
| 4 — Plataforma/perf | ⬜ | cache SubscriptionGate, staticcheck en CI |
| 5 — Tests | ⬜ (deuda #1) | testcontainers + test de aislamiento RLS, vitest para client.ts/RecordForm |
| 6 — Frontend refactor | ⬜ | partir SettingsPage, drafts en logout |

### Últimos PRs a `main`

- `#146` enhancement(clinical): **consolidación de borradores IA multi-toma** — 2026-07-05. Cuando una sesión se graba en varias tomas (corte de luz, F5, nueva grabación), el worker de `ai-service` funde la transcripción de la toma anterior (`DRAFT_READY`, misma cita) en la más nueva, generando un solo borrador consolidado en vez de dos sueltos; las tomas anteriores quedan `SUPERSEDED` (contenido anulado) apuntando a la consolidada vía `superseded_by`. Migraciones `000058` (valor enum `SUPERSEDED`) + `000059` (`ai_drafts.superseded_by` FK). `core-api` oculta `SUPERSEDED` de la lista de revisión; frontend redirige un borrador `SUPERSEDED` al consolidado conservando el contexto de sesión. **Desplegado completo**: migraciones aplicadas en VPS, CI verde para `core-api` (test+lint+build+deploy+smoke) y `ai-service` (build+deploy), frontend reconstruido manualmente — todo verificado (`/healthz` 200, logs limpios, smoke funcional).
- `#145`–`#141` (2026-07-05) y `#140`–`#137` (2026-07-04): iteración sobre el flujo de comparación manual-vs-IA en `AIDraftPage` (routing de borradores aprobados, colapso de secciones IA usadas, entrada desde cualquier punto, aprobar finalizando el registro en progreso) + guard de rol en consola de operador + scoping de facturación por profesional. Detalle no capturado en una sesión de `/actualizar-contexto` propia — ver `git log` para hashes exactos.

> Flujo actual: rama `fix/*` → PR → squash-merge → CI deploy. Branch protection sigue pendiente (BACKLOG → Infraestructura).
> **CI/CD:** `test → build → smoke`. `go test ./...` bloquea el build; `tsc --noEmit` corre en cada PR de frontend; smoke test de 8 pasos HTTP corre tras cada deploy al VPS.
> **Frontend:** se construye **manualmente** en el VPS (`docker run node:20-alpine npm run build`). El CI no tiene workflow de deploy para frontend.

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **WhatsApp Meta API** | Cargo COP $90.675 pagado. Pendiente: confirmar que la API se desbloqueó, configurar `tpl_reminder_24h` y `tpl_reminder_2h` en Ajustes → Integraciones con los nombres exactos de las plantillas aprobadas. | 🟡 verificar desbloqueo |
| **Validación de demanda** | Conseguir 2-3 psicólogas externas en beta de diseño (acceso gratis 2 semanas, acompañamiento 1ª sesión en vivo). Sin esto, el go-live 1.0.0 carece de señal de mercado. 2 contactos disponibles (colegas de la esposa). Fases 1-2 de la auditoría deben cerrarse antes de la beta (logout/pérdida de borrador ya resueltos). | 🔴 sin iniciar |

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
| `core-api:8080` | ✅ producción — CI deploy (PR #146 `e62367d`, 2026-07-05, consolidación borradores IA). Migraciones 000058+000059 ejecutadas. |
| `ai-service` | ✅ producción — CI deploy (PR #146, 2026-07-05, fusión de transcripciones multi-toma) |
| `frontend` (Caddy :80/:443) | ✅ producción — rebuild manual desde `e62367d` (PR #146, 2026-07-05). **Dominio:** `https://app.chapni.com` (principal, `CADDY_APP_DOMAIN`); `api.marcelachapues.com` legacy (mantiene `/api` para webhooks, redirige 308 el resto). `APP_BASE_URL` = `https://app.chapni.com`. Cert Let's Encrypt emitido. Google OAuth redirect URI actualizado en Cloud Console. |
| Backups | `pg_dump` cifrado GPG → Backblaze B2 |
| **Disco** | ~40% (15/38 GB) — cron semanal en el **host** (ya no en el admin UI): `0 4 * * 0 docker system prune -af` → `/var/log/docker-prune.log`. Alerta email si >80% |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `SEARCH_PEPPER` — ✅ añadido 2026-07-02 (fail-closed al boot). Llave HMAC de los hashes de búsqueda de PII; independiente de `MASTER_KEY`. Generado en el VPS, nunca salió del servidor. Rehash ya corrido (7 usuarios, 4 pacientes)
- `MP_ACCESS_TOKEN` — MercadoPago producción SaaS (suscripciones); sobrerideable desde UI en Operador → Plataforma (tabla `platform_settings`)
- `MP_WEBHOOK_SECRET` — ✅ configurado (global); sobrerideable desde UI en Operador → Plataforma
- `MP_WEBHOOK_ENFORCE=true` — ✅ activado (sesión 12); org payment configs usa secret per-tenant vía `WithOrgScope`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Calendar OAuth (añadidos 2026-06-24)
- `ALLOW_DATA_RESET=true` → cambiar a `false` en go-live (1.0.0)
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`
- Marcela org (real, 5 usuarios): `aa2cbd1f-76b2-4cf9-bdde-dcf403ad1f04` (slug `marcela-chapues`) — token MP **live** ✅ · desde sesión 24 usa **plantillas personalizadas para los 4 formatos** (Apertura `ee720934`, Plan Terapéutico `6c0c21db`, Nota de Evolución `9e3d4685`, Informe de Cierre `89995be0`) — ya no formato integrado
- Marcela org #2 (`ps.marcelachapues@gmail.com`, CLINIC_ADMIN+PROFESSIONAL, 3 pacientes — **ya no vacía**, en uso activo desde sesión 23): `fbf1fb3d-607d-4f4d-9870-05e95f63a1a3` (slug `marcelachapues`)

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.25, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000059_ai_draft_superseded_by` (+ `000058` valor enum `SUPERSEDED`) — consolidación de tomas de borrador IA, PR #146, ejecutada en prod 2026-07-05 |
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
