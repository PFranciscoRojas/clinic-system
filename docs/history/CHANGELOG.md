# CHANGELOG — Historial compactado de trabajo SGHCP

> Append-only. Días de >30 días colapsan a resumen mensual. Para roadmap y bloqueantes ver `docs/project/STATUS.md`.

---

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
