# PR 2 — Informed Consent Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full informed-consent lifecycle: editable templates, in-office digital signature, remote signature via emailed link, physical-scan upload, document viewer, revocation, and a derived consent chip on each appointment.

**Architecture:** Extends the existing `consents` bounded context (Go, handler+repo pattern, AES-256-GCM per-document DEK). Two new tables (`consent_templates`, `consent_sign_tokens`), three new columns on `consents`. Public sign endpoints reuse the Fase-0 rate-limit middleware. Frontend follows existing card/modal patterns; the remote sign page is a public SPA route.

**Tech Stack:** Go 1.22 + chi + pgx, PostgreSQL 16, React + TS, Resend (email).

**Branch:** create `feature/consent-management` from `main` AFTER PR 1 merges.

**Repo:** `/Users/frarojas/AProjects/clinic-system`

**Spec:** `docs/superpowers/specs/2026-06-09-consents-and-agenda-fixes-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `services/core-api/migrations/000010_consent_management.{up,down}.sql` | Create | Tables, columns, seed templates, permissions |
| `services/core-api/internal/consents/models.go` | Modify | Template, SignToken, extended CreateParams |
| `services/core-api/internal/consents/templates.go` | Create | Pure logic: evidence JSON, token hashing, validation (unit-tested) |
| `services/core-api/internal/consents/templates_test.go` | Create | Unit tests for the above |
| `services/core-api/internal/consents/repository/repository.go` | Modify | New queries (templates, tokens, document, revoke, patient email) |
| `services/core-api/internal/consents/handler/handler.go` | Modify | Authenticated endpoints |
| `services/core-api/internal/consents/handler/public.go` | Create | Public sign endpoints |
| `services/core-api/internal/notify/notifier.go`, `resend.go`, `templates.go` | Modify | ConsentSignLink email |
| `services/core-api/cmd/api/routes.go` | Modify | Mount new routes |
| `services/core-api/cmd/api/config*.go` (wherever cfg lives) | Modify | `APP_BASE_URL` |
| `services/frontend/src/api/clinicalRecords.ts` | Modify | consentsApi + consentTemplatesApi |
| `services/frontend/src/components/consents/SignatureCanvas.tsx` | Create | Draw/clear/export signature |
| `services/frontend/src/components/consents/ConsentSignModal.tsx` | Create | Read text + accept + sign (in-office) |
| `services/frontend/src/components/consents/ConsentViewModal.tsx` | Create | View signed doc/signature/file/evidence |
| `services/frontend/src/pages/Public/ConsentSignPage.tsx` | Create | Remote sign page `/sign/:token` |
| `services/frontend/src/pages/Patients/PatientProfilePage.tsx` | Modify | Rewrite ConsentimientosTab |
| `services/frontend/src/pages/Appointments/AppointmentPage.tsx` | Modify | Consent chip |
| `services/frontend/src/pages/Settings/SettingsPage.tsx` | Modify | Consent template editor section |
| `services/frontend/src/App.tsx` | Modify | Public route |

---

### Task 1: Migration 000010 — schema + seed

**Files:**
- Create: `services/core-api/migrations/000010_consent_management.up.sql`
- Create: `services/core-api/migrations/000010_consent_management.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- 000010_consent_management.up.sql

-- Editable consent document text, versioned per type. Plain TEXT: templates
-- contain no PII. Signed consents snapshot the exact text into consents.document_enc,
-- so editing a template never alters an existing signature.
CREATE TABLE consent_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    consent_type    consent_type NOT NULL,
    version         INT  NOT NULL DEFAULT 1,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    updated_by      UUID NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, consent_type, version)
);
CREATE UNIQUE INDEX idx_consent_templates_active
    ON consent_templates (organization_id, consent_type) WHERE is_active;

