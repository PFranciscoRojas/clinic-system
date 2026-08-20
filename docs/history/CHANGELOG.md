# CHANGELOG — Historial compactado de trabajo SGHCP

> Append-only. Días de >30 días colapsan a resumen mensual. Para roadmap y bloqueantes ver `docs/project/STATUS.md`.

---

## 2026-08-20

- feat(ops): **la vigilancia pregunta si se puede entrar, no si el proceso vive** (PR #296). `scripts/monitor.sh` corre en el host cada 5 minutos y se registra como un canario `PROFESSIONAL` de solo lectura: `/healthz` → `POST /auth/login` → `GET /auth/me` → `GET /patients`. El motivo está fechado: durante todo el encierro del 18 de agosto `/healthz` respondió 200, porque el proceso estaba perfectamente vivo y lo que estaba cerrado era la puerta. La credencial del canario vive en `/etc/sghcp/monitor.env` (600) y **no** en el `.env` de los contenedores, para que la llave del vigilante no esté dentro de la aplicación que vigila. Todo el juicio del script son funciones puras probadas en `monitor_test.sh` (47 casos, dentro de `make verify`); los tres primeros tests salieron rojos y destaparon un fallo real de diseño — un `000` corriente abajo tapaba la causa, así que ahora decide la primera etapa que no sea 200. Además: healthchecks de compose para `core-api` y `ai-service`, y `docs/ops/MONITORING.md`.
- fix(ops): **el vigilante llegó al servidor sin permiso de ejecutarse** (PR #297). `monitor.sh` se commiteó `100644`; mientras el VPS tuvo la copia subida a mano no se notó, y al hacer `git pull` tras mergear #296 cron pasó a recibir `permission denied` cada cinco minutos. El vigilante no se cayó, nunca arrancó, y el único sitio donde se habría quejado es el log que se quedó vacío — que se lee igual que "todo bien". La causa: este repo tiene `core.fileMode = false`, así que git no mira el modo del disco y `make verify` seguía verde con la copia de trabajo conservando el bit que el índice no tenía. `scripts/check_exec_bits.sh` lo pinea contra el índice y salió rojo con **cuatro** archivos: `run_fuzz_test.sh` y `run_mutation_test.sh` llevaban así desde que se escribieron, y `verify.sh` también los ejecuta por ruta.
- docs(ops): el **dead man's switch** pasa de 🔴 sin iniciar a ⏸️ diferido a propósito hasta tener usuarios reales (PR #298), con el diseño escrito en `BACKLOG.md` para no volver a derivarlo: el VPS lata contra un receptor externo, y el `/fail` de esa lata sería además un segundo canal de aviso independiente de Resend — hoy, si Resend rechaza el correo, la queja se va al log que nadie lee.
- ops: siete worktrees eliminados (`wt-fix`, `wt-mem`, `wt-mut`, `wt-lanes` y tres de agente). Se verificó commit por commit que su contenido ya estaba en `main` vía squash (#269, #275, #277, #130/#193/#245); los diffs sin commitear de los tres de agente quedaron respaldados en `$BASE/worktree-agent-diffs-2026-08-20.patch`. `wt-fix` tenía tomado `main`, que era lo que hacía fallar el checkout local en cada merge.

---

## 2026-08-07

- feat(admin): **embudo de activación** en la consola de operador (PR #256, migración `000073`) — ocho pasos derivados de datos que ya existían, sin pixel ni tabla nueva: cuenta creada, correo verificado, puesta en marcha, primer paciente, primera cita, primera historia firmada, primer borrador IA, pago. Los pasos **no** están anidados a propósito (quien se salta el onboarding y registra un paciente cuenta igual) y la historia cuenta al **firmarse** (`finalized_at`), no al cerrarse. Escribir el escenario de aceptación destapó un bug vivo desde la migración 000018: los endpoints de admin consultan sobre el pool crudo sin `app.current_org`, así que con FORCE RLS **la consola llevaba meses mostrando "0 pacientes" en todos los tenants** y el panel de salud la cola de IA siempre vacía. El escenario falló primero en rojo (`la consola muestra "Consultorio Nuevo" con 0 pacientes y tiene 1`) y el arreglo no toca la política: dos funciones `SECURITY DEFINER` de solo agregados (`platform_org_activation()`, `platform_ai_draft_status()`), que no añaden privilegio alcanzable porque quien ya ejecuta SQL como `sghcp_app` puede fijar el GUC y leer las filas igual.
- enhancement(admin): el embudo **dice cuándo no se puede leer y de dónde salió el dinero** (PR #258, migración `000074`) — aviso y atenuación por debajo de `min_readable_cohort` (5), porque con una cohorte de uno el "100%" es aritmética, no información; y el paso de pago partido en `charged`/`checkout`/`manual` con la evidencia que una activación manual nunca escribe (`last_billing_payment_id`, `provider_customer_id`). El caso `checkout` existe porque el preapproval de MercadoPago activa sin escribir id de pago: sin él, un suscriptor nuevo se leería como "activado a mano" durante un mes. Salió un dato: **Marcela figura como `checkout`, no `charged`** — suscrita, sin ningún cobro registrado.
- enhancement(auth): el **registro de accesos pasa al pie de Seguridad** (PR #257) en vez de ser entrada propia con acento rojo junto a Seguridad — se consulta cuando pasó algo, no se configura. `/settings/audit` redirige para no romper marcadores.
- ops: la cohorte real quedó en **una organización** tras marcar la org demo de la guía y `marcelachapues` como `is_test` y **eliminar Alma Vélez**, el único signup externo que hubo (canceló sin registrar un paciente). En `../chapni`, la guía se enlaza ahora desde el cuerpo del home y de `/precios`, no solo desde nav y pie (`fa4e665`, desplegado).
- ci: el job `fuzz` falló una vez con `context deadline exceeded` en `FuzzFoldTokenIsIdempotent`, sin input fallido — el objetivo se queda en 0 ejecuciones/seg y no termina dentro de los 15 s de presupuesto. Pasó al re-ejecutar; anotado en BACKLOG porque `fuzz` es check requerido y "volver a correrlo" es la costumbre que vuelve invisible un fallo real.

---

## 2026-07-27 — 2026-08-07 (guantelete de pruebas, reconstruido del git log)

- **PRs #234–#255.** Cobertura con trinquete (`scripts/check_coverage.sh`, pisos por paquete), fuzzing con 15 objetivos, tests de cripto/DEK, de las reglas de esquema de `CLAUDE.md` contra el esquema vivo, de concurrencia (que destapó una migración `down` rota), de aislamiento RLS y de inmutabilidad de borradores IA. `make verify` pasa a ser la única definición de "hecho" (#251) y `main` exige ocho checks con `enforce_admins`.
- **Suite de aceptación en Gherkin** (`features/`, #249 y #252): la especificación en español contra el router real, que encontró un bug de signup y otro de lectura en el flujo de cita → historia → factura.
- **Seguridad:** #250 deja de confiar en las cabeceras de IP del cliente (`chi.RealIP`) y añade la puerta del punto ciego. #253 corrige que la consola llamaba "Activo" a un tenant ya bloqueado por el gate; #254 impone un profesional, un paciente y una hora (migración `000072`); #255 mueve las migraciones al propio deploy, con chequeo de `dirty`, tras un despliegue que dejó el binario nuevo contra el esquema viejo con el workflow en verde.

---

## 2026-07-25

- feat(auth): **todo acceso denegado a un recurso queda auditado** (PR #227) — entrar al enlace de un paciente de otro consultorio ya fallaba en cerrado (RLS devuelve cero filas y la API responde 404, la misma respuesta que a un ID inventado, para que un sondeo no confirme que el ID existe en otra parte); lo que faltaba era el rastro de la negación. `audit.Writer.Denied()` es middleware sobre el grupo protegido y registra `RESOURCE_ACCESS_DENIED` con `success=false` ante 403/404, solo cuando la ruta lleva ID de recurso. Captura el status sin bufferear el body, así que las descargas de CSV y PDF no se afectan. Además la auditoría pasa a guardar la IP real del cliente (`httputil.ExtractIP`): detrás de Caddy venía guardando la dirección del proxy en la red de Docker. Sin migraciones.
- chore(docs): **auditoría de estado** — `STATUS.md` y `ACTIVE_TASK.md` estaban congelados en el 2026-07-22 y no registraban la ola `/agenda` completa (PRs #219–#226): la sesión anterior no cerró con `/actualizar-contexto`. Verificado contra producción, no contra los docs: `schema_migrations` = 69 (dirty=f), 5 contenedores arriba, disco 27%, últimos 8 runs de CI en verde, `tsc --noEmit` limpio, working tree limpio.
- Dos bloqueantes cambiaron de naturaleza al verificarlos: **WhatsApp** ya tiene `phone_number_id` y las tres plantillas escritas en `org_whatsapp_config` (`recordatorio_cita_24h`, `recordatorio_cita_2h`, `cita_confirmada`, `es_CO`) — lo que falta no es configurarlas sino que `enabled` sigue en `false`; y el **MCP `cloudflare-api` ya está autorizado** (lista las zonas), pero el token no alcanza para `rulesets` ni `bot_management`, así que reglas y política de bots siguen siendo manuales por el panel.
- El free/busy de #220 quedó confirmado funcionando en vivo: `availability` devuelve el 2026-07-29 con menos huecos que los demás días (sin 07:00–08:00), o sea eventos reales del calendario bloqueando, no solo horarios configurados. `chapni.com/agenda` sigue en 404 — el redirect al apex sigue pendiente en `../chapni`.

---

## 2026-07-23/24

- feat(agenda): **agenda comercial de leads en `app.chapni.com/agenda`** (PRs #219, #220, #222, #223, #225, #226), flujo aparte del `/book` clínico — sin tenant, sin pago, sin paciente. Migración `000069` (`lead_bookings` con índice único parcial anti doble-reserva + `lead_booking_settings`). Al reservar crea el evento con Google Meet en el calendar del superadmin y manda email al lead + aviso interno. Hallazgo que ahorró una reautorización: el scope `calendar.events` ya vigente permite **leer** con `Events.List`, así que no hizo falta ampliar a `calendar.readonly` como suponía el backlog.
- La disponibilidad pasó a restar el free/busy real del calendario (#220): antes un bloqueo personal se ofrecía como hueco libre. Ignora eventos "Libre" (transparent) y cancelados, los de día completo bloquean el día, y falla en cerrado si la lectura del calendario falla.
- Los endpoints de settings salieron en #219 sin consola — el horario solo se cambiaba por SQL — así que #222 añadió la pestaña `/admin?tab=agenda`. #223 la arregló acto seguido: el lint de `react-hooks` rompió CI en main porque el formulario se hidrataba con `setState` dentro de un `useEffect`; ahora se deriva (`draft ?? cfg`). #225 rehízo la página pública con estructura de Calendly y #226 quitó el nombre de anfitrión hardcodeado (`Marcela Chapués · Chapni`, que es una psicóloga clienta, no el equipo comercial).
- chore(docs): guía del sistema **completa** — los 10 capítulos en vivo en `chapni.com/guia` (PR #221).

---

## 2026-07-22

- fix(clinical): **los 4 formatos de Marcela estaban corruptos en la BD y quedaron reconstruidos** (PR #215). El `source_markdown` había perdido los saltos de línea, así que siete campos quedaron pegados dentro de la pista de "Antecedentes farmacológicos" y el parser los leyó como texto de ayuda — de ahí las descripciones llenas de `{multiselect:...}`. Hubo además pérdida de caracteres irrecuperable desde la BD (los `.txt` originales están a dos columnas y leerlos línea por línea fusionó vecinos: `Suicidio|Psicosis` → `Suisicosis`). Reconstruidos desde `docs/formatos/` a `docs/formatos/reconstruidos/` y aplicados en prod como versión nueva (apertura: 27 campos con 16 de texto libre → 36 con 19; las versiones viejas quedaron `ARCHIVED`, no borradas). `ParseMarkdown` ahora falla en cerrado si una pista conserva un `##` (PR #213), y un test vigila el rebuild.
- fix(clinical): **vista previa del builder a altura completa** (PRs #213 y #215) — dos intentos: el primero cambió la altura fija por una acotada al viewport pero dejó el `overflow`, que era el síntoma real; el segundo quita `position: sticky` y el scroll interno juntos (fijar el panel era lo que obligaba a limitarlo). Ahora la vista previa se dibuja entera al lado del constructor y la página tiene un solo scroll.
- fix(seo): **la app entera era rastreable** (PR #211) — `app.chapni.com/robots.txt` devolvía el `index.html` del SPA, sin `meta robots` ni `canonical`. Sin fuga de datos, pero `/login`, `/dashboard` y `/patients` competían como duplicados. Ahora Caddy responde `noindex, nofollow` en todo salvo una allowlist; por decisión del usuario solo `/book/marcela-chapues` es indexable.
- fix(marketing): **Cloudflare llevaba semanas devolviendo 403 a todos los crawlers de IA** en chapni.com (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot) e inyectando un *managed robots.txt* con `Disallow: /` para ellos, mientras Googlebot pasaba normal. Por eso ChatGPT respondía que el dominio no existía y otros modelos describían el producto sin precio, sin prueba gratis y sin la IA. Resuelto en el panel.
- feat(marketing): en `../chapni`, **`/precios/` y `/seguridad/` como URLs propias** (antes solo anclas del home, y un ancla no se indexa como respuesta), **guía "Cómo elegir software de historia clínica para psicólogos en Colombia"** (criterios sin nombrar ni enlazar competidores, decisión explícita), **IndexNow** en cada `npm run deploy`, `www` con 301 al apex, ruta `*.workers.dev` retirada, y `plan-seo-backlinks-geo.md` corregido tras provocar tres afirmaciones falsas por estar congelado en el 6 de julio.

---

## 2026-07-21

- enhancement(clinical): **retiro total de widgets bespoke** (PR #208, migración `000067_retire_template_widgets`) — `risk` pasa a ser un control fijo del sistema (sugerido por IA, top-level, ya no `{widget:risk}` de plantilla); `diagnoses`/`treatment_plan` viven en los paneles de perfil del paciente. Toca core-api, ai-service y frontend (builder visual + `RecordForm`).
- fix(clinical): **layout del builder visual de plantillas** (PR #209) — la sección "Formatos de registro" en Settings estaba topada a los mismos 780px de los formularios simples, así que builder+preview no cabían lado a lado y se apilaban; ahora usa 1400px. El botón "ver" de cada plantilla abría la vista previa como acordeón debajo de la fila; ahora abre al lado (info compactada a 280px, preview toma el resto, con scroll). Reportado por el usuario tras probar el builder visual de PR #206 en producción.

---

## 2026-07-09 — 2026-07-19 (resumen, compactado 2026-08-20)

- **Semana del 07-09:** auditoría 360° cerrada al 100% (guarda anti prompt-injection en el pipeline de IA, PR #162; visor de borrador bloqueado, #163), reglas `react-hooks` a `error` con 32 findings refactorizados (#164), branch protection activa en `main`, y el arranque del marketing: hub `chapni.com/recursos`, skill `chapni-social` con su ritual dominical, perfiles sociales terminados.
- **Semana del 07-10 al 07-13:** formatos org-only (#167–#176, migraciones 000062/000063) con búsqueda sobre PII cifrada por hashes peppered de prefijo; grabaciones de **una hora funcionando de punta a punta en producción**, con tres bugs mortales que solo apareció una prueba E2E real de 57,7 min (#178–#181); tres rondas de pruebas de usuario del flujo de audio (#183–#191, migración 000064); rotación de la llave GPG de backups y barrido de 53 audios PHI que el mount `:ro` nunca dejó borrar.
- **Semana del 07-15 al 07-19:** tipos genéricos `multiselect`/`{pills}` para plantillas (#199), disparado por que la IA no llenaba una sección de la plantilla real de Marcela; y el fix de fondo del versionado (#200) — editar una plantilla mutaba la fila en sitio, rompiendo borradores en curso y dejando que un PDF ya firmado se re-renderizara con el schema de hoy. Quinta guía del hub publicada (Ley 1090).

## 2026-07-02 — 2026-07-07 (resumen)

- **Auditoría 360°, fases 1–2 (#107, #108):** fuera el `docker.sock` de core-api (era RCE a root en el host), hashes de PII a HMAC-SHA256 con `SEARCH_PEPPER`, tope real de subida de audio; single-flight en el refresh de token (se acabaron los logout en plena sesión), `localStorage` selectivo y claims releídos de la BD.
- **Los 7 puntos de `tareas_clinica.md` (#113–#116):** borrador re-aprobable que duplicaba registros (RLS fail-closed sin GUC), desfase de fecha UTC vs. Bogotá, el resumen de la IA que ignoraba el formato configurado (`template_id` persistido y schema unificado), enfoque terapéutico por profesional con prompts parametrizados, chip de borrador en curso y recap colapsable.
- **fix(security) crítico pre-venta (2026-07-07):** `ALLOW_DATA_RESET` era un flag global, así que con él encendido **cualquier CLINIC_ADMIN de cualquier organización real** veía en Ajustes una tarjeta capaz de borrar sus propios registros clínicos. Existía solo para que el smoke test limpiara el tenant demo. El flag se eliminó entero: el endpoint ahora exige `organizations.is_internal`, y ninguna variable de entorno puede volver a abrirlo.
- **Dominio y marca (#119, #120):** producción pasa a `https://app.chapni.com` (Caddy multi-dominio, `api.marcelachapues.com` queda de legado sirviendo `/api` para webhooks viejos); la página pública de reservas conserva la paleta de la profesional, no la de Chapni.
- **Legal:** correo personal fuera de todo el contenido legal (`legal@` / `privacidad@`), publicado directo en la BD con el patrón atómico de versiones; fuera el banner de "borrador" y el botón placeholder de "SSO Clínica", que frente a un cliente pagando se leían como producto a medio hacer.
- **Borradores IA multi-toma (#146, migraciones 000058–000059):** varias grabaciones de la misma cita se funden en un solo borrador consolidado; las tomas absorbidas quedan `SUPERSEDED` apuntando a la consolidada.
- **Marketing:** nace la skill `chapni-social` (estrategia, calendario, render de piezas, log anti-repetición) con reglas de escritura anti-IA acordadas con el usuario; primer corte de validación B2B confirma que no hay señal orgánica (5 orgs, casi todas internas) aunque el mercado sí existe.

---

## 2026-06-26 — 2026-06-30 (resumen, sesiones 7–24)

- **Pérdida real de contenido clínico en producción (sesiones 23–24):** el autoguardado se construyó y probó solo contra el formato integrado y nunca contempló `customSections`, o sea el contenido de todo registro creado con **plantilla personalizada**: no se guardaba en local, el fallback al servidor no se disparaba y los ciclos posteriores sobrescribieron el contenido real con el formulario vacío (410→610→139 bytes en la BD). Un registro quedó irrecuperable. Causa de fondo del bloque: `registerType: 'autoUpdate'` recargaba la página sin avisar en cada deploy. Fix en dos fases: recarga diferida con banner, y autoguardado real en servidor (migración 000048 con `finalized_at`, endpoints `autosave`/`finalize` separados de los estrictos, `session_number` asignado al finalizar para no dejar huecos).
- **Need-to-know clínico (sesión 8, migración 000041):** `patient_staff_rel` obligatorio — un profesional sin fila activa recibe 403 `NO_PATIENT_ACCESS` (Res. 1995/1999 Art. 14), sin workaround; `SYSTEM_ADMIN` pasa, `CLINIC_ADMIN` puro conserva el break-the-glass. La sesión 7 ya había partido el perfil del paciente en Agenda (libre) e Historia clínica (con gate), y el gate se afinó para actuar solo al abrir contenido confidencial, no al ver metadata.
- **Plantillas de registro definibles por el profesional (sesiones 15–16, migración 000046):** markdown `## título {tipo}` → `SectionDef[]`, CRUD con vista previa en vivo, catálogo de widgets compartido Go/Python/TS, el worker de IA construyendo el prompt desde el schema, y el PDF respetando etiquetas y orden de la plantilla vigente al aprobarse.
- **Agenda y pagos:** el selector de profesional al agendar como admin enviaba el `user_id` del admin (un `<select>` cuyo valor inicial no coincidía con ninguna opción), lo que además bloqueaba al profesional real de su propio paciente; pagos por tenant (000042) con token cifrado, webhook secret por tenant (000043) y badge prueba/producción (000044); un pago real de COP $1.000 verificado de punta a punta.
- **Plataforma y CI:** pestaña "Plataforma" del operador con rotación de credenciales MP cifradas (000045); tres capas de CI (`go test` bloqueando el build, `tsc --noEmit`, smoke test de 8 pasos tras cada deploy).
- **Decisión de fundador (sesión 14):** congelar olas de features y validar demanda con psicólogas externas. El cuello es la distribución, no el producto — el mismo diagnóstico que sigue vigente.

## 2026-06-21 — 2026-06-24 (resumen)

- **Gobernanza y legal (sesiones 5–6):** cuenta desactivada → 403 en español (chequeo *después* del bcrypt, no filtra existencia); migración 000039 deja a CLINIC_ADMIN en solo-lectura clínica con break-the-glass justificado en `audit_log` (Res. 1995/1999); CMS legal editable en BD (migración 000040) con ToS/privacidad/DPA servidos desde `legal_documents`; migración 000038 sella `terms_accepted_at`/`dpa_accepted_at` en el signup (Ley 1581).
- **Consola del sistema (sesiones 3–4):** tablero SYSTEM_ADMIN con disco/RAM/CPU, métricas de PostgreSQL y Redis, cola IA, alertas server-side y 3 acciones de mantenimiento Docker; estado de backup leído de `/var/lib/sghcp/last_backup_ok`; baja de miembros por soft delete con guards (no self, no último admin). Decisión de arquitectura: multi-tenant compartido, no VPS por cliente.
- **Google Calendar:** OAuth per-profesional con tokens cifrados (migración 000035), sync SGHCP→Google en create/cancel, backfill al conectar y limpieza al desconectar. Bug crítico: el service worker Workbox interceptaba la navegación al callback OAuth (`navigateFallbackDenylist`).
- **Booking y pagos:** RLS en las tablas del flujo público con resolvers `SECURITY DEFINER` (migración 000032, cerró el bloqueante RLS); pagos diferidos Efecty/cash con hold extendido y voucher (000033); firma de webhook MP obligatoria, sin fail-open (cerró B-11); política de reembolso aceptada antes del pago (000031, cerró B6); guard anti doble-booking con estado `PAID_CONFLICT`.
- **Clínico y pacientes:** Nº de HC consecutivo por tenant con advisory lock (000030) visible en la franja de identificación y en el PDF; estado civil/escolaridad/ocupación como blob cifrado (000029); workspace de redacción dirigido por estado en la pantalla de cita; grabación que sobrevive a F5 vía IndexedDB; preferencias de IA por profesional (estilo y tono) que viajan al prompt (000037).
- **Infra — incidente de disco:** disco al 100% con PostgreSQL en crash loop; recuperado sin pérdida de WAL. Prevención permanente: journald capado a 200 MB, cron semanal de prune, alerta diaria si >80%, build de las imágenes movido a GitHub Actions + GHCR (el VPS dejó de compilar) y borrado del audio tras transcribir (PHI + disco).
- Retirado el flujo "Solicitudes web" completo (migración 000036); `/book/:slug` + MercadoPago quedó como único camino público. Export CSV de pacientes, cambio de correo admin con token, y gestión de roles del equipo.

---

## 2026-06-16 — 2026-06-20 (resumen)

- Formatos clínicos F1–F4 alineados a los documentos físicos de Marcela + fix white-screen por arrays `undefined` en borradores stale (PRs #101–#106).
- Formulario paciente y página de cita: validaciones, SlotPicker de disponibilidad, cancelar/reagendar inline desde el calendario (#92–#96).
- BC-6 Facturación completo: tarjeta/PSE/Efecty/Nequi, filtros de período, balance por paciente (#80–#91, migraciones 000024–000026).
- BC-6 multi-tenant habilitado + integración MercadoPago (webhook, PSE/Efecty/Nequi/tarjeta) + RLS en todas las tablas del sistema (#48–#73).

---

## 2026-06-10 — 2026-06-15 (resumen)

- `v0.5.0` tag: historia clínica psychology-native, consentimientos digitales, plan terapéutico, PDF export, audit log.
- Ola Booking: `/book/:slug` público, pago MP único, emails automáticos 24h/2h, agenda con pago visible.
- Ola 2 SaaS: multi-tenant RLS, signup self-serve, trial 30 días, gating 402, cobro MP suscripción mensual.
- Ola 3 IA iniciada: recap pre-sesión + plan sugerido con Whisper + Claude Sonnet.
- Migración inicial a VPS Hetzner (pre-wipe backup: `pre_wipe_20260616_1749.dump`).
