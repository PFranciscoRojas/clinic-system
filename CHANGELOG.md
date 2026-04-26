# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

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
