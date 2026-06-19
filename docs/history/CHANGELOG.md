# CHANGELOG — Historial compactado de trabajo SGHCP

> Append-only. Días de >30 días colapsan a resumen mensual. Para roadmap y bloqueantes ver `docs/project/STATUS.md`.

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
