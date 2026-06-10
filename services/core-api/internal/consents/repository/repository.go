package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/consents"
)

type Repository struct {
	db *pgxpool.Pool
}

var _ consents.Repository = (*Repository)(nil)

func New(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM') RETURNING id
	`, encryptedDEK, keySource).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert encryption_key: %w", err)
	}
	return id, nil
}

func (r *Repository) Create(ctx context.Context, p consents.CreateParams) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO consents (
			organization_id, patient_id, staff_id, dek_id,
			consent_type, signing_method,
			document_enc, document_template_hash,
			signature_enc, scan_file_enc, scan_file_type,
			evidence_enc, template_id, signed_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULLIF($11, ''), $12, NULLIF($13, '')::uuid, $14)
		RETURNING id
	`,
		p.OrganizationID, p.PatientID, p.StaffID, p.DEKID,
		p.ConsentType, p.SigningMethod,
		p.DocumentEnc, p.DocumentTemplateHash,
		p.SignatureEnc, p.ScanFileEnc, p.ScanFileType,
		p.EvidenceEnc, p.TemplateID, p.SignedAt,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert consent: %w", err)
	}
	return id, nil
}

func (r *Repository) List(ctx context.Context, orgID, patientID string) ([]*consents.Consent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, organization_id, patient_id, staff_id,
		       consent_type, signing_method, signed_at, valid_until, revoked_at, created_at
		FROM consents
		WHERE organization_id = $1 AND patient_id = $2
		ORDER BY signed_at DESC
	`, orgID, patientID)
	if err != nil {
		return nil, fmt.Errorf("list consents: %w", err)
	}
	defer rows.Close()

	var result []*consents.Consent
	for rows.Next() {
		var c consents.Consent
		var validUntil, revokedAt *time.Time
		if err := rows.Scan(
			&c.ID, &c.OrganizationID, &c.PatientID, &c.StaffID,
			&c.ConsentType, &c.SigningMethod, &c.SignedAt, &validUntil, &revokedAt, &c.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan consent: %w", err)
		}
		c.ValidUntil = validUntil
		c.RevokedAt = revokedAt
		result = append(result, &c)
	}
	return result, rows.Err()
}

// ── Templates ─────────────────────────────────────────────────────────────────

const templateCols = `id, organization_id, consent_type, version, title, body, updated_by, is_active, created_at`

func scanTemplate(row pgx.Row) (*consents.Template, error) {
	var t consents.Template
	if err := row.Scan(&t.ID, &t.OrganizationID, &t.ConsentType, &t.Version,
		&t.Title, &t.Body, &t.UpdatedBy, &t.IsActive, &t.CreatedAt); err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) ListActiveTemplates(ctx context.Context, orgID string) ([]*consents.Template, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+templateCols+` FROM consent_templates
		WHERE organization_id = $1 AND is_active
		ORDER BY consent_type
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}
	defer rows.Close()

	var result []*consents.Template
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, fmt.Errorf("scan template: %w", err)
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (r *Repository) GetActiveTemplate(ctx context.Context, orgID string, ct consents.ConsentType) (*consents.Template, error) {
	t, err := scanTemplate(r.db.QueryRow(ctx, `
		SELECT `+templateCols+` FROM consent_templates
		WHERE organization_id = $1 AND consent_type = $2 AND is_active
	`, orgID, ct))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, consents.ErrTemplateNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get active template: %w", err)
	}
	return t, nil
}