-- Single-use remote-signature links. Only the SHA-256 of the token is stored.
CREATE TABLE consent_sign_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    consent_type    consent_type NOT NULL,
    template_id     UUID NOT NULL REFERENCES consent_templates(id),
    token_hash      TEXT NOT NULL UNIQUE,
    created_by      UUID NOT NULL REFERENCES users(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- scan_file_enc: uploaded signed PDF/photo, AES-256-GCM with the row DEK, stored
-- in-DB so the existing daily pg_dump backups cover it (low volume, single clinic).
-- evidence_enc: encrypted JSON {accepted_at, channel, ip, user_agent}.
ALTER TABLE consents ADD COLUMN scan_file_enc BYTEA;
ALTER TABLE consents ADD COLUMN evidence_enc  BYTEA;
ALTER TABLE consents ADD COLUMN template_id   UUID REFERENCES consent_templates(id);

-- Starter templates for every org (Marcela edits them in Settings).
INSERT INTO consent_templates (organization_id, consent_type, version, title, body, updated_by)
SELECT o.id, t.consent_type, 1, t.title, t.body, u.id
FROM organizations o
CROSS JOIN (VALUES
    ('TREATMENT'::consent_type, 'Consentimiento informado para atención psicológica',
     E'Declaro que he sido informado(a) sobre la naturaleza, objetivos y alcance de la atención psicológica que recibiré, conforme a la Ley 1090 de 2006.\n\nEntiendo que la información compartida en sesión es confidencial y está protegida por el secreto profesional, con las excepciones que la ley contempla (riesgo para la vida propia o de terceros, requerimiento judicial).\n\nAcepto voluntariamente iniciar este proceso de atención psicológica.'),
    ('DATA_PROCESSING'::consent_type, 'Autorización para el tratamiento de datos personales',
     E'Autorizo el tratamiento de mis datos personales, incluidos datos sensibles de salud, conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013, con la finalidad exclusiva de la prestación del servicio de atención psicológica y la gestión de mi historia clínica.\n\nConozco mis derechos a conocer, actualizar, rectificar y suprimir mis datos, y a revocar esta autorización.'),
    ('RECORDING'::consent_type, 'Consentimiento para grabación de sesiones',
     E'Autorizo la grabación de audio de mis sesiones con fines exclusivos de apoyo a la elaboración de la nota clínica. El audio se procesa en la infraestructura del prestador, no se comparte con terceros y puedo revocar esta autorización en cualquier momento.'),
    ('INFORMATION_SHARING'::consent_type, 'Autorización para compartir información clínica',
     E'Autorizo compartir la información clínica estrictamente necesaria con los terceros que yo indique expresamente (otros profesionales de salud, EPS, familiares autorizados), conforme a la Ley 23 de 1981 y la Resolución 1995 de 1999.')
) AS t(consent_type, title, body)
CROSS JOIN LATERAL (
    SELECT id FROM users
    WHERE organization_id = o.id
    ORDER BY created_at ASC LIMIT 1
) AS u;
```

- [ ] **Step 2: Write the down migration**

```sql
-- 000010_consent_management.down.sql
ALTER TABLE consents DROP COLUMN IF EXISTS template_id;
ALTER TABLE consents DROP COLUMN IF EXISTS evidence_enc;
ALTER TABLE consents DROP COLUMN IF EXISTS scan_file_enc;
DROP TABLE IF EXISTS consent_sign_tokens;
DROP TABLE IF EXISTS consent_templates;
```

- [ ] **Step 3: Check permission codes**

```bash
grep -n "consents:" services/core-api/migrations/000005_seed_role_permissions.up.sql
```
If `consents:update` does not exist, append to the up migration: INSERT the permission `consents:update` (description: "Revoke consents and manage templates") and grant it to `CLINIC_ADMIN` and `PROFESSIONAL` following the exact INSERT pattern used in 000005. Revoke + template editing will require it.

- [ ] **Step 4: Apply locally and verify**

```bash
make migrate-up
docker compose exec -T postgres psql -U postgres -d sghcp -c "SELECT consent_type, version, title FROM consent_templates;"
```
Expected: 4 rows per organization.

- [ ] **Step 5: Commit**

```bash
git add services/core-api/migrations/000010_consent_management.*
git commit -m "feat(consents): schema for templates, sign tokens, scan storage and evidence"
```

---

### Task 2: Pure domain logic + unit tests (TDD)

**Files:**
- Create: `services/core-api/internal/consents/templates.go`
- Create: `services/core-api/internal/consents/templates_test.go`
- Modify: `services/core-api/internal/consents/models.go`

- [ ] **Step 1: Write the failing tests first**

```go
// templates_test.go
package consents

import (
	"strings"
	"testing"
	"time"
)

func TestHashToken_Deterministic(t *testing.T) {
	a := HashToken("abc123")
	b := HashToken("abc123")
	if a != b || len(a) != 64 {
		t.Fatalf("expected stable 64-char hex hash, got %q / %q", a, b)
	}
	if HashToken("other") == a {
		t.Fatal("different tokens must hash differently")
	}
}

func TestNewSignToken_RandomAndLongEnough(t *testing.T) {
	tok1, err := NewSignToken()
	if err != nil {
		t.Fatal(err)
	}
	tok2, _ := NewSignToken()
	if tok1 == tok2 {
		t.Fatal("tokens must be random")
	}
	if len(tok1) < 40 { // 32 bytes base64url ≈ 43 chars
		t.Fatalf("token too short: %d", len(tok1))
	}
}

func TestValidateSignature(t *testing.T) {
	if err := ValidateSignature(true, "data:image/png;base64,iVBORw0KGgo="); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	if err := ValidateSignature(false, "data:image/png;base64,iVBORw0KGgo="); err == nil {
		t.Fatal("must reject when not accepted")
	}
	if err := ValidateSignature(true, ""); err == nil {
		t.Fatal("must reject empty signature")
	}
	if err := ValidateSignature(true, "not-a-data-url"); err == nil {
		t.Fatal("must reject non-PNG payload")
	}
	if err := ValidateSignature(true, "data:image/png;base64,"+strings.Repeat("A", 700_000)); err == nil {
		t.Fatal("must reject oversized signature (>500KB)")
	}
}

func TestValidateUpload(t *testing.T) {
	if err := ValidateUpload("application/pdf", 1024); err != nil {
		t.Fatalf("pdf rejected: %v", err)
	}
	if err := ValidateUpload("image/jpeg", 1024); err != nil {
		t.Fatal("jpeg rejected")
	}
	if err := ValidateUpload("image/png", 1024); err != nil {
		t.Fatal("png rejected")
	}
	if err := ValidateUpload("text/html", 1024); err == nil {
		t.Fatal("must reject html")
	}
	if err := ValidateUpload("application/pdf", 11*1024*1024); err == nil {
		t.Fatal("must reject >10MB")
	}
}

func TestBuildEvidence(t *testing.T) {
	at := time.Date(2026, 6, 9, 15, 0, 0, 0, time.UTC)
	got := BuildEvidence(at, ChannelRemoteLink, "1.2.3.4", "Mozilla/5.0")
	for _, want := range []string{`"accepted_at":"2026-06-09T15:00:00Z"`, `"channel":"REMOTE_LINK"`, `"ip":"1.2.3.4"`, `"user_agent":"Mozilla/5.0"`} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("evidence missing %s: %s", want, got)
		}
	}
}

