# CHANGELOG — Historial compactado de trabajo SGHCP

> Append-only. Días de >30 días colapsan a resumen mensual. Para roadmap y bloqueantes ver `docs/project/STATUS.md`.

---

## 2026-06-23

- feat(booking): eliminado flujo "Solicitudes web" completo — tabla `booking_requests` (migración 000036), paquete Go `bookingrequests`, rutas `POST /api/v1/public/booking` y `/api/v1/booking-requests`, `BookingRequestsPage`, `BookingPage` (formulario viejo), widget inbox del dashboard y nav item. El flujo `/book/:slug` + MercadoPago (`BookingWizardPage`) queda intacto (`99ba8a0`).
- fix(appointments): casts explícitos `$5::timestamptz`, `$6::integer`, `$7::appointment_modality` en CTE `hold_conflict` — resuelve inferencia de tipo errónea cuando `bookings` está vacía (`9a38fbb`, `1127937`).
- fix(admin): reset de datos de prueba 500 — orden de DELETE corregido: `ai_suggestions` (FK a patients) y NULL de `appointments.rescheduled_to` antes de DELETE (`cab4182`).
- feat(gcal): backfill automático al conectar + limpieza de eventos en Google al desconectar + fix crítico SW Workbox (`navigateFallbackDenylist`) que impedía que el callback OAuth llegara al backend (`82de8b1`–`954a137`).

---

## 2026-06-28 (sesión 15)

- feat(clinical): plantillas de registro clínico definibles por el profesional en Markdown — tabla `clinical_record_templates` (migración 000046, RLS, permisos `record_templates:*`), `clinical_records.template_id`; parser Go `## heading {type}` → `[]SectionDef`; 7 endpoints CRUD + `/parse` preview; `field-widgets.json` catálogo compartido Go/Python/TS; Settings → "Formatos de registro" con editor markdown + preview en vivo + paleta de widgets; `TemplatedSectionsForm` renderiza `text/select/scale/checklist/widget` usando componentes existentes (`MentalExamChecklist`, `RiskSelector`, etc.); `RecordForm` con selector de plantilla, default preseleccionada; `AIDraftPage` usa `TemplatedSectionsForm` con secciones tipadas cuando draft tiene `template_id`; `AppointmentPage` propaga `template_id` a los 3 puntos de `uploadAudio`; worker Python carga schema JSONB y construye prompt dinámico por tipo. Deployado a VPS (migración 000046 aplicada, frontend rebuild). (`aa4ce66`, `32620a7`)

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
