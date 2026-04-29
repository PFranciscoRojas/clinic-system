# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

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