func TestTokenUsable(t *testing.T) {
	now := time.Now()
	ok := SignToken{ExpiresAt: now.Add(time.Hour)}
	if err := ok.Usable(now); err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	expired := SignToken{ExpiresAt: now.Add(-time.Hour)}
	if err := expired.Usable(now); err != ErrTokenExpired {
		t.Fatal("expired token must return ErrTokenExpired")
	}
	usedAt := now.Add(-time.Minute)
	used := SignToken{ExpiresAt: now.Add(time.Hour), UsedAt: &usedAt}
	if err := used.Usable(now); err != ErrTokenUsed {
		t.Fatal("used token must return ErrTokenUsed")
	}
}
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd services/core-api && go test ./internal/consents/
```
Expected: compile errors (functions undefined).

- [ ] **Step 3: Implement `templates.go` + model additions**

```go
// templates.go
package consents

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	ChannelInOffice   = "IN_OFFICE"
	ChannelRemoteLink = "REMOTE_LINK"

	maxSignatureB64 = 500 * 1024        // 500 KB drawn-signature PNG
	maxUploadBytes  = 10 * 1024 * 1024  // 10 MB scanned document
	signTokenTTL    = 7 * 24 * time.Hour
)

var (
	ErrTokenExpired = errors.New("sign token expired")
	ErrTokenUsed    = errors.New("sign token already used")
	ErrNotAccepted  = errors.New("consent must be explicitly accepted")
	ErrBadSignature = errors.New("signature must be a PNG data URL under 500KB")
	ErrBadUpload    = errors.New("upload must be PDF/JPEG/PNG under 10MB")
)

// NewSignToken returns a 32-byte random URL-safe token. Only its hash is persisted.
func NewSignToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate sign token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum[:])
}

func TokenTTL() time.Duration { return signTokenTTL }

func ValidateSignature(accepted bool, signatureDataURL string) error {
	if !accepted {
		return ErrNotAccepted
	}
	if !strings.HasPrefix(signatureDataURL, "data:image/png;base64,") {
		return ErrBadSignature
	}
	if len(signatureDataURL) > maxSignatureB64 || len(signatureDataURL) == len("data:image/png;base64,") {
		return ErrBadSignature
	}
	return nil
}

func ValidateUpload(contentType string, size int64) error {
	switch contentType {
	case "application/pdf", "image/jpeg", "image/png":
	default:
		return ErrBadUpload
	}
	if size <= 0 || size > maxUploadBytes {
		return ErrBadUpload
	}
	return nil
}

// BuildEvidence serializes the read-and-accepted proof; callers encrypt it with the row DEK.
func BuildEvidence(acceptedAt time.Time, channel, ip, userAgent string) []byte {
	out, _ := json.Marshal(map[string]string{
		"accepted_at": acceptedAt.UTC().Format(time.RFC3339),
		"channel":     channel,
		"ip":          ip,
		"user_agent":  userAgent,
	})
	return out
}

// Usable reports whether a sign token can still be redeemed.
func (t SignToken) Usable(now time.Time) error {
	if t.UsedAt != nil {
		return ErrTokenUsed
	}
	if now.After(t.ExpiresAt) {
		return ErrTokenExpired
	}
	return nil
}
```

Add to `models.go`:

```go
// Template is one version of a consent document's editable text.
type Template struct {
	ID             string
	OrganizationID string
	ConsentType    ConsentType
	Version        int
	Title          string
	Body           string
	UpdatedBy      string
	IsActive       bool
	CreatedAt      time.Time
}