func (r *Repository) GetTemplateByID(ctx context.Context, templateID string) (*consents.Template, error) {
	t, err := scanTemplate(r.db.QueryRow(ctx, `
		SELECT `+templateCols+` FROM consent_templates WHERE id = $1
	`, templateID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, consents.ErrTemplateNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get template by id: %w", err)
	}
	return t, nil
}

// CreateTemplateVersion deactivates the current version and inserts the next one.
func (r *Repository) CreateTemplateVersion(ctx context.Context, orgID string, ct consents.ConsentType, title, body, updatedBy string) (*consents.Template, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin template version: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE consent_templates SET is_active = FALSE
		WHERE organization_id = $1 AND consent_type = $2 AND is_active
	`, orgID, ct); err != nil {
		return nil, fmt.Errorf("deactivate template: %w", err)
	}

	t, err := scanTemplate(tx.QueryRow(ctx, `
		INSERT INTO consent_templates (organization_id, consent_type, version, title, body, updated_by)
		VALUES ($1, $2,
			(SELECT COALESCE(MAX(version), 0) + 1 FROM consent_templates
			 WHERE organization_id = $1 AND consent_type = $2),
			$3, $4, $5)
		RETURNING `+templateCols,
		orgID, ct, title, body, updatedBy))
	if err != nil {
		return nil, fmt.Errorf("insert template version: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit template version: %w", err)
	}
	return t, nil
}

// ── Sign tokens ───────────────────────────────────────────────────────────────

func (r *Repository) CreateSignToken(ctx context.Context, t consents.SignToken) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO consent_sign_tokens
			(organization_id, patient_id, consent_type, template_id, token_hash, created_by, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, t.OrganizationID, t.PatientID, t.ConsentType, t.TemplateID, t.TokenHash, t.CreatedBy, t.ExpiresAt).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert sign token: %w", err)
	}
	return id, nil
}

func (r *Repository) GetSignToken(ctx context.Context, tokenHash string) (*consents.SignToken, error) {
	var t consents.SignToken
	err := r.db.QueryRow(ctx, `
		SELECT id, organization_id, patient_id, consent_type, template_id,
		       token_hash, created_by, expires_at, used_at
		FROM consent_sign_tokens WHERE token_hash = $1
	`, tokenHash).Scan(&t.ID, &t.OrganizationID, &t.PatientID, &t.ConsentType, &t.TemplateID,
		&t.TokenHash, &t.CreatedBy, &t.ExpiresAt, &t.UsedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, consents.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get sign token: %w", err)
	}
	return &t, nil
}

func (r *Repository) MarkTokenUsed(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE consent_sign_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("mark token used: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return consents.ErrNotFound
	}
	return nil
}

// ── Documents / revocation ────────────────────────────────────────────────────

func (r *Repository) GetDocument(ctx context.Context, orgID, consentID string) (*consents.ConsentDocument, error) {
	var d consents.ConsentDocument
	var validUntil, revokedAt *time.Time
	var scanFileType, templateID *string
	err := r.db.QueryRow(ctx, `
		SELECT c.id, c.organization_id, c.patient_id, c.staff_id,
		       c.consent_type, c.signing_method, c.signed_at, c.valid_until, c.revoked_at, c.created_at,
		       c.document_enc, c.signature_enc, c.scan_file_enc, c.scan_file_type, c.evidence_enc, c.template_id,
		       k.id, k.encrypted_dek, k.key_source
		FROM consents c
		JOIN encryption_keys k ON k.id = c.dek_id
		WHERE c.id = $1 AND c.organization_id = $2
	`, consentID, orgID).Scan(
		&d.ID, &d.OrganizationID, &d.PatientID, &d.StaffID,
		&d.ConsentType, &d.SigningMethod, &d.SignedAt, &validUntil, &revokedAt, &d.CreatedAt,
		&d.DocumentEnc, &d.SignatureEnc, &d.ScanFileEnc, &scanFileType, &d.EvidenceEnc, &templateID,
		&d.DEK.ID, &d.DEK.EncryptedDEK, &d.DEK.KeySource,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, consents.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get consent document: %w", err)
	}
	d.ValidUntil = validUntil
	d.RevokedAt = revokedAt
	if scanFileType != nil {
		d.ScanFileType = *scanFileType
	}
	if templateID != nil {
		d.TemplateID = *templateID
	}
	return &d, nil
}

func (r *Repository) Revoke(ctx context.Context, orgID, consentID, reason string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE consents SET revoked_at = NOW(), revocation_reason = $3
		WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL
	`, consentID, orgID, reason)
	if err != nil {
		return fmt.Errorf("revoke consent: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return consents.ErrNotFound
	}
	return nil
}

// ── Patient contact (for the sign-link email) ─────────────────────────────────

func (r *Repository) PatientContact(ctx context.Context, orgID, patientID string) (emailEnc, firstNameEnc []byte, dek consents.EncKeyRow, err error) {
	err = r.db.QueryRow(ctx, `
		SELECT p.email_enc, p.first_name_enc, k.id, k.encrypted_dek, k.key_source
		FROM patients p
		JOIN encryption_keys k ON k.id = p.dek_id
		WHERE p.id = $1 AND p.organization_id = $2
	`, patientID, orgID).Scan(&emailEnc, &firstNameEnc, &dek.ID, &dek.EncryptedDEK, &dek.KeySource)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, dek, consents.ErrNotFound
	}
	if err != nil {
		return nil, nil, dek, fmt.Errorf("patient contact: %w", err)
	}
	return emailEnc, firstNameEnc, dek, nil
}
