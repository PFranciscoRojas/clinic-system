package repository

import (
	"context"
	"fmt"
	"time"

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
			scan_path_enc, scan_file_type, signed_at
		) VALUES ($1, $2, $3, $4, $5, 'PHYSICAL_SCAN', $6, $7, $8, $9, $10)
		RETURNING id
	`,
		p.OrganizationID, p.PatientID, p.StaffID, p.DEKID,
		p.ConsentType,
		p.DocumentEnc, p.DocumentTemplateHash,
		p.ScanPathEnc, p.ScanFileType, p.SignedAt,
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
