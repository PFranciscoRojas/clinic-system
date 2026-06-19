# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added
- Balance por paciente tab on the Facturación page: per patient, the sessions, total invoiced, collected and outstanding balance, with a "% pagado" bar — sorted by who owes the most, scoped to the module's period selector, each row linking to the patient. Tells the clinic at a glance who is behind on payments. `GET /api/v1/invoices/patients-balance?period=…`
- Resumen financiero by period: a Semana / Mes / Año / Todo selector now drives the financial cards — income for the chosen period (online/direct split) with the % change vs the same elapsed slice of the previous period, the current cartera with its % collected, and an overdue (vencido) card with its count. Payment-method percentages are scoped to the period too. Two actions: export an income report (CSV, monthly online/direct/total) and "Enviar cobros pendientes" — emails a payment reminder to every patient with an outstanding balance, behind a confirmation. The Facturas tab also gained a CSV export of the listed invoices. `GET /api/v1/invoices/overview?period=…`, `POST /api/v1/invoices/send-reminders`
- Facturación is now a full invoice administrator, split into tabs. A new "Facturas" tab lists every invoice (consecutive number, patient, service, date, amount, status) and opens a detail popup with the consolidated breakdown and actions — issue, register a payment (when pending), download the receipt PDF, anular, and **send it to the patient** (emails the PDF with a confirmation step to avoid mis-clicks). No more going patient by patient. Invoices get a per-org consecutive number (F-000001) assigned on issue (migration 000026, serialized so it never collides), and the email send is stamped on the invoice. The previous overview moved to a "Resumen financiero" tab and now also shows the % collected. `POST /api/v1/invoices/{id}/send`
- Income broken down by payment method on the Facturación page: a "Medios de pago" panel shows how much was collected through each method — credit/debit card, PSE, Efecty, Nequi, "dinero en MercadoPago", etc. for online payments, and cash/transfer/Nequi/… for the ones recorded by hand — each with its count, amount and channel tag. Online detail comes from MercadoPago itself: the booking webhook now records the payment's `payment_type_id`/`payment_method_id` (migration 000025). Detail is available for payments confirmed from now on
- Unified clinic income + time metrics on the Facturación page: collected income now combines both channels — online payments via MercadoPago (paid bookings) and direct payments recorded by hand (cash, transfer, Nequi/Daviplata…) — with an online/direct split, the cartera (outstanding invoice balance), this-week / this-month / this-year income each compared against the same elapsed slice of the previous period, and a real 12-month income chart stacked by channel. `GET /api/v1/invoices/overview` (`billing:reports`) computes it all in SQL with no decryption; income ranges use Colombia civil time. Clarifies that MercadoPago is a channel (card/PSE/Efecty/Nequi inside it), while the manual methods are direct, out-of-band payments
- Real clinic-wide billing view: the "Facturación" page (CLINIC_ADMIN) now shows the consultorio's actual numbers — total invoiced, total collected and outstanding balance — plus a filterable table of every invoice with the patient's name, status and balance, each row linking to the patient. Replaces the static demo dashboard. Backed by `GET /api/v1/invoices/summary` (aggregates computed in SQL, `billing:reports`) and the org-wide invoice list. The nav entry, hidden while billing was a mock, is back for admins
- Payment receipt PDF (comprobante de pago): once an invoice has a payment, a "Comprobante" button on the patient's Facturación tab downloads a one-page PDF with the clinic letterhead, the patient, the amount breakdown, the recorded payments and the balance — clearly stamped as an internal receipt, not a DIAN electronic invoice. `GET /api/v1/invoices/{id}/receipt`
- Patient invoicing + payments (BC-6 internal billing): a new "Facturación" tab in the patient profile lets the clinic create invoices (from a service rate or a manual amount, with optional discount and insurance-covered), issue them, record payments (cash, transfer, Nequi, Daviplata, card, PSE, EPS…) and see the running balance and status (borrador → emitida → pago parcial → pagada). Money math runs in Postgres (`NUMERIC`, never floats), invoice notes and payment references are encrypted with a per-invoice key, and concurrent payments are serialized so totals/status stay consistent. `GET/POST /api/v1/invoices`, `…/issue`, `…/cancel`, `…/payments`, gated by `billing:read` / `billing:create` / `billing:record_payment`. Not DIAN electronic invoicing
- Service-rate catalogue (BC-6 internal billing): a new "Tarifas" section in Settings (CLINIC_ADMIN) lets the clinic define its service prices — name, amount, currency (COP default), optional modality — and activate/deactivate them without losing history. These rates will back invoices and payment receipts (no DIAN electronic invoicing). `GET/POST/PUT/PATCH /api/v1/service-rates`, gated by `billing:read` (view) and `billing:manage_rates` (manage)
- AI clinical risk detection: a "señales de riesgo" banner on the patient profile and appointment page flags possible risk signals (suicidal/self-harm ideation, harm to others, severe deterioration) from the patient's history — graded none/low/moderate/high, with signals, rationale and a suggested action. It is decision support only (never replaces clinical judgment; "sin señales" never clears a patient) and is conservative by design. Refreshed automatically when a clinical record is approved, and runnable on demand. Reuses the `ai_suggestions` pipeline (new `risk_detection` kind)
- AI pre-session recap: on the appointment page, "Generar recap" summarizes the patient's encrypted clinical history (process so far, last session, pending tasks, points to revisit, risk flags) before the session starts — the AI summarizes, the professional decides
- AI-suggested treatment plan (CBT): "Sugerir con IA (TCC)" proposes a cognitive-behavioral plan from the patient's history (formulation + measurable goals) and pre-fills the new-plan form for the professional to review and edit before creating it
- Both run on a new generic `ai_suggestions` pipeline (migration 000023): the history is decrypted, anonymized and sent to Claude, and the result is sealed with a per-suggestion key — same privacy guarantees as the clinical draft
- Add-to-calendar after a paid booking: the confirmation page polls the booking status and, once paid, shows the appointment with Google Calendar and Apple/Outlook (.ics) buttons (`GET /api/v1/public/pay/status`)
- Signup now asks whether the owner practices: "Sí, yo atiendo" grants the bookable PROFESSIONAL role and shows onboarding; "No, solo administro" creates a manager-only admin (CLINIC_ADMIN) who skips onboarding and invites the practitioners
- Online payment for public bookings (MercadoPago): after picking a slot and entering their details, the patient sees a summary (date, time, modality, price) and pays through MercadoPago's hosted checkout; the slot is held for 15 minutes during checkout, and a payment webhook auto-confirms the booking — creating the appointment in the professional's agenda and emailing both patient and professional. New `bookings` table (migration 000020); price set by `BOOKING_SESSION_PRICE`
- Public booking page, redesigned: themed to each clinic's identity (editorial palette + accent color from the org branding), with an engaging hero panel, a month calendar to pick the day with the free time slots beside it, and a phone field with a country-code selector (default +57). Per-modality hours: online sessions use the full schedule (morning + afternoon) while in-person sessions are offered only in the afternoon (from 2pm) — and a slot booked in either modality blocks that time for both. `GET /api/v1/public/org` exposes the public name + brand color
- Public booking page with real availability: a hosted, reusable booking page at `/book/:slug` shows the clinic's actual free time slots (computed server-side from the professional's working hours + existing appointments, respecting break/buffer), lets the patient pick modality → slot → leave their details, and creates the request. `GET /api/v1/public/availability` exposes the open slots. marcelachapues.com's "Agendar" now links here instead of the old plain form (online payment follows in a later phase)
- Online subscription payment via MercadoPago (Colombia): "Activar mi plan" sends the owner to MercadoPago's hosted monthly-subscription checkout (no card data touches the app); a webhook then activates the organization automatically — writing the same columns the operator console sets by hand, so card and out-of-band payments behave identically. The checkout stays reachable even after the trial lapses
- Subscription gating: once an organization's trial (or paid period) lapses, clinical access returns 402 and the app shows a "tu período de prueba terminó" screen — while data export stays available at all times (legal duty of custody). Entitlement is decoupled from any payment provider, so cash/transfer/manual activations gate exactly like card payments will
- Operator console (SYSTEM_ADMIN): "Operador SaaS" page lists every tenant with its subscription state and lets the operator activate an organization for N months — the manual path for tenants who pay out-of-band (cash, Nequi, transfer). Backend: GET /admin/orgs and POST /admin/orgs/{id}/activate
- The current organization's name is now shown in the sidebar header, so it's always clear which clinic you're working in (`GET /auth/me` returns `org_name`)
- Self-serve onboarding for new clinics: a fresh signup is born ready — the four starter consent templates are seeded for the new organization (so consents can be captured from day one) and the existing onboarding wizard now creates the professional profile (name, license, specialty, schedule) on first login
- Trial banner: while an organization is on its trial, the app shows the remaining days ("Te quedan N días de prueba"), turning amber in the last three; `GET /auth/me` now reports `subscription_status`, `trial_ends_at` and `trial_days_left`
- Self-serve signup: anyone can create their own clinic from a public `/signup` page (`POST /auth/signup`) — it provisions a new organization (in a 14-day trial) and its owner user with CLINIC_ADMIN + PROFESSIONAL roles, generates a unique slug, and emails a one-time verification link. Onboarding then collects the professional profile. First step of the multi-tenant SaaS funnel (migration 000019)
- Email verification: signups must confirm their address before logging in. The verification token is single-use and expires in 24h (`POST /auth/verify-email`, public `/verify-email` landing page, hashed token in Redis); existing accounts were backfilled as verified
- Self-service password reset by email: "¿Olvidaste tu contraseña?" sends a one-time link (`POST /auth/forgot-password`, token in Redis, 1h TTL, no account enumeration) to a public reset page (`/reset-password`); reuses the existing Resend transactional email. Replaces the previous "contact your administrator" dead-end
- Profile photo / avatar: upload from Settings → Perfil (auto-cropped to a square and downscaled to 256px), stored server-side (`professional_profiles.avatar_png`, migration 000017) and shown in the sidebar across devices
- AI draft review suggests an ICD-10 diagnosis from the session: the suggestion is shown but never assigned automatically — the professional confirms, changes (catalog search) or removes it, and it's attached to the record on approval
- AI draft review now shows the audio transcription (collapsible) and lets the professional correct the record type (initial/evolution/discharge) before approving; when the audio had no clinical content to structure, an explicit note says so instead of leaving blank sections
- Admin-only "Limpiar datos de prueba" in Settings → Seguridad: wipes the organization's patients, appointments, records, AI drafts and consents while preserving the professional profile + signature, consent templates, users and catalogs. Triple-gated: server flag `ALLOW_DATA_RESET`, CLINIC_ADMIN role, and a typed confirmation — meant for the construction/testing phase, hidden in normal production
- Session recording in the browser: recording starts automatically with "Iniciar sesión" when the patient's RECORDING consent is active (manual "Grabar" button too), stops at "Finalizar sesión" and uploads straight into the AI pipeline
- AI drafts now follow the clinical record structure instead of generic SOAP: the session's record type (initial/evolution/discharge) travels with the audio job, Claude fills the same sections the professional would write by hand, and approving creates the record linked to the appointment with the real session date
- Responsive layout for phones and tablets: the sidebar becomes a hamburger drawer, agenda/inbox and the new-appointment columns stack vertically, Settings nav turns into a scrollable tab bar, patients always show as cards on phones, wide clinical tables scroll horizontally, and the month calendar compacts
- Appointments can be booked without a registered patient: reserve the slot with just a name (`guest_name`, migration 000015) and associate or register the patient at the first consultation (`PATCH /appointments/{id}/patient`); guest reservations show a "Reserva" badge across agenda, calendar and the appointment page
- Appointment page shows the patient's key data at hand (age, document, phone) and blocks "Iniciar sesión" until the patient is associated and the treatment consent is signed
- Registering a patient from a guest reservation links it to the appointment automatically and returns to it
- Month view in the calendar (alongside week and day): 6-week grid with appointment chips, click a day to drill into it; the last selected view, agenda/calendar tab and patients view (cards/list) persist across sessions
- Collapsible sidebar: collapse to icons with tooltips, state remembered
- Addenda on approved clinical records: signed, immutable supplementary notes (author + timestamp, sealed with the record's DEK) — the original entry is never edited (Res. 1995/1999); addenda print in the exported PDF (migration 000013)
- Professional profile API (BC-2): own-profile GET/PUT and specialties catalog; onboarding and Settings forms now persist names, tarjeta profesional and specialty to the backend instead of localStorage, so signed PDFs print the real license number
- Self-service password change (`POST /auth/change-password`) with a "Cambiar contraseña" card in Settings → Seguridad
- Global header search now works: searches patients by last name or document number with a results dropdown
- Dashboard clinical inbox shows real data: pending web booking requests and today's appointments past their slot but not completed
- Unified consent signing: the patient checks what they authorize (treatment and data processing required; recording and information-sharing optional), reads each document and signs once — each authorization still becomes an independent, separately revocable consent record
- "Sesión pasada" on the patient profile registers an extemporaneous entry: appointment created at its real past date, mandatory justification stored in the encrypted record and disclosed in the history and the exported PDF ("Carácter del registro: Extemporáneo", Res. 1995/1999)
- Working schedule persisted server-side (`professional_profiles.working_hours` + GET/PUT /me/professional-profile/schedule) — follows the professional across devices; localStorage stays as offline cache
- Session timer while the appointment is in progress: elapsed/remaining time next to "Finalizar sesión", amber warning at 10 minutes left, red when over time
- Grace window for the session note: after "Finalizar sesión" the record form stays available until the note is written (next patient can be attended first); the note stores the real session date and the dashboard inbox lists "Nota de sesión pendiente" reminders

### Changed
- The Resumen financiero income chart now follows the period selector and adapts its X-axis granularity: Semana → days, Mes → days, 3 meses → weeks, Año → months, Todo → years. Bars are vertical (value on the Y axis, time buckets on the X axis), stacked by channel; the series is computed server-side for the selected window. Adds a "3 meses" (quarter) period option across the cards, tabs and chart
- The billing page's financial cards and the Semana/Mes/Año/Todo period selector now live at the module level (above the tabs), so they're always visible and the selector drives every tab: the Facturas list is filtered to invoices issued in the period (`GET /api/v1/invoices?period=…`) and the Resumen figures are scoped to it. The 12-month income chart is now horizontal (value along the X axis, months down the Y), stacked by channel
- The billing page is now entirely real-data driven: the static demo dataset (and the recharts dependency it pulled into the bundle) was removed
- Booking times shown to patients in 12-hour format (3:30 p.m.) instead of 24h; the appointment summary gained a "Volver y corregir" step back; the MercadoPago checkout item now names the date/time/modality; sidebar brain badge goes to the dashboard when expanded and acts as the open-menu toggle when collapsed
- Public booking is no longer blocked by onboarding: the booking page resolves the clinic's professional by role and uses a default schedule until real hours are set, so a brand-new clinic can take bookings right after signup. The onboarding wizard is now skippable ("Omitir por ahora") and pre-fills the name from signup
- Booking phone field: country-code dropdown with flags (default 🇨🇴 +57) and per-country validation (Colombia = 10 digits starting with 3); the appointment summary now also shows the patient's email and phone; booking page inputs no longer overflow on mobile
- Signup is now framed as "Registra tu consultorio" (creating an organization), not "create an account": the form asks for the clinic name separately from the admin's own name, so the clinic name becomes the organization/slug and the person's name becomes their profile. Adding more staff to an existing clinic stays invite-code only, avoiding the confusion of someone creating a whole new organization when they just meant to add a user
- Login is now by email alone — the tenant is resolved from the account, so the "Organización" field was removed from the login form. Email addresses are now globally unique across all organizations (migration 000019)
- Patient-facing emails (booking received/confirmed/rejected, consent sign link) are now branded per organization — name, accent color and contact resolved from the tenant's profile at send time — instead of being hardcoded to a single clinic; account/system emails stay product-branded. First step toward multi-tenant SaaS
- Saving the working schedule in Settings now refreshes the scheduler's cached copy, so new hours show in the agenda without a manual reload
- The sidebar role/subtitle now reads the specialty from the server profile (falling back to the role label) instead of a device-local copy, so it's consistent across devices
- "Sesión pasada" (extemporaneous entry) uses the same three-select date and an optional, simpler time (hour/minutes, defaults to noon) — only the date is required
- Patients page no longer has its own search box: search is the global header field (last name or document, with a results dropdown), leaving the page with status filters and views
- Birth date is entered with three explicit selects (Año / Mes / Día) instead of the native date input, whose placeholder order depended on the browser locale and contradicted the validation
- Recording indicator shows a live microphone level meter so it's clear the mic is actually capturing
- After "Finalizar sesión" the AI panel immediately shows "Procesando la grabación…" instead of the upload dropzone, until the draft is ready
- Sessions can only be started on the day of the appointment — future appointments show their data but "Iniciar sesión" stays disabled
- The session timer counts down the configured duration from the moment "Iniciar sesión" is pressed (`appointments.started_at`, migration 000016), not from the scheduled slot
- An appointment can no longer be cancelled once the session started (UI and API): it ends as completed or no-show
- The appointment header shows every active consent (treatment, data, recording, information sharing), each one viewable — not just the treatment consent
- Unified consent signing shows one continuous document with the selected sections (one reading, one signature) instead of four collapsible documents
- Clinical records can only be created inside a started session: the record form and audio upload require the appointment to be IN_PROGRESS, and the standalone "Nuevo registro" page was removed — every note hangs from a real session
- Treatment consent can be signed directly from the appointment page (modal) instead of navigating away to the patient profile
- Associating a patient to a guest reservation now asks for confirmation before linking
- New clinical record defaults to the right type: INITIAL when the patient has no open process, EVOLUTION otherwise
- Agenda and calendar remember the day being viewed when navigating into an appointment and back
- Patients page search reduced to one smart field (digits = document, text = last name) — the mode dropdown duplicated the header search
- "Citas de hoy" tile replaced by a subtle counter in the agenda greeting line
- Diagnoses are no longer a dedicated tab: the CIE-10 panel lives inside the Historial tab (the data and PDF output stay)
- Patients list: row click opens the full profile directly; the eye icon keeps the quick-view summary
- Valueless counters removed: patients KPI strip (total/active/inactive/"con contacto"), the "Pacientes activos" dashboard tile, and the always-empty "Sesiones / Próxima cita" block on patient cards

### Fixed
- "Iniciar sesión" failed with an internal error since the countdown timer change: the status update SQL lost its enum cast under the new type inference
- Scheduling a second same-day appointment for a patient is no longer blocked (it was even counting completed appointments): repeating a patient in the same day is the professional's call — the form now just notes the existing active appointment
- AI draft review works end-to-end: `GET /ai-drafts/{id}` no longer 500s on healthy drafts (NULL error_message scan), the response now includes the decrypted SOAP sections the review page renders, and Claude's JSON output is parsed robustly (markdown fences no longer collapse everything into "subjective")
- AI service can now actually be built and deployed: the Docker image declared a nonexistent build backend and shipped without its installed dependencies; it also crashed on boot (invalid uvicorn log flag, redis password with special characters breaking the connection URL, and redis-py 8.x's 5s read timeout aborting the worker's blocking reads)
- Half-typed birth dates (e.g. only the year) are now rejected on save instead of silently storing no date
- Header patient search no longer gets autofilled with the login email by the browser
- Onboarding wizard no longer reappears for existing users on a new browser: completion is persisted server-side (`users.onboarding_completed_at`, migration 000014) and returned by `GET /auth/me`
- Implausible birth dates (e.g. a half-typed year showing "2025 años") are rejected in every form that captures fecha de nacimiento, validated server-side, and guarded at display time
- "Ver perfil" on the patients list opens the full profile directly; the quick-view summary stays on row/card click
- Calendar detail panel: dead "Reagendar"/"Cancelar cita" buttons removed; "Abrir cita" goes to the appointment page (the real hub for start/cancel/record)
- "Nueva cita" from the calendar keeps the selected date instead of jumping back to today
- New-appointment slots now respect the configured working hours, midday break and buffer instead of offering 08:00–20:00 every day; days outside the configured schedule show a warning
- Settings → Horario y agenda actually persists changes (it previously only pretended to save)

### Removed
- "Bio profesional" field from Settings (it was never persisted nor shown anywhere; it returns when the public patient/booking portal is built)
- "Cédula / RUT" field from the onboarding wizard (never persisted, Chilean placeholder; the clinical document legally requires name + tarjeta profesional)
- All fabricated UI data: fake notification bell ("3 urgentes"), hardcoded inbox items, "Borradores IA" and "Facturación del mes" tiles, "+3 este mes" badge, "PHQ-9 alto" and "Con pendientes" patient KPIs
- Mock Settings sections: "Plan y facturación" (fictitious SaaS plan), "Integraciones" (fake connect buttons), mock note templates, fictitious active-sessions device list, dead 2FA toggles, raw permission-code list in the profile
- Billing and Evaluations hidden from navigation until their backends exist (code kept as design reference)

### Fixed
- New-patient form: when a required field (document number, birth date…) blocks the save, the page now scrolls to and focuses the first field with the error, instead of looking like nothing happened. Document type is a dropdown (default Cédula de Ciudadanía) instead of a wide button row, and the surname labels read "Primer apellido / Segundo apellido" (matching the edit modal)
- Signing a consent in office returned 500 (and the consent list looked empty). `consents`, `ai_drafts` and `patient_assessments` had RLS enabled since the initial schema but never got a policy; once the app moved to the non-owner `sghcp_app` role (RLS/MT2), "RLS enabled + no policy" became default-deny for them — reads returned nothing and writes failed. Migration 000027 gives them the same `tenant_isolation` policy as the other tenant tables, restoring consent signing, AI-draft access and assessments

### Security
- Per-tenant Row-Level Security extended to the BC-6 billing tables (`service_rates`, `invoices`, `payments`, `patient_billing_profiles`), which predated tenant isolation (migration 000024): activating the invoicing module can no longer expose another tenant's rows
- Tenant isolation enforced in the database via Postgres Row-Level Security on the core clinical tables (patients, clinical records + addenda, appointments, treatment plans, diagnoses): every query is scoped to the caller's organization at the engine level, so even a query missing its explicit org filter cannot read or write another tenant's data. The app now connects as a dedicated non-superuser role (`sghcp_app`) for RLS to take effect; migrations still run as the owner
- Password-reset link tokens and invite codes are now stored hashed (SHA-256) in Redis instead of in plaintext: a leaked snapshot can no longer be replayed to take over an account; the raw secret lives only in the email link / the code shared by the admin
- Resetting or changing a password now invalidates every existing session: refresh tokens carry a per-user "password epoch" that is bumped on reset/change, so old refresh tokens stop working immediately (the access token keeps working until it expires, ~minutes)

## [0.5.0] — 2026-06-10 · psychology-native clinical history, consents, treatment plans & PDF export

### Added
- Treatment plans: per-patient therapeutic goals with progress notes and status tracking (pending/in progress/achieved/abandoned), plan lifecycle (active/completed/abandoned, one active plan per patient), all clinical content encrypted at rest with a per-plan DEK; new "Plan terapéutico" tab in the patient profile (migration 000011)
- Approved clinical records can be exported as PDF (header with organization and responsible professional, template sections, mental exam, active ICD-10 diagnoses, confidentiality footer)
- Informed consent management: versioned editable templates (Settings), in-office digital signature (canvas), remote signature via single-use 7-day emailed link, physical-scan upload (PDF/JPEG/PNG ≤10MB) stored encrypted in-DB, document viewer with signature image and read-and-accepted evidence (timestamp/channel/IP), and revocation with reason (migration 000010)
- Appointment page shows the covering TREATMENT consent (signed date + view button) or a warning chip when missing

### Fixed
- Multipart uploads no longer send a JSON content type from the SPA API client
- "Start session" no longer fails with a 500 — `IN_PROGRESS` added to the appointment status enum (migration 000009)
- Every remaining user-visible "SOAP" string removed: appointment page button, settings labels and demo template, legacy record viewer section labels, AI draft section labels
- Patient list 500 when a patient has NULL gender (booking-created patients) — scan with nullable type; a single undecryptable patient row no longer takes the whole list down
- "Iniciar sesión" on appointments swallowed errors silently — failures now surface in the UI
- Residual "SOAP" wording in user-facing copy replaced with clinical-record terminology
- Patient profile header showed hardcoded demo chips ("Ansiedad generalizada", "Terapeuta asignado") — now shows the patient's real active principal diagnosis, or nothing

### Changed
- Agenda session types reduced to the 3 clinical formats: initial session, follow-up, discharge
- Clinical note pages use the full screen width (1100px) with a two-column layout: text sections left, mental exam/risk right
- Section fields auto-grow while typing instead of fixed 3-row boxes
- Saving a session note automatically completes the appointment; the cancel button hides once a record is linked
- "Nuevo registro" works without an appointment (standalone form for walk-ins and retroactive notes)
- Consent warning banner on the patient profile when no TREATMENT/DATA_PROCESSING consent is registered (Ley 1581/2012 · Ley 1090/2006) + reminder on intake notes

### Removed
- "Evaluaciones" nav item, "Gráficas de evolución" tab (demo chart) and "Plan terapéutico" tab (static mockup) — hidden until their real implementations (assessments postponed by decision 2026-06-09; treatment plan in Phase 2)
- Dead "Subir documento" and "Nueva evaluación" buttons on the patient profile

### Added
- Clinical record template v2 — psychology-native formats per record type: intake (INITIAL, 9 sections incl. 10-domain mental exam), evolution note (DAP-style, 5 sections) and discharge epicrisis; sections stored as one encrypted JSON blob (`sections_enc`) so future format changes need no schema migration (migration 000008)
- Structured suicide/self-harm risk level (`NONE`/`IDEATION`/`PLAN`/`ATTEMPT`) — mandatory on every v2 record, exposed in record list for the patient profile
- Open-process business rules: one INITIAL per open process, EVOLUTION/DISCHARGE require an open process, DISCHARGE requires a reason (therapeutic/dropout/referral/mutual agreement)
- ICD-10 diagnosis module: searchable catalog (61 psychology-relevant codes seeded, Spanish labels), patient diagnoses with PRINCIPAL/RELATED type and ACTIVE/RESOLVED/RULED_OUT lifecycle, full audit trail
- Unit tests for template validation and open-process rules
- Frontend: differentiated clinical forms per record type — guided intake with 10-domain mental exam checklist (normals pre-marked), DAP-style evolution note, discharge epicrisis with reason selector
- Frontend: mandatory one-click risk selector on every note; risk badge on record view, per-record risk column and "último riesgo" badge on the patient profile
- Frontend: copy-forward ("partir de la evolución anterior" — risk intentionally not copied) and local autosave of in-progress notes
- Frontend: Diagnósticos tab on patient profile — ICD-10 search, assign, and lifecycle (activo/resuelto/descartado)

### Fixed
- New-booking notification now reaches every active CLINIC_ADMIN of the organization (was limited to one arbitrary admin)

### Added
- Shared audit writer (`internal/shared/audit`) — best-effort async inserts into append-only `audit_log`
- Audit trail for clinical records: read, list, create, update, approve and cosign events
- Audit trail for consents: create and list events
- Per-IP rate limiting on public endpoints: 5 req/min on `POST /public/booking/`, 20 req/min on `/auth/*`
- Booking consent evidence (Ley 1581/2012): `consent_accepted_at` + `consent_policy_version` on `booking_requests` (migration 000007), accepted from the public booking payload

---

## [0.4.0] — 2026-05-06 · PR #5 · feature/bc5-frontend

Completes Fase 5 (Frontend React + PWA). Full clinical scheduling UI with business rule validation.

### Added
- React frontend (Vite + React 18 + TypeScript) — PWA with offline support via vite-plugin-pwa (NetworkFirst strategy)
- `AppShell` — sidebar nav, topbar with search/notifications/profile dropdown, PIN lock screen
- `LoginPage` — animated gradient, glass card, 4-step onboarding PIN flow
- `DashboardPage` — 2-col layout: daily agenda with EN CURSO indicator, filter tabs (Todas/Próxima/Confirmadas/Pendientes/Completadas), appointment rows with avatar/modality badge/expand; Inbox Clínico panel with urgent badges; Acciones rápidas
- `NewAppointmentPage` — 3-col layout: MiniCalendar + patient search with initials avatar; 24-slot time grid (08:00–19:30); 6 session types; modality, recurrence, reminder; live summary panel with progress bar and confirm modal
- `PatientsPage` — debounced search with live results list
- `PatientProfilePage` — tabbed profile: historia clínica, citas, borradores IA, documentos
- `AIDraftPage` — SOAP section viewer/editor, status polling, approve flow
- API client with automatic JWT refresh (401 → tryRefresh → retry)
- CSS design system — full token palette (teal, slate scale), card utilities, all animations

### Changed
- `display_name` field added to `Me` interface

### Fixed
- Timezone bug: all date/time constructions now use `localISO()` with browser UTC offset — appointments after 19:00 in Colombia (UTC-5) no longer saved or queried on the wrong day
- `todayISO()` uses local date parts instead of UTC slice to avoid off-by-one after 19:00

### Added (Business Rules — frontend validation)
- Past time slots blocked with 30-min buffer from current time
- Same-patient double-booking blocked per day (crisis sessions exempt)
- Inactive patient blocks new appointment creation
- Staff workload warning at ≥8 appointments/day, hard block at ≥12
- Blocking errors surfaced inline and in summary panel before submission

---

## [0.3.0] — 2026-05-04 · PR #3 · feature/bc4-ai-motor

Completes Fase 4 (Motor IA). Adds BC-4 Appointments and the full Whisper → NER → Claude → encrypt pipeline.

### Added
- BC-4 Appointments: `POST /api/v1/appointments`, `GET /appointments`, `GET /appointments/{id}`, `DELETE /appointments/{id}` (cancel with reason)
- `POST /api/v1/appointments/{id}/audio` — multipart upload, saves to `/data/audio/{org}/{appt}/{file}`, creates `ai_draft` (PENDING), enqueues job to Redis Stream `ai_jobs`
- `GET /api/v1/ai-drafts/{id}` — fetch draft status and metadata
- `internal/aidrafts` — domain, repository, service, handler following established pattern
- `shared/config.AudioDir` — configurable audio storage path via `AUDIO_DIR` env var
- `services/ai-service/src/ai_service/crypto.py` — AES-256-GCM seal/open mirroring Go's shared/crypto; wire-compatible
- AI worker (`worker.py`) rewritten: consumes `ai_jobs` stream → Whisper transcription → spaCy NER anonymization → Claude SOAP extraction → encrypts outputs with draft's DEK before storing
- Migration `000002`: `ALTER TABLE ai_drafts ADD COLUMN audio_path_enc BYTEA`

### Changed
- `config.py` (ai-service): added `master_key` field for DEK decryption
- `docker-compose.yml`: `AUDIO_DIR=/data/audio` injected into core-api environment

---

## [0.2.1] — 2026-04-29 · PR #2 · feature/bc3-patients

Completes Phase 3 (BC-3 Patients). `0.2.0` covered BC-1 Auth; `0.2.1` adds BC-3 Patients and consolidates shared infrastructure.

### Added
- BC-3 Patients: `POST /api/v1/patients`, `GET /patients`, `GET /patients/{id}`, `PUT /patients/{id}`, `DELETE /patients/{id}` (soft deactivate)
- Envelope encryption per patient — unique DEK per record, encrypted with `MASTER_KEY` via `shared/crypto.KeyManager`
- AES-256-GCM encryption of all PII fields (`first_name`, `paternal_last_name`, `document_number`, `phone`, `email`, `address`, etc.)
- SHA-256 hashed indexes for searchable fields (`paternal_last_name_hash`, `doc_search_hash`) — no plaintext in DB
- `shared/hash` package — single `Normalize()` (lowercase + trim + SHA-256) used by all BCs
- `shared/httputil.ErrorMapper` + `WriteErrorFrom()` — standard domain→HTTP error mapping pattern for every handler
- `patients/dto` package — exported `PatientResponse` and `ToResponse()`, reusable within the BC
- `auth/dto` package — `LoginRequest`, `RefreshRequest`, `LogoutRequest` extracted from handler

### Changed
- Domain files split by concern in both BCs: structs → `models.go`, interface → `repository.go`, sentinel errors → `errors.go`
- Handler packages structured consistently: `handler.go` (struct + New), `ports.go` (svcPort + compile-time check), `routes.go`, `errors.go` (domain→HTTP map)
- `auth/service/login.go` and `auth/repository/helpers.go` use `shared/hash.Normalize()` — `auth.HashEmail()` removed
- `patients/service` use cases use `shared/hash.Normalize()` — `hashField()` local function removed
- Service input types centralised in `patients/service/inputs.go`

### Removed
- `auth/hash.go` — replaced by `shared/hash`
- `auth/handler/helpers.go` — replaced by `shared/httputil`
- `patients/handler/response.go` — promoted to `patients/dto/response.go`

---

## [0.2.0] — 2026-04-26 · PR #1 · feature/bc1-auth

### Added
- BC-1 Auth: `POST /api/v1/auth/login`, `/refresh`, `/logout`, `GET /auth/me`
- Account lockout after 5 failed attempts (15 min cooldown)
- Refresh token rotation — old token deleted before issuing new one
- `audit_log` entry on every auth event (success and failure)
- `shared/token` package — `Claims` and `Pair` decoupled from `net/http`
- `middleware.RequireAuth` and `middleware.RequirePermission` fully operational
- Permissions embedded in JWT at login — no DB call per request for RBAC

### Changed
- `cmd/api/main.go` split into `main.go` / `app.go` / `routes.go`
- `auth/` restructured into `domain / repository / service / handler` layers
- `Claims` moved from `middleware` to `shared/token`

---

## [0.1.0] — 2026-04-26 · Phases 1 & 2

### Added
- RFC-001: business requirements and system overview
- ADR-001 through ADR-006: Go, PostgreSQL + AES encryption, VPS Bootstrap,
  local Whisper + Claude API, React PWA, outbox pattern
- C4 architecture diagrams (context, container, component, bounded contexts)
- Full PostgreSQL schema: 27 tables, 5 bounded contexts, RLS, RBAC seed data
- Security blind variables document (10 legal/operational risks pre go-live)
- `docker-compose.yml`: postgres 16, redis 7, caddy, core-api, ai-service
- `Makefile`: dev lifecycle commands (up / down / migrate / test / lint / sqlc)
- `scripts/backup.sh`: pg_dump + GPG encryption + Backblaze B2 upload
- Go scaffold: chi router, AES-256-GCM KeyManager, pgx pool, Redis, outbox publisher
- Python AI service scaffold: Whisper transcription, Claude API SOAP extraction, NER anonymizer
- Migration `000001`: full schema applied and verified