// SignToken is a single-use remote-signature link.
type SignToken struct {
	ID             string
	OrganizationID string
	PatientID      string
	ConsentType    ConsentType
	TemplateID     string
	TokenHash      string
	CreatedBy      string
	ExpiresAt      time.Time
	UsedAt         *time.Time
}
```

Extend `CreateParams` in `models.go` with:

```go
	SignatureEnc []byte
	ScanFileEnc  []byte
	EvidenceEnc  []byte
	TemplateID   string
	SigningMethod string // "DIGITAL" | "PHYSICAL_SCAN"
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd services/core-api && go test ./internal/consents/ -v
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add services/core-api/internal/consents/
git commit -m "feat(consents): domain logic for tokens, evidence and validations"
```

---

### Task 3: Repository — new queries

**Files:**
- Modify: `services/core-api/internal/consents/repository/repository.go` (follow the existing pgx query style in that file; mimic `internal/clinicalrecords/repository` for scan patterns)
- Modify: `services/core-api/internal/consents/repository.go` (interface)

- [ ] **Step 1: Add interface methods** (`internal/consents/repository.go`)

```go
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	List(ctx context.Context, orgID, patientID string) ([]*Consent, error)

	ListActiveTemplates(ctx context.Context, orgID string) ([]*Template, error)
	GetActiveTemplate(ctx context.Context, orgID string, ct ConsentType) (*Template, error)
	GetTemplateByID(ctx context.Context, templateID string) (*Template, error)
	CreateTemplateVersion(ctx context.Context, orgID string, ct ConsentType, title, body, updatedBy string) (*Template, error)

	CreateSignToken(ctx context.Context, t SignToken) (string, error)
	GetSignToken(ctx context.Context, tokenHash string) (*SignToken, error)
	MarkTokenUsed(ctx context.Context, id string) error

	// GetDocument returns the encrypted payloads plus the DEK row needed to open them.
	GetDocument(ctx context.Context, orgID, consentID string) (*ConsentDocument, error)
	Revoke(ctx context.Context, orgID, consentID, reason string) error

	// PatientContact returns the encrypted email + DEK for the sign-link email.
	PatientContact(ctx context.Context, orgID, patientID string) (emailEnc []byte, dek EncKeyRow, firstNameEnc []byte, err error)
}
```

Add `ConsentDocument` to `models.go`:

```go
type ConsentDocument struct {
	Consent
	DocumentEnc  []byte
	SignatureEnc []byte
	ScanFileEnc  []byte
	ScanFileType string
	EvidenceEnc  []byte
	DEK          EncKeyRow
}
```

- [ ] **Step 2: Implement the queries**

Implementation notes (follow the file's existing style — plain pgx, `fmt.Errorf` wrapping):
- `CreateTemplateVersion`: in a transaction — `UPDATE consent_templates SET is_active = FALSE WHERE organization_id=$1 AND consent_type=$2 AND is_active`, then `INSERT ... version = (SELECT COALESCE(MAX(version),0)+1 ...) RETURNING *`.
- `GetSignToken`: `SELECT ... FROM consent_sign_tokens WHERE token_hash = $1`.
- `GetDocument`: join `consents c` with `encryption_keys k ON k.id = c.dek_id`, filter by `c.id` AND `c.organization_id`.
- `Revoke`: `UPDATE consents SET revoked_at = NOW(), revocation_reason = $3 WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL`; return `ErrNotFound` (add to `errors.go` if absent) when `RowsAffected()==0`.
- `PatientContact`: `SELECT p.email_enc, p.first_name_enc, k.id, k.encrypted_dek, k.key_source FROM patients p JOIN encryption_keys k ON k.id = p.dek_id WHERE p.id=$1 AND p.organization_id=$2` (verify the patients DEK column name with `grep -n "dek_id" services/core-api/migrations/000001_initial_schema.up.sql` and match it).
- `Create`: extend the INSERT with `signature_enc, scan_file_enc, evidence_enc, template_id, signing_method` from the extended `CreateParams`.

- [ ] **Step 3: Build**

```bash
cd services/core-api && go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add services/core-api/internal/consents/
git commit -m "feat(consents): repository queries for templates, tokens, documents"
```

---

### Task 4: Notify — consent sign-link email

**Files:**
- Modify: `services/core-api/internal/notify/notifier.go`, `resend.go`, `templates.go`

- [ ] **Step 1: Extend the interface and noop** (`notifier.go`)

```go
type Notifier interface {
	NewBooking(ctx context.Context, b BookingDetails, adminEmails []string)
	BookingConfirmed(ctx context.Context, b BookingDetails)
	BookingRejected(ctx context.Context, b BookingDetails)
	ConsentSignLink(ctx context.Context, toEmail, patientFirstName, consentTitle, link string)
}

func (NoopNotifier) ConsentSignLink(_ context.Context, _, _, _, _ string) {}
```

- [ ] **Step 2: Template + Resend implementation**

In `templates.go` add (mirror the style of `renderConfirmed`):

```go
func renderConsentSignLink(firstName, title, link string) (string, error) {
	return renderBase(fmt.Sprintf(`
		<p>Hola %s,</p>
		<p>Tu psicóloga te ha enviado el documento <strong>%s</strong> para tu lectura y firma.</p>
		<p><a href="%s" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Leer y firmar</a></p>
		<p style="color:#64748b;font-size:13px">El enlace es personal, de un solo uso y vence en 7 días.</p>
	`, html.EscapeString(firstName), html.EscapeString(title), link))
}
```
(Adapt to the actual helper names in `templates.go` — read the file first and reuse its base-layout function. If there is no `renderBase`, inline the same HTML wrapper the booking emails use.)

In `resend.go` add `ConsentSignLink` mirroring `BookingConfirmed` (goroutine + send, subject: `"Documento de consentimiento para tu firma"`).

- [ ] **Step 3: Build + commit**

```bash
cd services/core-api && go build ./... && git add internal/notify/ && git commit -m "feat(notify): consent sign-link email"
```

---

### Task 5: Authenticated handlers

**Files:**
- Modify: `services/core-api/internal/consents/handler/handler.go`

**Pattern notes:** audit writes copy `writePatientAudit` from `internal/patients/handler/handler.go:23`; DEK decrypt/seal pattern is already in this handler's `create` (lines 72–96).

- [ ] **Step 1: Replace the placeholder `create` endpoint and add new routes**

New `Routes()` (mounted at `/api/v1/patients/{patient_id}/consents`):

```go
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:read")).Get("/", h.list)
	r.With(middleware.RequirePermission("consents:create")).Post("/sign", h.signInOffice)
	r.With(middleware.RequirePermission("consents:create")).Post("/upload", h.upload)
	r.With(middleware.RequirePermission("consents:create")).Post("/send-link", h.sendLink)
	return r
}

