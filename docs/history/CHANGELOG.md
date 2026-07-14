# CHANGELOG — Historial compactado de trabajo SGHCP

> Append-only. Días de >30 días colapsan a resumen mensual. Para roadmap y bloqueantes ver `docs/project/STATUS.md`.

---

## 2026-07-13

- enhancement: **batch "todos los pendientes técnicos + mejoras del sistema"** (PRs #183–#186): cierre DISCHARGE con plantilla custom reparado (motivo de egreso en el flujo templado + approve que lo descartaba en todos los formatos); ai-service endurecido (validación de shape por widget, logs con `extra` visibles, NER `md` con fallback, pytest gateando el build); **frontend con CI de deploy** (build en Actions + rsync in-place, smoke reutilizable/dispatch, favicon modo oscuro); **DR probado de verdad** (restore real desde B2, RTO datos ~15 s, snapshot cifrado diario del `.env` a B2, runbook en `docs/ops/DR_RUNBOOK.md`).
- fix(clinical): **2 rondas de pruebas de usuario del flujo de audio** (PRs #188–#189): formato obligatorio antes de subir/grabar (causa raíz de drafts sin template_id), dropzone bloqueada al grabar, botón "Detener" sin finalizar sesión, guardas de salida cubren subidas, aprobar draft con nota ya guardada vincula en vez de duplicar historia, formato visible en todos los estados, y tarjeta "Sesiones sin registro clínico" en el Dashboard (`GET /appointments/pending-notes`).
- ops: rotación de la llave GPG de backups (#187, expuesta fuera del keyring → `backups@chapni.com`, ambas en LastPass); barrido de 53 audios PHI (128 MB) que el mount `:ro` nunca dejó borrar; contenedor huérfano eliminado; Resend con dominio chapni.com verificado (usuario); audio de prueba de 60 min regenerado y entregado en Descargas.

---

## 2026-07-11

- fix(clinical): **grabaciones de 1 hora funcionan de punta a punta — validado en prod** (PRs #178–#181). Tres bugs mortales encontrados por una prueba E2E real (audio TTS de 57,7 min / 61 MB, subido throttled a 500 KB/s con clon del formato de Marcela): el upload moría a los 15 s (`ReadTimeout` global → deadline de 20 min solo en la ruta de audio, #178), el contexto del request expiraba a los 30 s durante la subida (middleware exento + contexto propio, #179), y el guard anti-alucinación descartaba transcripciones largas reales por frases repetidas legítimas (ahora solo dispara con loop consecutivo o ≥50% duplicadas, #180). Bonus #180: el volumen de audio estaba `:ro` — el borrado post-transcripción nunca había funcionado (PHI acumulado); ya es rw y verificado. Resultado final: Whisper `base` transcribe 58 min en 8m39s y Claude prellena los 7 campos del template custom con shapes de widget válidos. Runbook repetible en `scripts/e2e_audio/` (#181).

---

## 2026-07-10

- fix(clinical): ola de formatos org-only (PRs #167–#171, #175) — picker de sesión ofrece solo formatos configurados por la org (sin "integrado"); `TemplatedSectionsForm` reescrito con los estilos reales de la app (estaba en Tailwind inexistente); el `record_type` se deriva de la etapa del proceso y la plantilla solo pone los campos; selector de tipo en el editor (antes clavado a EVOLUTION); caché React Query limpiada en login/logout (fuga entre tenants); "Cambiar formato" con modal in-app (PWA móvil); aprobar borrador IA con plantilla reparado (faltaba `WithTemplateRepo` en aidrafts).
- feat(admin): orgs de prueba + eliminación total de tenants (PRs #172–#174, migración 000062) — chip/toggle "Prueba" en Tenants, DELETE transaccional de las 30+ tablas + usuarios + DEKs + audios; las orgs reales nunca son eliminables (retención legal Res. 1995/1999); métricas excluyen orgs de prueba.
- feat(patients): búsqueda inteligente sobre PII cifrada (PR #176, migración 000063) — índice `patient_search_tokens` de hashes peppered por prefijo de palabra, sin tildes; `?q=` matchea cualquier palabra del nombre mientras se escribe; backfill vía `rehash` corrido en prod. Todo desplegado (CI + rebuild manual frontend).

---

## 2026-07-09

- fix(frontend): scroll horizontal de página en móvil eliminado (PRs #159, #161) — causa raíz hallada con Playwright contra prod (grids `1fr` creciendo a min-content + tabs sin wrap); `minmax(0,1fr)` en los layouts, `overflowX:hidden` en el `<main>` como respaldo, filas clínicas como tarjetas apiladas en móvil. Verificado post-deploy en las 7 rutas.
- fix(clinical): auditoría 360° **cerrada al 100%** — guarda estructural anti prompt-injection en el pipeline de IA (PR #162, `prompt_guard.py` + tests) y visor de borrador bloqueado cubriendo plantillas personalizadas (PR #163). Limpieza: seed 000040 rebrandeado a Chapni, legal muerto eliminado, correo personal fuera de RFC-001.
- refactor(frontend): reglas react-hooks `set-state-in-effect`/`exhaustive-deps` a `error` (PR #164) — 32 findings refactorizados, 7 disables justificados. Smoke de navegador real contra prod OK.
- ops: branch protection activa en `main` (require PR, enforce_admins, 0 approvals) · password del demo `consultorio-aurora` reseteada a la del seed para diagnóstico.
- feat(marketing): hub `chapni.com/recursos` construido y desplegado (`b9c6fd7` en `../chapni`) — 4 guías/plantillas con schema Article+FAQPage, el multiplicador SEO/GEO pendiente del plan.
- feat(marketing): sistema de content-ops social completo — skill `chapni-social` con auditoría de estado, ritual dominical en batch, log con confirmación de publicación en el repo chapni, sinergia con `/recursos` y política de slots perdidos; rutina cloud dominical (8am Bogotá) que audita el log y reporta a Gmail, probada end-to-end (requirió instalar la GitHub App).
- chore(marketing): perfiles sociales terminados — FB `chapniapp` con NAP completo, LinkedIn corregido (tipo, lema con keywords, About con "la IA sugiere, tú firmas"), banners oficiales generados (`render_banner.py`) y subidos. Posts reales: jueves LinkedIn publicado, viernes IG+FB programado (estreno del perfil de IG).

---

## 2026-07-07

- chore(legal): remoción del correo personal `franciscorojas92@gmail.com` de todo el contenido legal/consentimientos — reemplazado por `legal@chapni.com` (términos, reembolsos, pie de página genérico) y `privacidad@chapni.com` (política de privacidad, ejercicio de derechos habeas data) en `content.ts`, `LegalDoc.tsx`, `TermsPage.tsx`, `PrivacyPage.tsx` y seed `000040_legal_documents.up.sql`. Publicado directo en la BD de producción (nueva versión `2026-07-07` de `privacy` y `terms` en `legal_documents`, replicando a mano el patrón atómico `is_current=false`→`INSERT is_current=true` del endpoint admin, ya que no había JWT de admin a mano) — versiones anteriores quedan archivadas para trazabilidad. Verificado sin ocurrencias del correo en el repo `../chapni`. **Nada de esto está commiteado aún** en `clinic-system`; el footer hardcoded de `TermsPage.tsx`/`PrivacyPage.tsx` sigue pendiente de rebuild manual en el VPS (la BD ya está corregida, el footer visible en vivo todavía no).
- decisión: mantener `hola@chapni.com` como contacto general en vez de cambiar a `info@chapni.com` — ya está fijado como ancla NAP ("idénticos, sin variantes") en `plan-seo-backlinks-geo.md` de `../chapni`, y encaja mejor con el tono cálido de marca que un genérico "info@".
- chore(tools): skill `chapni-social` — añadidas a `strategy.md` reglas de puntuación casual (sin ¿/¡ de apertura), formato crudo (prohibido — y →, usar `...`/`-`), cero negrita, y lista de "tells" de IA a evitar (aperturas genéricas, listas de 3 en 3 con estructura paralela, conectores de ensayo, conclusiones perfectamente cerradas) — debatido con el usuario antes de aplicar. Permiso acotado de imperfección leve/regionalismos bogotanos, solo IG/FB, nunca LinkedIn ni cifras clínicas. **Deploy verificado** (PR #153): CI verde, frontend reconstruido en VPS, bundle en vivo confirmado sin el correo personal.
- chore(legal): eliminado banner "Este documento es un borrador redactado como base informativa..." de `TermsPage.tsx`/`PrivacyPage.tsx`/`LegalDoc.tsx` (PR #154, desplegado) — quedaba raro frente a un cliente real pagando.
- chore(auth): eliminado botón placeholder "SSO Clínica" (disabled, tooltip "Próximamente") + divisor "o continúa con" del login (PR #155, desplegado) — visible en cada login sin funcionalidad real detrás, daba impresión de función rota. "Código de invitación" queda como único botón secundario, ancho completo.
- fix(security) **crítico pre-venta**: `ALLOW_DATA_RESET` era un flag global — con él en `true` en el VPS, cualquier `CLINIC_ADMIN` de cualquier organización (incluyendo clientes reales) veía en Ajustes → Seguridad una tarjeta "Zona de pruebas — limpiar datos" capaz de borrar todos los registros clínicos de su propia organización escribiendo "ELIMINAR". Existía solo para que el smoke test de CI pudiera limpiar el tenant demo tras cada deploy. Fix: el endpoint `POST /admin/reset-clinical-data` ahora exige `organizations.is_internal = true` (columna ya existía desde la migración 000051, usada para excluir orgs operativas del panel de Tenants) — solo la org del operador y la org `demo-clinica` del smoke test pueden ser borradas, nunca una tenant real, sin importar ningún flag de entorno. Se eliminó `ALLOW_DATA_RESET`/`cfg.AllowDataReset` por completo (config, wiring de rutas, handler admin, handler auth) — `/auth/me.data_reset_enabled` ahora refleja `IsInternalOrg` en vez del flag global. `ALLOW_DATA_RESET=false` retirado del `.env` del VPS (ya no lo lee nadie). Encontrado en una auditoría rápida pedida por el usuario ("busquemos algo que diga borrador o no esté listo para producción") antes de empezar a vender.

---

## 2026-07-06

- feat(marketing): primer post de redes para Chapni ("La sesión termina. Las notas, no.") — pieza visual 1080×1080 + copy adaptado a Instagram/Facebook/LinkedIn, basado en copy real de la landing (`Empathy.astro`, `Hero.astro`, `consts.ts`), no inventado.
- chore(tools): skill `chapni-social` creada en `~/.claude/skills/chapni-social/` (fuera del repo `claude-skills`) — estrategia completa (6 pilares, calendario semanal IG 3x/FB 2x/LinkedIn 2x, modo oscuro=emocional/claro=funcional, guía de tono + hashtags por canal), script `render_post.py` (genera la pieza en claro u oscuro con fuentes/logos oficiales embebidos, requiere chromium headless) y `content-log.md` para no repetir gancho/pilar.
- research: primer corte de validación de demanda B2B/clínicas — consulta de solo-lectura a producción confirma que aún no hay señal orgánica (5 orgs totales, casi todas internas/de prueba, 1 solo signup real de tercero hoy). Búsqueda de mercado sí confirma demanda real de software para clínica en Colombia: competidores ya venden a clínicas/IPS (Psiris y MedSystem, colombianos, con RIPS/CIE-10/Res. 1888; Medesk/Clinic Cloud/AgendaPro/Biofile genéricos) e IPS de salud mental reales operan en Bogotá/Medellín — ninguno especializado en psicología+cifrado. Decisión pendiente: entrevistas de validación directa antes del plan B2B completo, o construirlo ya.
- decisión: mantener "Hecho en Colombia" en el copy de marca (señal de confianza local para datos clínicos sensibles); si se avanza a B2B, mantener ambos motores de venta (self-serve individual + asistido para clínicas) en vez de reemplazar uno por otro.
- ops: evaluado instalar Claude Code directo en el VPS de producción para no depender del PC encendido — descartado por riesgo de credenciales en la máquina que sirve tráfico real; recomendado usar Routines (nube de Anthropic) en su lugar.

---

## 2026-07-05

- enhancement(clinical): consolidación de borradores IA multi-toma (PR #146) — cuando una sesión se graba en varias tomas (corte de luz, F5, nueva grabación), el worker de `ai-service` funde la transcripción de la toma `DRAFT_READY` anterior de la misma cita en la más nueva, generando un solo borrador consolidado; las tomas absorbidas quedan `SUPERSEDED` (contenido anulado) con `superseded_by` apuntando a la consolidada. Migraciones 000058 (enum `SUPERSEDED`) + 000059 (`ai_drafts.superseded_by`). `core-api` oculta `SUPERSEDED` de la lista de revisión; frontend redirige el borrador superado al consolidado conservando el contexto de sesión (cita, fecha, tipo de registro).
- ops: pipeline de deploy completo ejecutado y verificado — migraciones aplicadas en VPS antes del restart, CI verde para `core-api` (test+lint+build+deploy+smoke funcional) y `ai-service` (build+deploy), frontend reconstruido manualmente; confirmado en BD (`superseded_by` + enum) y en logs de ambos servicios sin errores.

---

## 2026-07-03 (sesión 26 — dominio + rebrand finales)

**Migración a app.chapni.com (PR #119):**
- Caddyfile multi-dominio: `app.chapni.com` (principal, SPA+API), `api.marcelachapues.com` (legacy, /api vivo para webhooks MP, 308 redirect el resto).
- DNS A (DNS-only en Cloudflare) → VPS; cert Let's Encrypt emitido. `APP_BASE_URL=https://app.chapni.com`.
- Google OAuth redirect URI actualizado en Cloud Console; nuevos enlaces de email (reset, verificación) ya nacen con dominio nuevo.
- Suscripciones viejas MP: verificadas cero preapprovals en API → nada que migrar. El `/api` legacy es fallback indefinido.

**Booking — paleta tenant restaurada (PR #120):**
- Página pública `/book/:slug` volvió a estilos de marcelachapues.com (papel cálido, tinta café, acento terracota), no Chapni indigo. Identidad de la profesional sobre la del producto.

---

## 2026-06-23

- feat(booking): eliminado flujo "Solicitudes web" completo — tabla `booking_requests` (migración 000036), paquete Go `bookingrequests`, rutas `POST /api/v1/public/booking` y `/api/v1/booking-requests`, `BookingRequestsPage`, `BookingPage` (formulario viejo), widget inbox del dashboard y nav item. El flujo `/book/:slug` + MercadoPago (`BookingWizardPage`) queda intacto (`99ba8a0`).
- fix(appointments): casts explícitos `$5::timestamptz`, `$6::integer`, `$7::appointment_modality` en CTE `hold_conflict` — resuelve inferencia de tipo errónea cuando `bookings` está vacía (`9a38fbb`, `1127937`).
- fix(admin): reset de datos de prueba 500 — orden de DELETE corregido: `ai_suggestions` (FK a patients) y NULL de `appointments.rescheduled_to` antes de DELETE (`cab4182`).
- feat(gcal): backfill automático al conectar + limpieza de eventos en Google al desconectar + fix crítico SW Workbox (`navigateFallbackDenylist`) que impedía que el callback OAuth llegara al backend (`82de8b1`–`954a137`).

---

## 2026-07-02 (sesión 25 — auditoría + tareas clínica feedback)

**Auditoría 360° (Fases 1-2):**
- PR #107: eliminado RCE via docker.sock, HMAC-SHA256 en hashes PII + `SEARCH_PEPPER`, cap de upload de audio.
- PR #108: single-flight refresh (no más logout en sesión), localStorage selectivo, claims frescos desde BD.
- Ambas en prod con CI/manual build. Smoke test roto por secret desactualizado (pre-existente).

**Tareas clínica feedback (7 puntos resueltos, `tareas_clinica.md`):**
- PR #113: Punto 1 (borrador duplicable) — RLS fail-closed sin GUC tenant en `Resolve`; Punto 5 (desfase de fecha) — `fmtDateOnly` para render + envío de local desde frontend.
- PR #114: Punto 2 (resumen no se adapta al formato) — `template_id` persistido en BD + devuelto por GET; schema integrado unificado en el job; fallbacks en approve/upload.
- PR #115: Puntos 6-7 (enfoque terapéutico + IA orientada) — `ai_prefs.approach` con catálogo cerrado, validación fail-closed, selector en Settings; prompts parametrizados (plan TCC→enfoque specific, recap/draft con pista, riesgo agnóstico); tests de contrato Python.
- PR #116: Punto 3 (sin ruta a borrador en proceso) — chip topbar `AIDraftIndicator` (ámbar/rojo, polling inteligente), filas clicables en Clínica, "Ir a la cita" en el borrador; Punto 4 (recap no colapsable) — acordeón con estado recordado por paciente en sessionStorage.
- Frontend rebuild (2026-07-02 `6d7fd3c`), core-api rebuild (migración 000050 ejecutada), ai-service rebuild (approaches.py).

---

## 2026-06-30 (sesión 24)

- fix(clinical): borrador bloqueado por cambio de proceso ahora es visible y recuperable — cuando el tipo guardado ya no aplica al estado del proceso clínico, en vez de solo describir que existía, se puede ver de solo-lectura (`RecordSectionsForm ... disabled`) o recuperar con un clic al formato válido actual (`0e53e1d`).
- fix(clinical): condición de carrera dejaba sin efecto el fallback de restauración al servidor — `existingDraftId` llega vía una query async del padre, casi siempre `undefined` en el primer render de `RecordForm`; el efecto de restauración dependía solo de `[storageKey]` y nunca reevaluaba cuando el id real llegaba después. Separado en dos efectos coordinados por refs (`31108ab`).
- **fix(clinical) crítico — pérdida real de contenido en producción**: el sistema completo de autoguardado (Fase 1 local + Fase 2 servidor) se construyó y probó solo contra el formato integrado — nunca contempló `customSections` (el contenido real de un registro creado con **plantilla personalizada**). Para cualquier registro con plantilla, el contenido nunca se guardaba en localStorage ni se restauraba desde ahí; peor, el `draft` vacío-de-siempre se marcaba como "ya restaurado", así que el fallback al servidor (que sí tenía el contenido, vía autoguardado Fase 2) nunca se disparaba — y los ciclos de autoguardado posteriores sobrescribieron el contenido real con el estado vacío del formulario (confirmado en producción: 410→610→139 bytes). Contenido del registro afectado (`8450aa87`, Apertura de la org `aa2cbd1f`) muy probablemente irrecuperable — es el único caso, verificado que ningún otro registro con plantilla (finalizado o no) existe en el sistema. Fix: `customSections`/`selectedTemplateId` ahora viajan en el guardado local; la restauración usa la misma lógica de "¿hay contenido real?" que ya usa el autoguardado, en vez de la mera presencia del objeto. Bug relacionado corregido: `if (lockedTemplateId) return` trataba `''` (formato integrado bloqueado explícitamente) como falsy, pudiendo sobrescribir la elección del profesional con una plantilla por defecto (`2a04904`). La org de Marcela (`aa2cbd1f`) usa plantillas personalizadas para los 4 formatos desde esta sesión — ya no es un caso marginal.
- ops: diagnóstico en producción con logs en vivo + verificación directa de tamaño de `sections_enc` (sin desencriptar) para confirmar la causa raíz sin necesidad de acceder a PHI.

## 2026-06-30 (sesión 23)

- fix(agenda): selector de profesional al agendar como admin enviaba silenciosamente el `user_id` del admin en vez del profesional mostrado en pantalla — `<select>` controlado cuyo `value` inicial (el propio admin) nunca coincidía con ningún `<option>` (admin no tiene rol PROFESSIONAL). Causaba en cascada: citas asignadas al admin, y el profesional real bloqueado de su propio paciente por `NO_PATIENT_ACCESS` (Res. 1995/1999) (`7dc76c3`, `e10237c`). Datos de producción afectados corregidos manualmente.
- fix(agenda): `AssignPatient` (vincular paciente registrado a una reserva de invitado) nunca creaba el `patient_staff_rel` correspondiente, a diferencia de `appointments.Create()` — el profesional de la cita quedaba sin acceso al paciente que él mismo vinculó. Mismo patrón de fix: CTE que inserta `patient_staff_rel` con `ON CONFLICT DO NOTHING` (`b2b3057`).
- fix(clinical): pérdida de contenido al escribir registros clínicos — causa raíz: `main.tsx` recargaba la página de inmediato y sin avisar en cada deploy nuevo del Service Worker (`registerType: 'autoUpdate'` + `controllerchange` → `location.reload()` incondicional). **Fase 1** (`a368d42`): recarga diferida (solo inmediata si la pestaña está oculta) + banner descartable "Hay una versión nueva — Recargar"; `sghcp_sess_${id}` de sessionStorage→localStorage (picker sobrevive pestañas nuevas); aviso explícito cuando un borrador no se puede restaurar (antes se descartaba en silencio); indicador "Guardado hace Xs". **Fase 2** (`1568af3`): autoguardado real en servidor — migración 000048 (`clinical_records.finalized_at`, nullable: NULL = solo autoguardado/nunca finalizado, NOT NULL = registro real); endpoints nuevos `POST .../records/autosave`, `PATCH .../{id}/autosave`, `POST .../{id}/finalize` (separados de `create`/`update` estrictos, cero riesgo de regresión); validación lenient sin `risk_level`/campos obligatorios para los ticks intermedios; `session_number` se asigna en `Finalize`, no al crear el draft (evita huecos `#4→#6` por drafts abandonados); `GetProcessDates` filtra `finalized_at IS NOT NULL` (un Apertura autoguardada y abandonada no debe bloquear una Apertura real); cero auditoría en ticks de autoguardado. `RecordForm.tsx`: intervalo de 25s vía `useRef` (evita closures obsoletos sin recrear el timer por tecla), reconciliación servidor-gana-solo-si-local-vacío. Verificado con SQL real contra Postgres local antes de desplegar (5 casos: draft sin `session_number`, finalize atómico, idempotencia, `Approve` rechaza no-finalizado, `GetProcessDates` excluye abandonados).
- fix(clinical): badge de borrador IA decía "Listo para revisar" aunque la IA no encontró contenido clínico — ahora detecta `draft_content_plain.sections` vacío y muestra "Sin contenido clínico" + botón "Redactar manualmente" (`37f28cf`).
- fix(clinical): picker de formato no aparecía al iniciar sesión (mostraba 7 formatos en vez de 4 — incluía plantillas personalizadas), contenido se perdía al cambiar de pantalla o cerrar pestaña, crash «alcohol is undefined» en `SPAHistoryPanel` al hacer clic en "Sí" de Historia SPA (borradores viejos de localStorage sin los sub-objetos `alcohol`/`tobacco`/`other`) (`929ac9c`, `7f217cf`, `ec85011`, `ac1467a`, `00a7213`, `3bc8217`).
- fix(clinical): PDF exportado mostraba códigos crudos sin traducir («Eje de trabajo: [emotional_processing]», sintaxis de slice de Go) y la vista previa antes de aprobar omitía en silencio cualquier sección estructurada (`session_evaluation`, `task_adherence`, `spa_history`, `clinical_formulation`, `functional_analysis`, etc. — solo mostraba texto plano + examen mental). Vista previa: reemplazada por `<RecordSectionsForm ... disabled />`, el mismo componente que usa "Editar" — ya no puede desincronizarse. PDF: listado `templateSections` completado (~15 claves faltantes), formatters reescritos con las formas de datos reales y mapas de etiquetas en español portados de `constants.ts`; alias `integratedWidgetAlias` traduce claves del formato integrado al widget compartido con plantillas personalizadas sin romper esas últimas. Tests nuevos en `renderer_test.go` (`aec74c3`).
- ops: acceso a la BD de producción vía pgAdmin documentado — túnel SSH a la IP interna del contenedor Postgres en la red Docker del VPS (puerto 5432 no publicado al host, por diseño).

## 2026-06-30 (sesión 22)

- feat(clinical): 3 mejoras arquitectónicas al flujo borrador IA ↔ registro clínico (`ecdeb46`). (1) Migración 000047: `ai_drafts.appointment_id` FK + `clinical_records.session_number SMALLINT` con índice único por paciente. `session_number` se reserva en creación (DRAFT) via CTE atómica — no en aprobación. (2) Exclusión mutua en AppointmentPage: si la cita ya tiene un registro APROBADO, la sección "Borrador IA" muestra mensaje de bloqueo y el backend rechaza el upload de audio (409); si el borrador IA está APROBADO, el botón "Nuevo registro" no aparece. (3) Paso de configuración antes del RecordForm: al hacer clic en "Crear registro" aparece una tarjeta inline con selector de tipo (Apertura/Evolución/Alta/Interconsulta) + selector de plantilla; `RecordForm` recibe `lockedTemplateId` y oculta su propio selector. Badge `#N` visible en la lista de registros vinculados. Deployado: migración 000047 aplicada, core-api rebuild, frontend rebuild en VPS.
- fix(clinical) previas: TDZ crash en AIDraftPage (`pe` minificado) — `getDraftField` movida antes de `isEmptyDraft`; audio re-upload 500 (`O_EXCL→O_TRUNC`); aprobar borrador IA devolvía 500 — `risk_level` añadido al body de aprobación + `RiskLevelSelector` component + mapeo correcto de errores 422/400/500 en handler Go.
- feat(clinical): vista comparativa registro manual vs. borrador IA — cuando el profesional tiene ambos, "Revisar borrador" pasa a "Comparar con IA" y lleva a `AIDraftPage?record_id=...` con layout side-by-side y botones de merge por campo.

- ci(testing): 3 capas de CI añadidas (`51b10ad`, `8a4ea42`). (1) `go test ./...` bloquea el build de Docker — un test roto impide el deploy. (2) `tsc --noEmit` en cada push/PR que toque frontend — captura errores de tipos antes de llegar al VPS. (3) Smoke test de 8 pasos HTTP (`scripts/smoke_test.py`) que corre tras cada deploy: login → healthz → crear paciente → crear cita → crear registro DRAFT → aprobar → verificar APPROVED → reset demo data. Si cualquier paso falla, el pipeline se marca rojo. Secret `SMOKE_PASSWORD` en GitHub.

## 2026-06-29 (sesión 21)

- fix(clinical): 5 bugs adicionales post-grabación (`58fc863`). (1) `V2RecordView` renderizaba `JSON.stringify` para campos widget (formulation_5f, mental_exam, etc.) en registros de plantilla — ahora usa los componentes deshabilitados reales (`WidgetField` exportado de `TemplatedSectionsForm`). (2) Botón "Aprobar historia clínica" en `AIDraftPage` no aparecía cuando el borrador IA estaba vacío (sin contenido clínico) — removido el gate `&& content` para que el profesional pueda editar manualmente y aprobar. (3) Banner de advertencia cuando se guarda un registro mientras la grabación sigue activa — recuerda usar "Finalizar sesión". (4) Interceptor de clic a nivel de documento mientras hay grabación — captura `<Link>/<a>` del sidebar/navbar y muestra el modal de bloqueo (mismo que back/forward del browser). (5) Prompt de recap pre-sesión ajustado (≤2 oraciones por campo, ≤3 focus_points); worker limita historia a últimas 5 sesiones para recap. Desplegado: frontend rebuild + `ai-service` restart en VPS.

## 2026-06-29 (sesión 20)

- fix(clinical/grabación): 6 bugs UX en `AppointmentPage`, `RecordForm`, `RecordTemplatesSection` y `AIDraftPage` (`a6a737f`). (1) página en blanco al cambiar tipo de registro: `switchType` ahora resetea `selectedTemplateId`+`customSections`; (2) página en blanco al iniciar sesión: `scrollTo(0,0)` tras cambio de layout; (3) badge `★ Predeterminada` → badge `Activo` en plantillas, botón estrella eliminado, `★` quitado del dropdown de formatos; (4) segunda grabación falla tras recovery por F5: timestamp en filename evita colisión `O_EXCL` del backend; (5) botón "Guardar cambios" en AIDraftPage renombrado a "Listo" (no persistía en servidor — solo cerraba modo edición); (6) selector de tipo editable en AIDraftPage eliminado (el tipo lo fija el profesional al grabar, no en el borrador); (7) `useBlocker` intercepta navegación de React Router mientras hay grabación activa y muestra diálogo de confirmación. **Frontend pendiente de rebuild en VPS.**

## 2026-06-28 (sesión 18)

- refactor(clinical): reescritura completa de `RecordTemplatesSection.tsx` (`ab50821`) — causa raíz del "feo/desorganizado": era el único archivo del proyecto con clases Tailwind, que no está instalado (todas resolvían a nada; el "modal" `fixed inset-0` caía al fondo de la página en flujo normal). Migrado a inline styles + CSS vars del sistema (`var(--teal)`, `var(--s*)`, `var(--radius)`). Cambios: color morado → teal de marca; "Ver" despliega markdown fuente inline bajo cada tarjeta; "Editar" despliega editor inline bajo la tarjeta; "Nueva plantilla" abre panel inline arriba de la lista; `TemplateCard` con estado `mode: collapsed|view|edit`. Desplegado a VPS (frontend rebuild). TypeScript limpio.
- chore(tools): desinstalada skill `ui-styling` (shadcn/ui + Tailwind CSS) — no aplica al proyecto; el frontend usa solo inline styles + variables CSS propias.
- docs(backlog): instrucciones para crear widgets clínicos personalizados registradas en BACKLOG (3 pasos: componente en `components/clinical/`, case en `WidgetField` de `TemplatedSectionsForm.tsx`, label en `WIDGET_LABELS`).
- docs(research): análisis exhaustivo de evaluaciones psicológicas / MBC — benchmark de SimplePractice/TherapyNotes/CarePaths/Osmind, pruebas de dominio público validadas en Colombia (PHQ-9, GAD-7, PCL-5, AUDIT, DASS-21, HAM-A, ACE: costo $0), plataformas propietarias sin API pública, vacío de mercado confirmado en Colombia. Plan completo en 4 fases guardado en `docs/ai/PLAN_ASSESSMENTS.md`. Pendiente validación con beta testers antes de implementar. (`7d60df2`)

## 2026-06-27 (sesión 17)

- fix(db): 4 plantillas de registro clínico insertadas en org incorrecto (`MarcelaChapues` / fbf1fb3d) en lugar del org real con usuarios (`Marcela Chapués` / aa2cbd1f, 5 usuarios). Movidas al org correcto; STATUS.md corregido con el ID canónico. Root cause: dos orgs con nombres casi idénticos (con/sin acento y espacios).
- feat(settings): rediseño mobile-first de `RecordTemplatesSection` aplicando reglas de `ui-ux-pro-max` — modal del editor como bottom sheet en móvil (`rounded-t-2xl`, `items-end`), header se apila verticalmente en mobile, botones de acción en `TemplateCard` pasan a íconos puros 40px (Star/Pencil/Archive) sin texto, `grid-cols-1` en mobile → `grid-cols-2` en sm+, select de filtro y CTA a ancho completo en móvil, skeleton de carga animado, empty state con ícono visual. Deployed: git pull + `docker run node:20-alpine npm run build` en VPS. (`8983ae1`)
- chore(tools): skill `ui-ux-pro-max` instalada localmente (`~/.claude/commands/ui-ux-pro-max.md` + `~/.claude/skills/ui-ux-pro-max/`) — clonada desde `github.com/nextlevelbuilder/ui-ux-pro-max-skill`.

## 2026-06-28 (sesión 15–16)

- feat(clinical): plantillas de registro clínico definibles por el profesional en Markdown — tabla `clinical_record_templates` (migración 000046, RLS, permisos `record_templates:*`), `clinical_records.template_id`; parser Go `## heading {type}` → `[]SectionDef`; 7 endpoints CRUD + `/parse` preview; `field-widgets.json` catálogo compartido Go/Python/TS; Settings → "Formatos de registro" con editor markdown + preview en vivo + paleta de widgets; `TemplatedSectionsForm` renderiza `text/select/scale/checklist/widget` usando componentes existentes (`MentalExamChecklist`, `RiskSelector`, etc.); `RecordForm` con selector de plantilla, default preseleccionada; `AIDraftPage` usa `TemplatedSectionsForm` con secciones tipadas cuando draft tiene `template_id`; `AppointmentPage` propaga `template_id` a los 3 puntos de `uploadAudio`; worker Python carga schema JSONB y construye prompt dinámico por tipo. Deployado a VPS (migración 000046 aplicada, frontend rebuild). (`aa4ce66`, `32620a7`)
- feat(clinical/pdf): `pdf.RenderInput.TemplateSections []TemplateSectionDef` — cuando el registro tiene `template_id`, el handler carga el schema JSONB (incluso si está archivado, Res. 1995/1999) y el renderer usa etiquetas y orden de la plantilla; render por tipo: `text/select`→MultiCell, `scale`→"N/max", `checklist`→viñetas, `widget`→dispatch (mental_exam, distress_scale, risk, task_checklist, formulation_5f, functional_analysis, task_adherence, session_evaluation, functionality, spa_history); `treatment_plan` y `diagnoses` omitidos (tienen sección propia en el PDF); fallback a formato integrado si template no encontrado. (`2991af2`)

## 2026-06-27 (sesión 14)

- estratégico: análisis SGHCP vs. Startup Playbook (Altman). Sin cambios de código ni deploy. Decisión de founder: congelar nuevas olas de features y validar demanda real con 2-3 psicólogas externas (beta de diseño gratuita, 2 semanas) antes de fijar precio y vender. Cuello de botella identificado: distribución (0 demos a extraños), no producto. Siguiente acción no-técnica: contactar hoy a las 2 colegas disponibles.

## 2026-06-27 (sesión 13)

- feat(admin): pestaña "Plataforma" en SuperAdminPage — gate de contraseña → config de plan MP (amount/reason/webhook_enforce) editable desde UI; rotación de `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` desde UI con cifrado AES-256-GCM en tabla `platform_settings` (migración 000045); billing handler lee config de BD con cache 5min (fallback a env vars). Nav sidebar simplificado para SYSTEM_ADMIN: solo "Operador SaaS" + "Configuración", sin nav clínico (`c6191d3`).

## 2026-06-27 (sesión 12)

- fix(booking): `orgWebhookSecret()` usaba `h.pool.QueryRow` sin `app.current_org`, RLS bloqueaba la fila y retornaba vacío — envuelto en `dbctx.WithOrgScope`; `MP_WEBHOOK_ENFORCE=true` activado en VPS `.env` (`8580e05`). Root cause confirmado: la función comentaba "bypasses RLS intentionally" pero el comportamiento real era que RLS la bloqueaba silenciosamente.
- feat(settings): nueva pestaña "Integraciones" visible solo para CLINIC_ADMIN, agrupa MercadoPago y WhatsApp/Meta Cloud API; gate de contraseña antes de mostrar credenciales — backend `POST /api/v1/auth/verify-password` (sin efectos secundarios); frontend locked→unlock con password antes de mostrar los cards (`829d4ec`). WhatsApp movida de Notificaciones, MP movida de Tarifas.
- operativo: cargo Meta Billing COP $90.675 pagado; pendiente confirmar desbloqueo de API y configurar nombres de plantillas en Ajustes → Integraciones.

## 2026-06-27 (sesión 11)

- feat(booking): webhook secret por tenant — migración 000043 añade `mp_webhook_secret_enc`+`mp_webhook_secret_key_src` a `org_payment_config`; `orgWebhookSecret()` en booking handler descifra y usa el secret del tenant, con fallback al global; `PUT /org/payment` acepta `webhook_secret` y lo cifra (`506e25f`). Descubrimiento: el slug `marcelachapues` apuntaba a org distinto del que tenía el payment config — copiado al org correcto (`fbf1fb3d`). Prueba real end-to-end: pago COP $1.000 procesado, webhook llegó, cita creada `SCHEDULED` ✅.
- feat(booking): `items.description` + `payer.first_name`/`last_name` en preferencia MP siguiendo recomendaciones de portal de calidad — mejora tasa de aprobación (`c45a264`).
- feat(orgs): badge PRUEBA/PRODUCCIÓN en Ajustes → Tarifas → Pagos en línea — migración 000044 columna `mp_token_mode` (test|live); backend detecta prefix `TEST-`/`APP_USR-` al guardar; frontend muestra badge de color; el admin cambia de modo pegando el token que quiera (`d5c7b58`).
- operativo sandbox MP: para probar con credenciales TEST el buyer debe crearse en el mismo portal de MP del vendedor (cuentas de prueba aisladas por app). Recomendación: hacer pruebas reales con montos bajos ($100–$1.000) y reembolsar desde el portal.

## 2026-06-26 (sesión 10)

- fix(booking): webhook MP de rechazo (OTHE/PSE fallido) borraba el booking inmediatamente — si el usuario reintentaba con APRO en el mismo checkout de MP, el webhook de aprobación no encontraba el booking y la cita nunca quedaba confirmada. Fix: `DELETE` → `UPDATE hold_expires_at = NOW()`: slot libre para otros pero registro existe para el retry (`8be3337`).
- fix(booking): retry con APRO verificado end-to-end — cita creada, WhatsApp `cita_confirmada` disparado.
- fix(whatsapp): plantillas Meta en Colombia usan código `es_CO`, no `es`. Default del UI y fallback actualizados (`fdbefd8`). BD parcheada directamente (`UPDATE org_whatsapp_config SET lang = 'es_CO'`).
- fix(orgs): `PUT /org/whatsapp` retornaba 500 — `repository.go` usaba `r.pool` directo (sin tenant scope RLS). Corregido con `dbctx.From` en los 4 métodos de request context (`524de84`). Desplegado vía CI.
- operativo WhatsApp: cargo COP $90.675 pendiente en Meta Billing — API Cloud bloqueada hasta pagar. No es sandbox; todo mensaje vía Cloud API se cobra desde el primero (desactivar en Ajustes durante pruebas futuras).
- feat(booking): pagos por tenant — migración 000042 `org_payment_config` (mp_access_token_enc cifrado AES-256-GCM, session_price INTEGER, RLS); `GET/PUT /org/payment`; booking handler carga token del tenant vía `paymentFor()` y lo usa en CreatePreference + GetPayment (webhook lee `?org=<orgID>`); token global `MP_ACCESS_TOKEN` queda exclusivo para suscripciones SaaS. UI: tarjeta "Pagos en línea (MercadoPago)" en Ajustes → Tarifas (`e1e6b02`). Migración aplicada en VPS.

## 2026-06-26 (sesión 9)

- fix(clinical): layout compacto de `AppointmentPage` mostraba "Finalizar sesión", "Pausar", "Reanudar" y "Grabar" a CLINIC_ADMIN puro — añadido `!pureAdmin` a todos los controles del modo escritura sticky (líneas 726-756). El layout principal ya tenía el guard desde sesión 8 (`8757a58`). Desplegado: frontend rebuild en VPS.
- fix(clinical): break-the-glass almacenaba la justificación en `sessionStorage` — una vez justificado en una visita, el modal no volvía a aparecer en la misma pestaña del navegador. Eliminado el cache de `sessionStorage` de `clinicalAccess.ts` (`getClinicalAccessReason`/`setClinicalAccessReason`), `ClinicalGate`, `ClinicalRecordPage` y `PatientProfilePage`. La razón ahora vive solo en memoria del componente: desbloquea la página actual pero se olvida al navegar (`1d5d85d`). Desplegado: frontend rebuild en VPS.
- producto: plan comercial del SaaS — nombre (candidatos: Sinapsis/PsiCore/Therapio/Clinova/Vínculo), pricing (Esencial $19/mes, Pro $35/mes, Clínica $28/mes/prof.), pros/contras, estructura landing page y copy propuesto. Landing page y sistema de diseño diferidos a repo separado (BACKLOG → Marca).

## 2026-06-26 (sesión 8)

- feat(clinical): acceso clínico need-to-know + gobernanza (`31ef04e`) — migración 000041 backfilla `patient_staff_rel` desde `appointments` (PRIMARY_THERAPIST) y `clinical_records` (SUPERVISING para cosignatarios); appointment creation auto-upsert en `patient_staff_rel` vía CTE atómico. Nuevo paquete `shared/clinicalperm` (IsAssignedToPatient, HasClinicalRole, IsSysAdmin). Enforcement en `GET /patients/{id}/records`, `GET /clinical-records/{id}`, `GET /patients/{id}/diagnoses`, `GET /patients/{id}/treatment-plans`: PROFESSIONAL/INTERN sin fila activa en patient_staff_rel → 403 `NO_PATIENT_ACCESS` (sin workaround — Res. 1995/1999 Art. 14); SYSTEM_ADMIN bypass; CLINIC_ADMIN puro mantiene break-the-glass existente. Frontend: addenda ocultas para admin puro; "Iniciar sesión", "Finalizar sesión" y controles de grabación (Grabar/Pausar/Reanudar) ocultos para admin puro; PatientProfilePage tab Historia muestra "Sin acceso" para profesional no asignado; bug fix grabación: tras fallo de upload el banner de recuperación aparece inmediatamente recargando chunks de IndexedDB (sin necesitar F5). Migración 000041 aplicada manualmente en VPS (3 filas generadas). Deploy vía CI push a main.

## 2026-06-26 (sesión 7)

- feat(clinical): rediseño de tabs en perfil paciente (`efdda71`) — separación estricta admin/clínico. Tabs renombrados: "Historial de consultas" (mixto) → **Agenda** (solo citas, libre para todos) + **Historia clínica** (registros+Dx+Plan, con `ClinicalGate` para admin puro). Break-the-glass refinado: la lista de registros (metadata) no requiere justificación; el gate actúa solo al abrir contenido confidencial (SOAP en `ClinicalRecordPage`, DiagnosesPanel, TreatmentPlanPanel). Razón del admin se persiste en `sessionStorage[btg_reason_{patientId}]` para no preguntar dos veces en la misma sesión del navegador; `ClinicalRecordPage` la lee vía `?patient_id=` query param. `RiskBanner` (IA) y botón "Sesión pasada" ocultos para CLINIC_ADMIN puro. Backend: `isAdminOnly` gate añadido a `GET /patients/{id}/diagnoses` y `GET /patients/{id}/treatment-plans`; quitado del `GET /patients/{id}/records` (lista). Nuevo helper `lib/clinicalAccess.ts` (`isPureAdmin`, sessionStorage). Desplegado: CI build `efdda71`, frontend rebuild en VPS, core-api pull de ghcr.io.

## 2026-06-24 (sesión 6)

- feat(governance): gobernanza de acceso y CMS legal — 4 partes en un commit (`ccae867`). (A) Usuario desactivado recibe 403 con mensaje en español al login; la verificación de inactividad ocurre DESPUÉS del bcrypt (no filtra existencia de cuenta). (B) Eliminación de miembro del equipo requiere tipear el email exacto (`ConfirmByTextModal`); usuarios inactivos muestran badge + selector de rol + botón "Reincorporar" tanto en Settings como en SuperAdmin. (C) Migración 000039 quita permisos de escritura clínica a CLINIC_ADMIN (solo-lectura pura); break-the-glass: admin sin perfil profesional debe justificar acceso a HC via `X-Access-Reason` header — razón queda en `audit_log.metadata` + `user_roles_snapshot` (Ley 23/1981, Res. 1995/1999); `BreakGlassModal` en `PatientProfilePage` y `ClinicalRecordPage`. (D) Tabla `legal_documents` (migración 000040, seed Markdown con versión 2026-06-24); API pública `GET /api/v1/legal/documents/{type}` + `PUT /api/v1/admin/legal/{type}` (SYSTEM_ADMIN); `TermsPage`/`PrivacyPage`/DPA modal leen desde BD; componente `Markdown.tsx` (~50 líneas, sin dependencia); editor con preview en pestaña "Legal" de SuperAdminPage. Desplegado: migraciones 000039+000040 aplicadas, core-api rebuild, frontend rebuild.

## 2026-06-24 (sesión 5)

- feat(legal): cumplimiento go-live Colombia (`666ba06`) — páginas públicas `/legal/terminos` y `/legal/privacidad` (borradores Ley 1481/Ley 1580, contenido en español versionado como `LEGAL_VERSION`); checkbox de aceptación obligatorio en `/signup` con links a ambas páginas; migración 000038 añade `terms_accepted_at`, `terms_version`, `dpa_accepted_at` a `users`; backend valida `accepted_terms=true` y persiste `terms_version` como audit trail; nuevo endpoint `POST /auth/accept-dpa`; `/auth/me` expone `dpa_accepted`; modal DPA bloqueante en AppShell para CLINIC_ADMIN/PROFESSIONAL sin aceptación previa (Contrato Encargado-Responsable Ley 1581); banner IA reforzado en `AIDraftPage` con texto de responsabilidad clínica (Ley 23/1981). Desplegado: migración aplicada en VPS, core-api pull, frontend rebuild.

## 2026-06-24 (sesión 4)

- feat(admin): CPU + backup status en tablero sistema (`acd74d3`) — CPU vía `/proc/stat` (muestreado 150ms), card con barra de color; backup: script escribe `/var/lib/sghcp/last_backup_ok`, container lee vía volume mount `:ro`, card con último timestamp + tamaño + alerta si >26h; tenant list expandible (▼) con conteo usuarios/pacientes y acciones Suspender/Cancelar/Extender-trial. Fix: `org_id` → `organization_id` en JOIN (`858c445`).
- feat(users): eliminar miembro del equipo (`4642d7b`) — soft delete (`is_active=false` + remove `user_roles`); guards: no self, no último admin; `DELETE /api/v1/users/{id}` (CLINIC_ADMIN, permiso `users:deactivate`); `GET/DELETE /admin/orgs/{id}/users/{uid}` (SYSTEM_ADMIN, sin guard de último admin); botón ✕ en TeamCard (Settings) + panel `OrgUsersPanel` en SuperAdmin expandido. Decisión: no acceso a datos clínicos por tenant (legal + trust).

## 2026-06-24 (sesión 3)

- feat(admin): tablero de monitoreo del sistema para SYSTEM_ADMIN (`74319a6`–`cc0b1ff`) — nueva pestaña "Sistema" en SuperAdminPage con: disco+RAM (barra de color verde/amarillo/rojo), BD (tamaño, pool, top tablas), PostgreSQL avanzado (buffer hit %, deadlocks, commits, rollbacks, slow queries, locks en espera), Redis (ping, memoria), Tenants (badges por estado), Cola IA; alertas server-side con recomendaciones de upgrade y botón "¿qué hago?"; panel Mantenimiento con 3 acciones Docker seguras (builder_prune, image_prune, system_prune) ejecutables desde la UI con confirmación y output en tiempo real; tooltips en cada métrica; refresh automático cada 10s con countdown.
- ci: migrar build de `core-api` a GitHub Actions (`398bf95`) — el VPS ya no compila Go localmente; Dockerfile añade `docker-cli`; docker-compose usa `image: ghcr.io/...`. Libera ~25 GB de build cache acumulado (disco 100%→40%). Cron semanal actualizado a `docker builder prune -af`.
- fix(admin): slice nil → JSON null en alertas vacías (`109ac43`).
- decisión arquitectura: confirmado multi-tenant compartido (no VPS por cliente). Prometheus+Grafana diferido al backlog para cuando haya clientes reales pagando.

## 2026-06-24 (sesión 2)

- chore(debt): limpieza de code-debt completa (`ac2c501`) — eliminado módulo Evaluaciones (852 líneas, sin backend y sin planes de implementación), eliminado StubPage muerto, quitado formato "Con viñetas" de la UI de IA (solo structured/narrative soportados). Bloqueo de pantalla ahora persiste config real por usuario en localStorage (`sghcp_lock_enabled/minutes_${userId}`) vía nuevo `lib/screenLock.ts`; AppShell reacciona sin reload via custom event `sghcp-lock-config`. Nuevo sweeper `internal/aidrafts/retention` en core-api: goroutine que cada 6 h borra `ai_drafts` no aprobados según `ai_prefs.data_retain` del profesional (default 180 días). Desplegado: core-api rebuild + frontend rebuild en VPS.

---

## 2026-06-24

- feat(gcal): integración Google Calendar completa — OAuth per-profesional (HMAC state, tokens cifrados con `km.SealSecret`), tablas `professional_google_calendar` + `appointment_gcal_events` (migración 000035), sync SGHCP→Google en create/cancel, backfill automático al conectar, limpieza de eventos al desconectar, `GoogleCalendarCard` en Settings. Bug crítico resuelto: service worker Workbox interceptaba la navegación al callback OAuth (`navigateFallbackDenylist: [/^\/api\//]`). Dockerfile Go 1.22→1.25 (`f416010`–`954a137`).
- feat(booking): email a admins al apartar reserva diferida (`BookingDeferredAdmin`) + guard anti doble-booking en `confirm()` con estado `PAID_CONFLICT` y notificación de conflicto a admins (`e44b008`).
- feat(agenda): recordatorios WhatsApp 24h/2h + confirmación al reservar via Meta Cloud API; 3 plantillas HSM en revisión con Meta (`ae34b68`).
- feat(recording): grabación de sesión sobrevive F5 — IndexedDB store `recordingStore.ts` (DB `sghcp_recordings`), chunks por appointmentId, banner de recuperación al remontarse, `beforeunload` guard.
- fix(admin): reset de datos de prueba fallaba 500 por FK de `ai_suggestions→patients` (no estaba en delete order) y `appointments.rescheduled_to` auto-referencial; ambos corregidos (`cab4182`).
- fix(agenda): el ENUM `ai_draft_status` no comparaba contra `text` (500 en endpoint de drafts) — cast `d.status::text` (`ce10cd6`). Citas no aparecían en la agenda porque Dashboard/AgendaCalendar filtraban por `staff_id: user.user_id` — quitado el filtro, ahora se ven todas las citas del org. AppointmentPage mostraba el usuario logueado en vez del profesional de la cita — ahora resuelve `staff_id` contra los usuarios del org (`1db26e4`).
- feat(ai): preferencias de IA persistentes por profesional (estilo `structured`/`narrative` + tono `formal`/`neutral`/`plain`) — migración 000037 (`professional_profiles.ai_prefs` JSONB), endpoints `GET/PUT /me/professional-profile/ai-prefs`, prefs viajan en el job de Redis → worker → prompt dinámico de Claude (`_TONE_INSTRUCTIONS`, `_STYLE_INSTRUCTIONS`). Frontend carga/guarda vía `saveRef` (`5dc3b0e`).
- feat(settings): limpiada la sección IA — eliminados controles decorativos (generación automática, umbral de confianza, idioma); auditoría IA deja de ser toggle (siempre activa, badge "Siempre activo", Res. 1995/1999); retención de borradores no aprobados ajustada a 6m/1a/2a con nota legal (`3e96211`).
- chore(infra): **incidente de disco resuelto** — disco al 100% (38 GB), PostgreSQL en crash loop (`could not write lock file: No space left`). Liberados 4.6 GB (journald 1.1 GB + btmp brute-force SSH + build cache 3.9 GB), PG recuperó WAL sin pérdida, core-api reiniciado para re-resolver DNS de postgres. Prevención: journald capado a 200 MB permanente. Capa 1: cron semanal `docker prune` + alerta email diaria si disco >80% (probada, funciona). Capa 3: ai-service de build local → `ghcr.io` vía GitHub Actions (whisper.base→tiny, spaCy lg→sm: imagen ~5.1 GB→~1.5 GB), worker borra el audio tras transcripción exitosa (PHI + disco) (`87489b0`, `c213763`).

## 2026-06-23

- feat(patients): exportar lista completa a CSV — GET /patients/export.csv (UTF-8 + BOM, columnas: Nº HC, apellidos, nombres, doc., teléfono, correo, fecha nacimiento, género, fecha apertura); botón "Exportar CSV" en barra superior de PatientsPage; descarga via fetch+blob con JWT (`adfe153`).
- feat(auth): cambiar correo admin (PATCH /auth/me/email + /verify-email-change con token Redis 1h, invalida sesiones) + gestión de roles del equipo (GET /users, PATCH /users/{id}/role — guard self-change y SYSTEM_ADMIN); frontend: card "Cambiar correo" en Seguridad + tabla Equipo con dropdown de rol por fila en Usuarios; fix deploy: `docker compose restart` no recompila binario Go — usar `up -d --build` (`a9048ab`).
- fix(billing): comprobante PDF mostraba UUID corto (A77204AB) en vez de número F-000001 — `invoiceRef()` helper en `receipt.go` (`8891f0c`). fix(admin): "limpiar datos" fallaba 500 por FK de payments/invoices/bookings sobre appointments — añadidos 3 DELETE en orden correcto (`1de3a0a`).
- feat(billing): pagos de reservas online integrados en tab Facturas existente — filas con badge "Reserva", modal de detalle (invitado/correo/teléfono/fecha/modalidad/monto/método/vencimiento), filtro de estado sincronizado, `hold_expires_at` visible en fila para pendientes. Fix 500 por `modality::text` (enum vacío). Fix SW: listener `controllerchange` en `main.tsx` para propagar deploys automáticamente (`823107e`–`2377272`). Bloqueo atómico de citas internas sobre holds diferidos activos (CTE sin TOCTOU, `6ef20b2`).
- feat(booking): soporte completo de pagos diferidos — Efecty/cash permanece con hold extendido hasta expiración del cupón (capeado a `scheduled_at − 2h`); webhook `pending`/`in_process` extiende hold y guarda voucher_url; migración 000033 (`payment_voucher_url`). Email "Tu horario está apartado" al confirmar pago diferido (plantilla en `notify.BookingVoucher`). Fix crítico RLS: `BusyHolds` consultaba `bookings` sin scope desde migración 000032, los holds no excluían slots en disponibilidad pública (`291c743`).
- fix(booking): página de retorno con 5 estados (confirmada/apartada/fallida/procesando/confirmando); 404 = fallo definitivo (PSE rechazado ya no queda colgado en "Confirmando"); `?slug=` en back_url para links de retry correctos; quitados `payment_methods` y `expiration_date_to` de la preferencia MP (bloqueaban PSE en Colombia) (`1515290`, `291c743`, `e03d511`, `448abed`).
- PSE en sandbox: `hasChallengeUrl: false` con usuario vendedor (no bug de código); en producción con clientes reales funciona correctamente.
- feat(clinical): Nº de HC (`HC-000001`) y fecha de apertura incluidos en el PDF exportado — header del documento y grilla Sección I (`7fdaff7`). Ola 3 IA verificada completa en VPS (recap, borrador SOAP, plan TCC, detección de riesgo, ai-service activo).

## 2026-06-22

- feat(rls): RLS por tenant en las tablas de flujo público (`bookings`, `booking_requests`, `consent_sign_tokens`, `consent_templates`) — migración 000032 con resolvers `SECURITY DEFINER` (`booking_org`/`consent_token_org`) para los lookups por id/token del webhook de pago y la firma. `dbctx.WithOrgScope` para handlers públicos; `bookingrequests`/`booking` convertidos a scope; provisioning de signup fija scope al sembrar plantillas; arregla bug latente (firma pública leía `patients` con FORCE RLS sin scope). Cierra el bloqueante RLS. Verificado en prod (fail-closed, resolver, write/read con scope, cross-org rechazado) (`9adcb1c`).
- feat(booking): aceptación obligatoria de la política de reembolso/cancelación antes del pago — el wizard público muestra la política en el paso de datos con checkbox obligatorio (botón deshabilitado hasta aceptar); el checkout rechaza sin `policy_accepted` y sella `policy_accepted_at` para auditoría (migración 000031). Cierra **B6** (bloqueante de 1.0.0) (`eb62f60`). Desplegado.
- fix(billing): firma de webhook MP obligatoria — quitado el fail-open de `VerifyWebhook` (con secreto vacío ahora rechaza) y `config.Load` exige `MP_WEBHOOK_SECRET` cuando hay `MP_ACCESS_TOKEN`. Cubre webhooks de suscripción y de booking. Cierra **B-11** (bloqueante de 1.0.0); secreto añadido al `.env` del VPS y core-api rebuild (`07ae88f`).
- feat(patients): Nº de HC consecutivo por tenant (`patient_code`, patrón `invoice_number` con advisory lock), asignado al registrar el paciente; Fecha de apertura = `created_at`. Migración 000030 con backfill (lift FORCE RLS). Franja "I. Datos de identificación" muestra `HC-000001` + Fecha de apertura — cierra Sección I del Formato 1 (`7e2e132`). Desplegado (migración + core-api + frontend).
- fix(agenda): el popover de agendado rápido detecta solapamiento con citas del día (`slotIsBusy` sobre `byDay`) y muestra estado "ocupado" en vez de proponer una hora que luego chocaría (`8b38fd1`).

---

## 2026-06-21

- Pantalla de cita: workspace de redacción dirigido por estado — en sesión en curso/recién finalizada el `RecordForm` pasa a columna protagonista, con barra de sesión sticky (identidad, timer, grabación, Finalizar) y Recap/Borrador IA como sidebar; estados agendada/futura/invitado conservan el layout previo (`a7752a0`).
- La identificación del paciente deja de ocultarse en modo redacción: se reubica como franja horizontal de ancho completo (= Sección I "Datos de Identificación" del formato), con consentimiento inline (`98346f0`).
- feat(patients): Estado civil, Escolaridad y Ocupación — campos faltantes de la Sección I; blob cifrado `demographics_enc` (migración 000029), wired en repo/service/handler/dto + forms + franja (`7687435`). Todo desplegado al VPS (migración aplicada, core-api rebuild).
- Bugfixes cita+agenda (`f814f52`, `311479a`): (1) 422 al guardar registro — el allow-list de `templates.go` quedó atrás de F1/F2 (faltaban `medical/psychological/psychiatric/pharmacological_history`, `achievement_indicators_other`, `techniques_other`, `tasks_assigned`); (2) horas de la agenda derivadas del horario configurado (antes 7–20 fijo) y expandidas a las citas; (3) agendado rápido al clic en hueco, solo en slots disponibles (`timeSlotsFor`), preselecciona hora en nueva cita; (4) validación hace scroll al campo faltante; (5) tipos de registro acotados por estado del proceso (abierto→Plan/Evol/Alta, cerrado→Apertura), cambio de formato con confirmación + borrado; (6) grabación/IA apunta al tipo seleccionado. Desplegado (core-api rebuild + frontend).

---

## 2026-06-20

- Formatos clínicos F1–F4 reescritos para coincidir exactamente con los documentos físicos de Marcela — layouts lineales sin columnas, orden exacto de secciones, sub-campos contextuales (PRs #101–#104).
- Fix crítico: white-screen crash por arrays `undefined` en borradores stale de localStorage; fix comprehensivo en FunctionalAnalysisPanel, MentalExamChecklist, ClinicalFormulation5F y RecordSectionsForm (PRs #105–#106). Todo desplegado al VPS.

---

## 2026-06-19

- Lote A (formulario paciente): scroll-to-error en validación, select tipo documento, parentesco en contacto emergencia, labels "Primer/Segundo apellido" — `NewPatientPage.tsx` y `EditPatientModal.tsx` (#92–#93).
- Lote B (página cita): reorganización en 4 bloques + banner de advertencia encima de los botones de acción — `AppointmentPage.tsx`.
- Lote C (calendario): cancel + reagendar inline desde popup del calendario — `AgendaCalendar.tsx`.
- fecha nacimiento + teléfono obligatorios en formulario nuevo paciente (#94).
- SlotPicker: endpoint privado `GET /api/v1/me/availability` (JWT, usa orgID+staffID del token); componente visual de franjas disponibles — días scrolleables + chips de hora; integrado en AppointmentPage y AgendaCalendar (#95).
- fix(reagendar): citas CANCELLED ocultas del timeline del calendario; después de reagendar desde la página de cita navega al Dashboard en vez de a la nueva cita (#96).
- Reestructuración del contenedor de contexto: STATUS.md canónico, CHANGELOG.md, skill `actualizar-contexto` mejorada.

---

## 2026-06-18

- BC-6 Facturación completo (#80–#90): tarjeta/PSE/Efecty/Nequi, período semana/mes/3meses/año, cards módulo, filtro período global, balance-por-paciente, gráfico ingresos correcto. Migraciones `000024`/`000025`/`000026`. #91 hotfix RLS en consents/ai_drafts/patient_assessments.
- Rebuild `ai-service` imagen en VPS (`Dockerfile.patch` #79).

---

## 2026-06-17

- #69–#73: BC-6 multi-tenant habilitado; postgres/redis/core-api/ai-service en VPS producción.
- #65–#68: Integración MercadoPago — endpoints + webhook + PSE/Efecty/Nequi/tarjeta.
- #60–#64: BC-6 backend — tablas `invoices`/`payments`/`billing_rates`, permisos `billing:*`.

---

## 2026-06-16

- #48–#59: BC-6 frontend skeleton + Fases MT1–MT5 (multi-tenant): RLS policies en todas las tablas del sistema.

---

## 2026-06-10 — 2026-06-15 (resumen)

- `v0.5.0` tag: historia clínica psychology-native, consentimientos digitales, plan terapéutico, PDF export, audit log.
- Ola Booking: `/book/:slug` público, pago MP único, emails automáticos 24h/2h, agenda con pago visible.
- Ola 2 SaaS: multi-tenant RLS, signup self-serve, trial 30 días, gating 402, cobro MP suscripción mensual.
- Ola 3 IA iniciada: recap pre-sesión + plan sugerido con Whisper + Claude Sonnet.
- Migración inicial a VPS Hetzner (pre-wipe backup: `pre_wipe_20260616_1749.dump`).
