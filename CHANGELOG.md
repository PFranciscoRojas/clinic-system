# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added
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
- "Cédula / RUT" field from the onboarding wizard (never persisted, Chilean placeholder; the clinical document legally requires name + tarjeta profesional)
- All fabricated UI data: fake notification bell ("3 urgentes"), hardcoded inbox items, "Borradores IA" and "Facturación del mes" tiles, "+3 este mes" badge, "PHQ-9 alto" and "Con pendientes" patient KPIs
- Mock Settings sections: "Plan y facturación" (fictitious SaaS plan), "Integraciones" (fake connect buttons), mock note templates, fictitious active-sessions device list, dead 2FA toggles, raw permission-code list in the profile
- Billing and Evaluations hidden from navigation until their backends exist (code kept as design reference)

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