// OrgRoutes is mounted at /api/v1/consents (cross-patient operations by consent id).
func (h *Handler) OrgRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:read")).Get("/{id}/document", h.document)
	r.With(middleware.RequirePermission("consents:update")).Post("/{id}/revoke", h.revoke)
	return r
}

// TemplateRoutes is mounted at /api/v1/consent-templates.
func (h *Handler) TemplateRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:read")).Get("/", h.listTemplates)
	r.With(middleware.RequirePermission("consents:update")).Put("/{type}", h.updateTemplate)
	return r
}
```

Delete the old `create` handler (placeholder "pending-scan" flow) — replaced by `signInOffice` / `upload` / `sendLink`.

- [ ] **Step 2: Implement handlers**

Behavior contracts (each one: decode → validate with the Task-2 funcs → DEK via `h.km.GenerateDEK()` + `h.repo.CreateEncKey` → `crypto.Seal` each payload → `h.repo.Create` → audit → JSON):

- `signInOffice` — body `{consent_type, accepted bool, signature_png string}`. Load active template (404 `template not found` if missing). `ValidateSignature(accepted, signature_png)` → 422 on error. Seal: `document_enc` = template body, `signature_enc` = signature data URL bytes, `evidence_enc` = `BuildEvidence(now, ChannelInOffice, realIP(r), r.UserAgent())`. `document_template_hash` = sha256 hex of template body. `SigningMethod: "DIGITAL"`. Audit action `consent.sign`. Respond `201 {id}`.
- `upload` — `r.ParseMultipartForm(11 << 20)`; fields `consent_type`, `signed_at` (YYYY-MM-DD), file field `file`. Detect content type via `http.DetectContentType` of the first 512 bytes; `ValidateUpload(ct, size)` → 422. Seal file bytes into `scan_file_enc`; `document_enc` = active template body snapshot (hash too); `SigningMethod: "PHYSICAL_SCAN"`, `scan_file_type` = "PDF"|"JPEG"|"PNG". Audit `consent.upload`. `201 {id}`.
- `sendLink` — body `{consent_type}`. Load active template; `NewSignToken()`; store `SignToken{TokenHash: HashToken(tok), ExpiresAt: now.Add(TokenTTL()), ...}`; decrypt patient email + first name via `PatientContact` + `km.DecryptDEK` + `crypto.Open` (mirror how `bookingrequests/handler` decrypts patient fields — read it first); call `h.notifier.ConsentSignLink(ctx, email, firstName, tpl.Title, h.appBaseURL+"/sign/"+tok)`. Audit `consent.send_link`. `202 {expires_at}`. If patient has no email → 422 `patient has no email on file`.
- `document` — `GetDocument`; decrypt DEK once; `crypto.Open` each non-nil payload; respond JSON `{id, consent_type, signing_method, signed_at, revoked_at, template_id, document_text, signature_png, scan_file_base64, scan_file_type, evidence}` (evidence = parsed JSON object; omit nil fields). Audit `consent.view_document`.
- `revoke` — body `{reason}` (required, 422 if empty). `Revoke` → 404 if no row. Audit `consent.revoke`. `204`.
- `listTemplates` / `updateTemplate` — straightforward; `updateTemplate` body `{title, body}`, both required (422), type from URL must be one of the 4 (`422` otherwise). Returns the new version.

`Handler` struct gains `notifier notify.Notifier` and `appBaseURL string`; update `New(...)`.

Also extend `list` output with `"has_document": true` when `signing_method` is set (it always is) — and add `template_id`.

- [ ] **Step 3: Build + run all tests**

```bash
cd services/core-api && go build ./... && go test ./...
```

- [ ] **Step 4: Commit**

```bash
git add services/core-api/internal/consents/
git commit -m "feat(consents): sign, upload, send-link, document, revoke, template endpoints"
```

---

### Task 6: Public sign endpoints

**Files:**
- Create: `services/core-api/internal/consents/handler/public.go`
- Modify: `services/core-api/cmd/api/routes.go`
- Modify: config struct + `.env.example` (add `APP_BASE_URL`)

- [ ] **Step 1: Implement `public.go`**

```go
package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/consents"
	"sghcp/core-api/internal/shared/httputil"
)

// PublicRoutes serves the remote-signature flow. No JWT — the single-use token
// is the credential. Mounted behind the per-IP rate limiter.
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/sign/{token}", h.publicGetSign)
	r.Post("/sign/{token}", h.publicPostSign)
	return r
}

func (h *Handler) publicGetSign(w http.ResponseWriter, r *http.Request) {
	tok, err := h.repo.GetSignToken(r.Context(), consents.HashToken(chi.URLParam(r, "token")))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "invalid link")
		return
	}
	if err := tok.Usable(time.Now()); err != nil {
		httputil.WriteError(w, http.StatusGone, publicTokenErr(err))
		return
	}
	// Template snapshot pinned at link creation time (template_id), not "current active".
	tpl, err := h.repo.GetTemplateByID(r.Context(), tok.TemplateID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	firstName, err := h.patientFirstName(r.Context(), tok.OrganizationID, tok.PatientID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"patient_first_name": firstName,
		"consent_type":       tok.ConsentType,
		"title":              tpl.Title,
		"body":               tpl.Body,
		"expires_at":         tok.ExpiresAt,
	})
}

