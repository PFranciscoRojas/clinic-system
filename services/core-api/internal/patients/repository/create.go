package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/patients"
)

// CreateEncKey inserts a new DEK row and returns its generated UUID.
// Called by the service before Create so both share the same transaction
// when the caller wraps them — here kept separate for simplicity since
// pgx pool auto-commits each Exec.
func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM')
		RETURNING id
	`, encryptedDEK, keySource).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert encryption_key: %w", err)
	}
	return id, nil
}

// Create inserts the patient row with pre-encrypted PII fields.
// The caller must have already persisted the DEK and obtained dekID.
func (r *Repository) Create(ctx context.Context, p patients.CreateParams) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO patients (
			organization_id, document_type_code, dek_id,
			first_name_enc, middle_name_enc,
			paternal_last_name_enc, maternal_last_name_enc,
			paternal_last_name_hash, full_name_search_hash,
			document_number_enc, doc_search_hash,
			phone_enc, email_enc, address_enc,
			birth_date, gender
		) VALUES (
			$1, $2, $3,
			$4, $5,
			$6, $7,
			$8, $9,
			$10, $11,
			$12, $13, $14,
			$15, $16
		)
		RETURNING id
	`,
		p.OrganizationID, p.DocumentTypeCode, p.DEKID,
		p.FirstNameEnc, nullableBytes(p.MiddleNameEnc),
		p.PaternalLastNameEnc, nullableBytes(p.MaternalLastNameEnc),
		p.PaternalLastNameHash, p.FullNameSearchHash,
		p.DocumentNumberEnc, p.DocSearchHash,
		nullableBytes(p.PhoneEnc), nullableBytes(p.EmailEnc), nullableBytes(p.AddressEnc),
		p.BirthDate, nullableString(p.Gender),
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert patient: %w", err)
	}
	return id, nil
}
