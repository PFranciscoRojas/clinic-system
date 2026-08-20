# STATUS — Estado del proyecto Chapni

> Fuente canónica del estado vivo. Se **SOBRESCRIBE** en cada actualización (`/actualizar-contexto`).
> El historial diario está en `docs/history/CHANGELOG.md`.
> Las reglas de código y el mapa de arquitectura están en `CLAUDE.md`.

---

## Estado actual (2026-08-20)

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
| Ola Agenda de leads (sesión 2026-07-23/25) | ✅ producción | `app.chapni.com/agenda`: agenda comercial pública para leads, separada del `/book` clínico (sin tenant, sin pago, sin paciente). Migración 000069 (`lead_bookings` con índice único parcial anti doble-reserva + `lead_booking_settings`). Reserva → evento con Google Meet en el calendar del superadmin + email al lead y aviso interno. Disponibilidad = horarios configurados − leads reservados − **free/busy real del Google Calendar** (PR #220, sin ampliar scope: `calendar.events` ya permite leer). Consola en `/admin?tab=agenda` (PR #222) y layout estilo Calendly (PR #225). |
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

### Sesión 2026-08-18/20 — latencia de audio, el camino de cobro y la vigilancia

**Fase 4 de la latencia de audio, medida y afinada** (`#287`–`#290`). La prueba
de carga con tres sesiones simultáneas destapó dos cosas que el diseño daba por
ciertas y no lo eran: un carril propio para las ventanas **no** impedía que
Whisper decodificara dos veces a la vez (60,7 s de cola contra 45,3 s del mismo
trabajo a solas), y la ventana en vuelo se soltaba antes de escribirse. Con las
dos arregladas, las tres sesiones esperan 61/131/198 s donde antes esperaban
87/155/221, y sin ventanas esperarían ~200/~400/~600. Migración `000080`
(`partial_transcripts.window_started_at`, el reclamo de la ventana en vuelo).

**Barrido de producción:** el `PartSweeper` de 12 h borró los 63 trozos huérfanos
de una subida abortada, y se purgaron **206 llaves de cifrado huérfanas** (el
conjunto se construyó desde `pg_constraint`, 11 claves foráneas, con respaldo en
`/root/orphan_keys_backup_20260818.csv`). Ninguna era de ese día: las corridas de
prueba no filtran llaves.

**Cuatro fallos apilados en el camino de cobro** (`#292`–`#295`), todos vivos
desde que se escribió ese código, y la razón por la que ninguna organización
había quedado nunca registrada como cobrada:

| PR | Qué estaba mal |
|---|---|
| `#292` | `plan_amount` se guardaba sin validar nada. $1.000 está por debajo del piso de MercadoPago ($1.600 COP), así que cada checkout devolvía 400 → 502 → "no se pudo iniciar el pago". Un precio impagable ahora se rechaza al guardarlo, que es el último momento en que sale barato |
| `#293` | `/preapproval/search` mandaba `sort=date_created&criteria=desc`, que es la convención de `/v1/payments/search`, y este endpoint contesta `400 Invalid sorting value format` — todas las veces, desde el día que se escribió. Como `reconcile` es también lo que parcha el `notification_url`, el webhook tampoco podía quedar enganchado nunca |
| `#294` | `applyPreapproval` buscaba la organización por `external_reference`, que viene **null** cuando la suscripción nace de un `preapproval_plan`, y `_, _ = h.pool.Exec` tiraba las dos devoluciones: el UPDATE que no tocaba ninguna fila era silencioso. Ahora resuelve por `provider_customer_id` y grita si no encontró a nadie |
| `#295` | Quien pagó y no se le activó **no tenía cómo reintentar**: el único sitio que llamaba a `reconcile` era la página de regreso del checkout. Si te la perdías una vez, se acabó. Botón "Ya pagué, verificar" en la propia pantalla de plan vencido |

Los cuatro salieron de probar el pago con dinero real. Ninguno se habría visto de
otra forma hasta que una psicóloga pagara y se quedara afuera — que es
exactamente lo que pasó el 18 de agosto a las 16:58.

**Verificado en producción (2026-08-19):** `fbf1fb3d` (MarcelaChapues) en
`active` con `current_period_end 2026-09-18`, activada desde el botón nuevo.

**Vigilancia** (`#296`, `docs/ops/MONITORING.md`): `scripts/monitor.sh` corre en
el host cada 5 minutos, se registra como profesional y pide `/auth/me` y la lista
de pacientes. La lección del 18 de agosto es que `/healthz` respondió 200 durante
todo el incidente: medir si el proceso vive no es medir si se puede trabajar.
Lo que el monitor *decide* se prueba en `scripts/monitor_test.sh` (47 casos) y
entra en `make verify`. El canario es un `PROFESSIONAL` de solo lectura de la org
demo interna, con su credencial en `/etc/sghcp/monitor.env` (600) y **no** en el
`.env` de los contenedores: la credencial del vigilante no vive dentro de la
aplicación que vigila.

**El propio despliegue de la vigilancia la rompió, y fue el bug de la sesión**
(`#297`). `monitor.sh` se commiteó `100644`. Mientras el VPS tuvo la copia subida
a mano por scp no se notó nada; al mergear `#296` y hacer `git pull` en el
servidor, la copia rastreada reemplazó a la manual y cron pasó a recibir
`permission denied` cada cinco minutos. El vigilante no se cayó: nunca arrancó, y
el único sitio donde se habría quejado es el log que se quedó vacío — que se lee
igual que "todo bien". La causa es que este repo tiene `core.fileMode = false`,
así que git no mira el modo del disco y `make verify` seguía verde con la copia
de trabajo conservando el bit que el índice no tenía. Lo pinea
`scripts/check_exec_bits.sh` (paso `exec-bits` en `make verify`): todo `.sh`
rastreado debe ser `100755`. Salió rojo con **cuatro** archivos, no uno —
`run_fuzz_test.sh` y `run_mutation_test.sh` llevaban así desde que se escribieron
y `verify.sh` también los ejecuta por ruta.

**Dead man's switch: diferido a propósito** (`#298`). Si el monitor se muere,
nadie avisa. El diseño quedó decidido y escrito en `BACKLOG.md` para no volver a
derivarlo — el VPS lata cada 5 minutos contra un servicio de afuera; ciclo limpio
→ `curl $HEARTBEAT_URL`, algún chequeo rojo → `/fail`, que de paso sería un
segundo canal de aviso independiente de Resend. Se implementa cuando haya
usuarios reales; lo único que bloquea es crear la cuenta del receptor.

### Últimos PRs a `main` (sesión 2026-08-18/20, todos desplegados por CI)

- `#292`–`#295` fix(billing): los cuatro fallos del camino de cobro, en la tabla de arriba.
- `#296` feat(ops): la vigilancia firmada — `scripts/monitor.sh` + `monitor_test.sh` (47 casos en `make verify`), healthchecks de compose para `core-api` y `ai-service`, y `docs/ops/MONITORING.md`.
- `#297` fix(ops): `check_exec_bits.sh` y los cuatro `.sh` commiteados sin bit de ejecución. Rojo antes del arreglo.
- `#298` docs(ops): el dead man's switch pasa de "sin iniciar" a "diferido a propósito", con el diseño escrito.

**Verificación en producción (2026-08-20):** cinco contenedores arriba, `core-api`
y `ai-service` ahora reportando `(healthy)`; el ciclo del monitor sale limpio por
cron (`entry ok · containers ok · queue ok · disk ok`) leyendo la copia rastreada
tras un `git pull` real, que es el escenario que había fallado. La máquina de
avisos se ejercitó en vivo bajando el umbral de disco: `send` → `silent` →
`recovered`, los tres correos confirmados en la bandeja.

### PRs de la sesión anterior (2026-07-23/25)

- `#227` feat(auth): **auditoría de todo acceso denegado a un recurso** — el enlace directo a un paciente de otro consultorio ya fallaba en cerrado (RLS → cero filas → 404, indistinguible de un ID inventado a propósito); faltaba el rastro. Middleware `audit.Writer.Denied()` sobre el grupo protegido registra `RESOURCE_ACCESS_DENIED` con `success=false` ante 403/404 y solo en rutas con ID de recurso. Corrige además que la auditoría venía guardando la IP del proxy de Docker en vez de la del cliente (`httputil.ExtractIP`). Sin migraciones.
- `#219` feat(agenda): **agenda de leads `/agenda`** vinculada al Google Calendar del superadmin. Migración `000069` (`lead_bookings`, `lead_booking_settings`). Hallazgo: el scope OAuth vigente (`calendar.events`) ya alcanza para crear evento + Meet — no hubo que reautorizar.
- `#220` feat(agenda): la disponibilidad **respeta el free/busy real del calendario** — antes un bloqueo personal se ofrecía como libre. Ignora eventos "Libre" (transparent) y cancelados; los de día completo bloquean el día. Fail-closed si la lectura falla.
- `#221` chore(docs): guía del sistema completa — 10 capítulos en vivo en `chapni.com/guia`.
- `#222` feat(agenda): **consola del superadmin** (`/admin?tab=agenda`) para días/horas/duración/zona horaria y listado de llamadas agendadas. Los endpoints salieron en #219 sin UI: el horario solo se cambiaba por SQL.
- `#223` fix(agenda): el formulario de settings se **deriva** (`draft ?? cfg`) en vez de hidratarse en un `useEffect` — el lint de `react-hooks` rompió CI en main tras #222.
- `#225` feat(agenda): layout **estilo Calendly** en `/agenda` (panel de marca + calendario mensual + formulario al elegir hora), refresco de disponibilidad cada 90 s y al volver a la pestaña.
- `#226` fix(agenda): fuera el nombre del anfitrión hardcodeado — mostraba `Marcela Chapués · Chapni`, que es una psicóloga clienta, no el equipo comercial.

**Verificación en producción (2026-07-25):** `GET /agenda` → 200; `GET /api/v1/public/agenda/availability` devuelve días con slots y el 2026-07-29 aparece con menos huecos que el resto (faltan 07:00–08:00), lo que confirma que el free/busy del calendario real de #220 está bloqueando de verdad, no solo los horarios configurados. Los 8 últimos runs de CI en verde; 5 contenedores arriba; working tree limpio y `tsc --noEmit` del frontend sin errores.

### Sesiones anteriores, comprimidas

- **2026-07-21/22:** `#211` la app entera era rastreable (Caddy responde `X-Robots-Tag: noindex` salvo la allowlist; **solo `/book/marcela-chapues` es indexable**, cada profesional nuevo se agrega al matcher a mano). `#213` el parser de plantillas falla en cerrado ante un `##` en una pista. `#214` emails de ciclo de trial + primeros pasos + referidos v1 (migración `000068`). `#215` reconstrucción de los 4 formatos clínicos (ver bloque siguiente).
- **2026-08-07 — embudo de activación (`#256`–`#258`):** `/admin?tab=activacion`, ocho pasos derivados de datos existentes, con aviso cuando la cohorte es demasiado chica para leer porcentajes y evidencia que distingue un cobro real de una activación manual (migración `000074`). Destapó un bug vivo desde la migración 000018: los endpoints de admin consultan sin `app.current_org`, así que con FORCE RLS la consola mostraba "0 pacientes" en todos los tenants — arreglado con dos funciones `SECURITY DEFINER` de solo agregados (migración `000073`).
- **2026-07-27 al 08-07 — guantelete de pruebas (`#236`–`#255`):** cobertura con trinquete, fuzzing de 15 objetivos, tests de RLS/concurrencia/cripto, suite de aceptación en Gherkin (`features/`), `make verify` como única definición de "hecho", 8 checks requeridos en `main` con `enforce_admins`, y **migraciones aplicadas por el propio deploy** (`#255`, con chequeo de `dirty`). Detalle en `docs/ai/PLAN_TESTING_GAUNTLET.md` y en el CHANGELOG.

### Corrupción de las plantillas de Marcela (2026-07-21) — diagnosticada y reparada

Síntoma: la mayoría de campos aparecían como texto libre con `{multiselect:...}` dentro de la descripción. Causa: el `source_markdown` guardado **perdió los saltos de línea**, así que siete campos quedaron pegados en una sola línea dentro de la pista de "Antecedentes farmacológicos" y el parser los leyó como texto de ayuda. Además hubo **pérdida de caracteres irrecuperable desde la BD**: las listas de opciones de `docs/formatos/*.txt` están a dos columnas y leerlas línea por línea fusionó vecinos (`Antecedentes familiares de salud mental` + `Estilo parental sobreprotector` → `Antecedentes familiareprotector`; `Suicidio|Psicosis` → `Suisicosis`).

Reparación: los originales sí estaban en el repo (`docs/formatos/`). Los 4 formatos quedan reconstruidos como markdown anotado en **`docs/formatos/reconstruidos/`** y aplicados a producción como versión nueva, con las anteriores en `ARCHIVED` (10 versiones archivadas; los registros ya escritos siguen anclados a su propia versión, como exige Res. 1995).

| Formato | Versión | Campos | Con opciones | Texto libre |
|---|---|---|---|---|
| Apertura de Historia Clínica (INITIAL, default) | v4 | 36 | 17 | 19 |
| Plan Terapéutico (EVOLUTION, no default) | v7 | 19 | 14 | 5 |
| Nota de Evolución (EVOLUTION, default) | v8 | 19 | 15 | 4 |
| Informe de Cierre (DISCHARGE, default) | v4 | 8 | 4 | 4 |

Antes la apertura tenía 27 campos con 16 de texto libre. `TestReconstructedFormatsParseCleanly` vigila el rebuild (cada formato debe parsear, sin anotaciones colgando en etiqueta o pista, sin select/multiselect de menos de 2 opciones).

**Sesión 2026-07-21/22 (marketing/SEO, sin PRs en `clinic-system` — todo en el repo `../chapni`):** se descubrió que **Cloudflare devolvía 403 a todos los crawlers de IA** (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot) e inyectaba un *managed robots.txt* con `Disallow: /` para ellos, mientras Googlebot pasaba normal — por eso ChatGPT respondía que el dominio no existía y otros modelos describían el producto sin precio, sin prueba gratis y sin la IA, inventando funciones. Resuelto en el panel. Además: **`/precios/` y `/seguridad/` como URLs propias** (antes solo anclas del home, y un ancla no se indexa como respuesta), **guía nueva "Cómo elegir software de historia clínica para psicólogos en Colombia"** (criterios sin nombrar competidores ni enlazarlos — decisión explícita de no darles visibilidad), **IndexNow** enganchado a `npm run deploy`, `www` con 301 al apex, ruta `*.workers.dev` retirada, y `plan-seo-backlinks-geo.md` corregido (llevaba desactualizado desde el 6 de julio y provocó tres afirmaciones falsas en la sesión).

> Flujo actual: rama `fix/*` → PR → squash-merge → CI deploy. ✅ Branch protection activa desde 2026-07-09.
> **CI/CD:** core-api `test → build → smoke`; ai-service `pytest → build → deploy`; **frontend `build → rsync al VPS → smoke` (automatizado desde #185)**; `smoke.yml` también corre por `workflow_dispatch` tras cambios manuales.

---

## Bloqueantes / QUEUE

| ID | Descripción | Estado |
|---|---|---|
| **WhatsApp Meta API** | Cargo COP $90.675 pagado. **Verificado en BD 2026-07-25**: la config de la única org ya tiene `phone_number_id` y las tres plantillas escritas (`recordatorio_cita_24h`, `recordatorio_cita_2h`, `cita_confirmada`, `lang=es_CO`) — lo que falta **no** es configurarlas, es que `org_whatsapp_config.enabled` sigue en `false`. Queda: confirmar que Meta desbloqueó y encender el toggle en Ajustes → Integraciones. | 🟡 configurado, apagado |
| **Dead man's switch** | `scripts/monitor.sh` vigila la producción desde el host cada 5 minutos, pero **si el propio monitor se muere nadie avisa**: el cron puede desaparecer y el silencio se lee igual que la salud. Cerrarlo pide un observador fuera de este servidor. Ver `docs/ops/MONITORING.md`. | ⏸️ diferido a propósito (2026-08-20) hasta tener usuarios reales; diseño decidido y anotado en `docs/ai/BACKLOG.md` → Infraestructura / DevOps |
| **Validación de demanda** | Conseguir 2-3 psicólogas externas en beta de diseño (acceso gratis 2 semanas, acompañamiento 1ª sesión en vivo). Sin esto, el go-live 1.0.0 carece de señal de mercado. 2 contactos disponibles (colegas de la esposa). Fases 1-2 de la auditoría deben cerrarse antes de la beta (logout/pérdida de borrador ya resueltos). | 🔴 sin iniciar |
| **Validación de demanda B2B (clínicas)** | Señal orgánica en producción: ninguna aún — tras la limpieza del 2026-08-07 la cohorte del embudo es **1 organización real**; el único signup externo que hubo (Alma Vélez) canceló sin registrar un solo paciente y se eliminó. Señal de mercado (2026-07-06): sí existe — competidores colombianos (Psiris, MedSystem, RIPS/CIE10/Res. 1888) e IPS de salud mental reales en Bogotá/Medellín ya operan sin solución especializada en psicología+cifrado. Pendiente decidir: entrevistas directas con 3-5 IPS/clínicas antes del plan B2B completo, o construirlo ya con esta señal. | 🟡 en evaluación |
| **Formatos reconstruidos — revisión clínica** | Los 4 formatos ya están en prod sin corrupción, pero al reconstruirlos se tomaron 2 decisiones que Marcela debe validar: (a) **consumo de SPA** quedó como un multiselect de sustancias con las frecuencias plegadas, en vez del "Sí/No" + casillas por sustancia del papel; (b) **ideación suicida e intento previo** siguen como campos del formato aunque el sistema ya tiene su control fijo de nivel de riesgo (posible duplicación). Ambas se ajustan desde el builder visual, sin tocar BD. | 🟡 pendiente de revisión |
| **MCP `cloudflare-api` — scope del token** | ✅ **OAuth ya autorizado** (verificado 2026-07-25: lista las zonas `chapni.com` y `marcelachapues.com`). Pero el token concedido es de lectura acotada: `GET /zones/:id/rulesets` devuelve *request is not authorized* y `bot_management` da *Authentication error* — o sea, reglas de redirección y política de bots **siguen siendo manuales por el panel**. Cabo suelto heredado: confirmar si *JavaScript Detections* está apagado (no verificable por API con este token; el HTML se sirve cacheado y haría falta purgar). Cosmético: ese script es inline y el CSP del sitio (`script-src 'self'`) ya lo bloquea. | 🟡 conectado, sin permisos de escritura |

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
| `core-api:8080` | ✅ producción — CI deploy (último: PR #296, 2026-08-20 00:43 UTC; **healthcheck de compose desde #296**, `(healthy)` verificado). **Las migraciones las aplica el propio deploy desde PR #255**, antes de recrear el contenedor, y falla si queda `dirty`. **Verificado 2026-08-07: `schema_migrations` = 74, dirty=f** (`000073_platform_org_activation`, `000074_activation_paid_source`). Implicación heredada de #255: las migraciones tienen que ser **aditivas**. |
| `ai-service` | ✅ producción — CI deploy (último: PR #296, 2026-08-20; **healthcheck de compose desde #296**, `(healthy)` verificado — verde solo dice que el proceso web contesta, no que la cola avance). Antes: PR #208, 2026-07-21 (`risk` pasa a control fijo del sistema). Pipeline validado E2E con audio de 58 min (2026-07-11). |
| `frontend` (Caddy :80/:443) | ✅ producción — **CI deploy automático desde PR #185** (`build-frontend.yml`: build en Actions + rsync in-place al bind mount, sin restart de Caddy). Último: PR #258 (2026-08-08 02:06 UTC, pestaña de activación). **Caddy recreado a mano** el 2026-07-21 tras PR #211 (bind-mount de archivo: `reload` no basta). **Dominio:** `https://app.chapni.com` (DNS en nube gris a propósito: en proxy se rompe el ACME de Caddy, y Cloudflare corta las subidas en 100 MB — bloqueante para audio de sesión); `api.marcelachapues.com` legacy (mantiene `/api` para webhooks, redirige 308 el resto). |
| Backups | `pg_dump` diario cifrado GPG → Backblaze B2 + **snapshot cifrado del `.env`** (desde 2026-07-13). Llave GPG rotada 2026-07-13: `backups@chapni.com` (privada en máquina del operador + LastPass; la vieja solo lee dumps ≤ 2026-07-13). **Restore probado**: RTO datos ~15 s — runbook en `docs/ops/DR_RUNBOOK.md`. |
| **Disco** | 22% (7,7/38 GB — reverificado 2026-08-19) — cron semanal en el **host**: `0 4 * * 0 docker system prune -af` → `/var/log/docker-prune.log`. **Alerta por correo si ≥80% desde el 2026-08-19** (`scripts/monitor.sh`); antes de esa fecha este documento afirmaba tener esa alerta y no existía ninguna |
| **Vigilancia** | `scripts/monitor.sh` cada 5 min desde el host → `/var/log/sghcp-monitor.log`, avisos por Resend. Se registra con un canario `PROFESSIONAL` de la org demo y pide `/auth/me` y la lista de pacientes: mide si **se puede entrar**, no si el proceso vive. Runbook en `docs/ops/MONITORING.md`. Instalada por `/etc/cron.d/sghcp-monitor` (aditivo, no pisa el respaldo diario ni el prune semanal), log rotado semanal ×8. **El bit de ejecución lo garantiza `make verify` desde #297** — se commiteó `100644` y cron estuvo recibiendo `permission denied` hasta que se arregló |

**Env crítico en VPS:**
- `MASTER_KEY` — clave maestra de cifrado PII
- `SEARCH_PEPPER` — ✅ añadido 2026-07-02 (fail-closed al boot). Llave HMAC de los hashes de búsqueda de PII; independiente de `MASTER_KEY`. Generado en el VPS, nunca salió del servidor. Rehash ya corrido (7 usuarios, 4 pacientes)
- `MP_ACCESS_TOKEN` — MercadoPago producción SaaS (suscripciones); sobrerideable desde UI en Operador → Plataforma (tabla `platform_settings`)
- `MP_WEBHOOK_SECRET` — ✅ configurado (global); sobrerideable desde UI en Operador → Plataforma
- `MP_WEBHOOK_ENFORCE=true` — ✅ activado (sesión 12); org payment configs usa secret per-tenant vía `WithOrgScope`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Calendar OAuth (añadidos 2026-06-24)
- ~~`ALLOW_DATA_RESET`~~ — eliminado 2026-07-07: el env var global exponía el botón de reset a cualquier CLINIC_ADMIN real. Reemplazado por chequeo `organizations.is_internal` dentro del handler (solo org operador + org demo del smoke test), sin flag que apagar/prender
- Demo: `admin@demo.clinica.co` / `Admin1234!` · tenant ID `005e349d2fbc5d30000000003`
- Marcela org (real, 5 usuarios): `aa2cbd1f-76b2-4cf9-bdde-dcf403ad1f04` (slug `marcela-chapues`) — token MP **live** ✅ · usa **plantillas personalizadas para los 4 formatos**, reconstruidas y reemplazadas el 2026-07-21 (Apertura v4, Plan Terapéutico v7, Nota de Evolución v8, Informe de Cierre v4; las versiones previas quedaron `ARCHIVED`, no borradas). Fuente de verdad del contenido: `docs/formatos/reconstruidos/`
- Marcela org #2 (`ps.marcelachapues@gmail.com`, CLINIC_ADMIN+PROFESSIONAL, 3 pacientes): `fbf1fb3d-607d-4f4d-9870-05e95f63a1a3` (slug `marcelachapues`) — **marcada `is_test` el 2026-08-07**, junto con `Consultorio Valentina Ríos` (la org demo de los pantallazos de la guía). Fuera de métricas y eliminables. `marcela-chapues` es la real y queda protegida (no eliminable).

---

## Componentes vivos

| Componente | Path | Estado |
|---|---|---|
| `core-api` | `services/core-api/` | ✅ Go 1.25, prod |
| `frontend` | `services/frontend/` | ✅ React TS PWA, prod |
| `ai-service` | `services/ai-service/` | ✅ Whisper local + Claude, prod |
| Migrations | `services/core-api/migrations/` | Última: `000080_window_in_flight` (reclamo de ventana en vuelo, PR #288) — aplicada en prod (`schema_migrations` = 80, verificado 2026-08-19). Las aplica el deploy desde PR #255, así que **tienen que ser aditivas**. Ojo: 000052 ya existía (`org_signup_lead`), por eso el salto de numeración |
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