func (h *Handler) publicPostSign(w http.ResponseWriter, r *http.Request) {
	tok, err := h.repo.GetSignToken(r.Context(), consents.HashToken(chi.URLParam(r, "token")))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "invalid link")
		return
	}
	if err := tok.Usable(time.Now()); err != nil {
		httputil.WriteError(w, http.StatusGone, publicTokenErr(err))
		return
	}
	var body struct {
		Accepted     bool   `json:"accepted"`
		SignaturePNG string `json:"signature_png"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := consents.ValidateSignature(body.Accepted, body.SignaturePNG); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	// createSigned: same seal-and-insert path as signInOffice, with
	// channel REMOTE_LINK, staff = token creator, and the token's pinned template.
	id, err := h.createSigned(r.Context(), tok, body.SignaturePNG, consents.ChannelRemoteLink, realIP(r), r.UserAgent())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.repo.MarkTokenUsed(r.Context(), tok.ID); err != nil {
		// Consent stored; the unusable token is a logged inconsistency, not a user error.
		slog.Error("mark consent token used", "err", err, "token_id", tok.ID)
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func publicTokenErr(err error) string {
	switch err {
	case consents.ErrTokenUsed:
		return "this document was already signed"
	case consents.ErrTokenExpired:
		return "this link expired"
	default:
		return "invalid link"
	}
}
```

Notes: add `GetTemplateByID` to the repo interface; factor the shared seal-and-insert into `createSigned` used by both `signInOffice` and `publicPostSign`; `realIP(r)` = `r.RemoteAddr` (chi `RealIP` middleware already normalizes it globally); `patientFirstName` decrypts via `PatientContact`.

- [ ] **Step 2: Wire routes + config**

In `routes.go`, the consents handler needs the notifier — build it once and reuse:

```go
	consentsH := consentshandler.New(a.pool, a.km, notifier, a.cfg.AppBaseURL)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(10, time.Minute))
		r.Mount("/api/v1/public/consents", consentsH.PublicRoutes())
	})
	// inside the authenticated group:
	r.Mount("/api/v1/patients/{patient_id}/consents", consentsH.Routes())
	r.Mount("/api/v1/consents", consentsH.OrgRoutes())
	r.Mount("/api/v1/consent-templates", consentsH.TemplateRoutes())
```

(The notifier variable is currently declared after the public group — move its declaration above both groups.)

Config: find the config struct (`grep -rn "ResendFrom" services/core-api/`), add `AppBaseURL string` read from env `APP_BASE_URL` with default `http://localhost:5173`; document in `.env.example` (prod value: the SPA origin, e.g. `https://app.marcelachapues.com` — confirm the real frontend origin from the VPS Caddyfile before deploy).

- [ ] **Step 3: Build + tests + commit**

```bash
cd services/core-api && go build ./... && go test ./...
git add services/core-api/ && git commit -m "feat(consents): public remote-signature endpoints with single-use tokens"
```

---

### Task 7: Frontend API client + SignatureCanvas

**Files:**
- Modify: `services/frontend/src/api/clinicalRecords.ts:103-107`
- Create: `services/frontend/src/components/consents/SignatureCanvas.tsx`

- [ ] **Step 1: Replace consentsApi and add template/public APIs**

```ts
export interface ConsentTemplate {
  id: string; consent_type: ConsentType; version: number;
  title: string; body: string; created_at: string;
}
export interface ConsentDocument {
  id: string; consent_type: ConsentType; signing_method: string;
  signed_at: string; revoked_at: string | null; document_text: string;
  signature_png?: string; scan_file_base64?: string; scan_file_type?: string;
  evidence?: { accepted_at: string; channel: string; ip?: string; user_agent?: string };
}

export const consentsApi = {
  list:     (patientId: string) => api.get<{ items: Consent[] }>(`/patients/${patientId}/consents`),
  sign:     (patientId: string, body: { consent_type: ConsentType; accepted: boolean; signature_png: string }) =>
    api.post<{ id: string }>(`/patients/${patientId}/consents/sign`, body),
  upload:   (patientId: string, form: FormData) =>
    api.post<{ id: string }>(`/patients/${patientId}/consents/upload`, form),
  sendLink: (patientId: string, body: { consent_type: ConsentType }) =>
    api.post<{ expires_at: string }>(`/patients/${patientId}/consents/send-link`, body),
  document: (consentId: string) => api.get<ConsentDocument>(`/consents/${consentId}/document`),
  revoke:   (consentId: string, reason: string) => api.post(`/consents/${consentId}/revoke`, { reason }),
};

export const consentTemplatesApi = {
  list:   () => api.get<{ items: ConsentTemplate[] }>(`/consent-templates`),
  update: (type: ConsentType, body: { title: string; body: string }) =>
    api.put<ConsentTemplate>(`/consent-templates/${type}`, body),
};

// Public (no auth header) — used by the remote sign page.
export const publicConsentsApi = {
  get:  (token: string) => fetch(`${API_BASE}/public/consents/sign/${token}`).then(asJson),
  sign: (token: string, body: { accepted: boolean; signature_png: string }) =>
    fetch(`${API_BASE}/public/consents/sign/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(asJson),
};
```

Adapt to the actual `api` helper in `services/frontend/src/api/` (read `client.ts`/`http.ts` first): reuse its base URL constant for `API_BASE`, and check whether `api.post` supports FormData (it must NOT set `Content-Type: application/json` for the upload — add a raw variant if needed). `asJson` = small helper that throws on `!res.ok`.

- [ ] **Step 2: SignatureCanvas component**

```tsx
// SignatureCanvas.tsx — draw with mouse/finger, expose clear() + isEmpty + toDataURL.
import { useRef, useState, useCallback } from 'react';

