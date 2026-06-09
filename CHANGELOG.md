# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

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