export function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e293b';
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (empty) setEmpty(false);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(empty ? null : canvasRef.current!.toDataURL('image/png'));
  };
  const clear = useCallback(() => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true); onChange(null);
  }, [onChange]);

  return (
    <div>
      <canvas
        ref={canvasRef} width={560} height={180}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        style={{ width: '100%', height: 180, border: '1.5px dashed var(--s300)', borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--s400)' }}>Firma del paciente</span>
        <button type="button" onClick={clear} style={{ fontSize: 12, border: 'none', background: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600 }}>Limpiar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
cd services/frontend && npx tsc --noEmit
git add services/frontend/src/api/clinicalRecords.ts services/frontend/src/components/consents/
git commit -m "feat(consents): frontend API client and signature canvas"
```

---

### Task 8: Sign & View modals

**Files:**
- Create: `services/frontend/src/components/consents/ConsentSignModal.tsx`
- Create: `services/frontend/src/components/consents/ConsentViewModal.tsx`

**Pattern:** copy modal scaffolding (overlay, card, close button) from `services/frontend/src/components/patients/EditPatientModal.tsx`.

- [ ] **Step 1: ConsentSignModal**

Props: `{ patientId, consentType, onClose, onSigned }`. Behavior:
1. On mount fetch `consentTemplatesApi.list()` and pick the template for `consentType` (loading spinner meanwhile).
2. Render: title, scrollable body (`maxHeight: 320, overflowY: 'auto'`, `whiteSpace: 'pre-wrap'`), checkbox `Leí y acepto el contenido de este documento`, `<SignatureCanvas>`.
3. Footer button "Guardar firma" disabled until `accepted && signature !== null`; on click → `consentsApi.sign(patientId, { consent_type, accepted: true, signature_png: signature })` → `onSigned()` + close. Show API errors inline (red text, same pattern as EditPatientModal).

- [ ] **Step 2: ConsentViewModal**

Props: `{ consentId, onClose }`. Behavior:
1. Fetch `consentsApi.document(consentId)`.
2. Render: title (type label), badges (method: Consultorio / Remoto / Archivo físico — derive: `PHYSICAL_SCAN` → Archivo, evidence.channel `REMOTE_LINK` → Remoto, else Consultorio), `signed_at`, revoked banner if `revoked_at`.
3. Document text in a scrollable pre-wrap block.
4. If `signature_png`: `<img src={signature_png} style={{ border: '1px solid var(--s200)', borderRadius: 8, maxWidth: '100%' }} />` with caption "Firma del paciente".
5. If `scan_file_base64`: PDF → `<iframe src={`data:application/pdf;base64,${scan_file_base64}`} style={{ width: '100%', height: 480, border: 'none' }} />`; image → `<img src={`data:image/${type};base64,...`}>`.
6. Evidence footer (small gray text): `Aceptado el {accepted_at} · {channel} · IP {ip}`.

- [ ] **Step 3: Type-check + commit**

```bash
cd services/frontend && npx tsc --noEmit
git add services/frontend/src/components/consents/ && git commit -m "feat(consents): sign and view modals"
```

---

### Task 9: ConsentimientosTab rewrite (patient profile)

**Files:**
- Modify: `services/frontend/src/pages/Patients/PatientProfilePage.tsx:266-360` (the `ConsentimientosTab` function)

- [ ] **Step 1: Rewrite the tab**

For each of the 4 types (iterate `CONSENT_TYPE_LABEL`), find the latest non-revoked consent of that type from `consentsApi.list`:

- **Unsigned**: card with type label + three buttons: `Firmar ahora` (opens ConsentSignModal), `Enviar link` (calls `consentsApi.sendLink`, shows toast/inline "Link enviado — vence en 7 días"; disable button 5s), `Subir firmado` (hidden `<input type="file" accept="application/pdf,image/jpeg,image/png">` → FormData with `consent_type`, `signed_at` = today, `file` → `consentsApi.upload`).
- **Signed**: type label, `Firmado el {signed_at}` + method badge, buttons `Ver` (ConsentViewModal) and `Revocar` (inline confirm with required reason textarea → `consentsApi.revoke`).
- **Revoked** (latest is revoked and no newer active): show `Revocado el {revoked_at}` + reason + the three sign buttons again.

Invalidate the `['consents', patientId]` query after every mutation. Keep the existing card/list visual style of the current tab.

- [ ] **Step 2: Type-check + commit**

```bash
cd services/frontend && npx tsc --noEmit
git add services/frontend/src/pages/Patients/PatientProfilePage.tsx
git commit -m "feat(consents): patient consent tab with sign, link, upload, view, revoke"
```

---

### Task 10: Public remote-sign page

**Files:**
- Create: `services/frontend/src/pages/Public/ConsentSignPage.tsx`
- Modify: `services/frontend/src/App.tsx` (route OUTSIDE the auth guard, alongside `/login`)

- [ ] **Step 1: Page**

Route `/sign/:token`. Mobile-first single column (max-width 560, centered, padding 20). States:
- Loading → spinner.
- Error (404/410) → friendly message per API error: "Este enlace no es válido", "Este enlace ya venció — pide uno nuevo a tu psicóloga", "Este documento ya fue firmado. ¡Gracias!".
- Ready → greeting `Hola {patient_first_name}`, document title + scrollable body, accept checkbox, `<SignatureCanvas>`, button `Firmar` (disabled until accepted+signed) → `publicConsentsApi.sign` → success screen "✓ Documento firmado. Ya puedes cerrar esta página."

No AppShell, no auth — standalone layout like the login page (check how `/login` renders outside the shell in `App.tsx:60-75` and mirror it).

- [ ] **Step 2: Route**

In `App.tsx`, next to the login route: `<Route path="/sign/:token" element={<ConsentSignPage />} />`.

- [ ] **Step 3: Type-check + commit**

```bash
cd services/frontend && npx tsc --noEmit
git add services/frontend/src/pages/Public/ services/frontend/src/App.tsx
git commit -m "feat(consents): public remote signature page"
```

---

### Task 11: Appointment consent chip

**Files:**
- Modify: `services/frontend/src/pages/Appointments/AppointmentPage.tsx` (header area, near the status badge)

- [ ] **Step 1: Add the derived chip**

Query `consentsApi.list(appt.patient_id)` (enabled when appt loaded). Derive `treatmentConsent` = latest `TREATMENT` consent with `!revoked_at`.

- Found → chip (same pill style as the status badge): `✓ Consentimiento firmado el {signed_at}` + small `Ver` button → `ConsentViewModal(consentId)`.
- Not found → amber chip `⚠ Sin consentimiento` that links to `/patients/{patient_id}` (profile opens; user clicks the Consentimientos tab — if the profile page supports a `?tab=` param, link directly; check `PatientProfilePage` for tab state initialization and use it if present).

- [ ] **Step 2: Type-check + build + commit**

```bash
cd services/frontend && npx tsc --noEmit && npm run build
git add services/frontend/src/pages/Appointments/AppointmentPage.tsx
git commit -m "feat(appointments): consent status chip with document viewer"
```

---

### Task 12: Settings — template editor

**Files:**
- Modify: `services/frontend/src/pages/Settings/SettingsPage.tsx`

- [ ] **Step 1: New SectionCard "Plantillas de consentimiento"**

Add a `ConsentTemplatesSection` component in the same file (mirror `TemplatesSection` at line ~820, but backed by the real API):
- `useQuery(['consent-templates'], consentTemplatesApi.list)`.
- Each of the 4: row with title, type label, `v{version}`, expand → `title` input + `body` textarea (auto-height, min 220px) + "Guardar nueva versión" button → `consentTemplatesApi.update(type, {title, body})` → invalidate + collapsed state with success note "Versión {n} guardada".
- Helper text at top: "Editar crea una versión nueva. Los consentimientos ya firmados conservan el texto exacto que el paciente aceptó."

- [ ] **Step 2: Type-check + commit**

```bash
cd services/frontend && npx tsc --noEmit
git add services/frontend/src/pages/Settings/SettingsPage.tsx
git commit -m "feat(settings): consent template editor with versioning"
```

---

### Task 13: CHANGELOG, full verification, PR

- [ ] **Step 1: CHANGELOG under [Unreleased]**

```markdown
### Added
- Informed consent management: editable versioned templates, in-office digital signature, remote signature via single-use emailed link, physical-scan upload (PDF/photo), document viewer with signature and acceptance evidence, revocation with reason
- Appointment page shows the covering consent (signed date + view button) or a warning when missing
```

- [ ] **Step 2: Full verification**

```bash
cd services/core-api && go build ./... && go test ./...
cd ../frontend && npx tsc --noEmit && npm run build
```
Expected: all green. Manual smoke test against local stack: sign in-office (draw + save), view document, upload a PDF, send link → open `/sign/{token}` in incognito → sign → token now rejects reuse.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feature/consent-management
gh pr create --title "feat: informed consent management (templates, signatures, remote links, uploads)" --body "$(cat <<'EOF'
## Summary
- Versioned consent templates editable in Settings (signed consents keep their exact snapshot)
- In-office signature (canvas) and remote signature via single-use 7-day emailed link
- Physical-scan upload (PDF/JPEG/PNG ≤10MB) stored encrypted in-DB
- Document viewer: signed text, signature image or file, acceptance evidence (timestamp/channel/IP)
- Revocation with reason (habeas data) and consent chip on every appointment
- Migration 000010; public endpoints rate-limited; everything audited in audit_log

Spec: docs/superpowers/specs/2026-06-09-consents-and-agenda-fixes-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Post-merge deploy (VPS):** stash-dance → pull → run migration 000010 → set `APP_BASE_URL` in `.env` (confirm SPA origin from Caddyfile) → recreate api container → build frontend locally and rsync `dist/`.
