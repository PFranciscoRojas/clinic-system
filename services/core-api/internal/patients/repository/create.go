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
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM')
		RETURNING id
	`, encryptedDEK, keySource).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert encryption_key: %w", err)
	}
	return id, nil
}

// Create inserts the patient row with pre-encrypted PII fields, assigning the
// next consecutive HC number (patient_code) for the organization. The caller
// must have already persisted the DEK and obtained dekID.
func (r *Repository) Create(ctx context.Context, p patients.CreateParams) (string, error) {
	tx, err := r.q(ctx).Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Serialize HC numbering per organization so concurrent registrations
	// can't claim the same patient_code.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, p.OrganizationID); err != nil {
		return "", fmt.Errorf("lock numbering: %w", err)
	}
	var code int
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(patient_code), 0) + 1 FROM patients WHERE organization_id = $1`, p.OrganizationID,
	).Scan(&code); err != nil {
		return "", fmt.Errorf("next patient code: %w", err)
	}

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO patients (
			organization_id, document_type_code, dek_id,
			first_name_enc, middle_name_enc,
			paternal_last_name_enc, maternal_last_name_enc,
			paternal_last_name_hash, full_name_search_hash,
			document_number_enc, doc_search_hash,
			phone_enc, email_enc, address_enc,
			birth_date, gender, emergency_contact_enc, demographics_enc,
			patient_code
		) VALUES (
			$1, $2, $3,
			$4, $5,
			$6, $7,
			$8, $9,
			$10, $11,
			$12, $13, $14,
			$15, $16, $17, $18,
			$19
		)
		RETURNING id
	`,
		p.OrganizationID, nullableString(p.DocumentTypeCode), p.DEKID,
		p.FirstNameEnc, nullableBytes(p.MiddleNameEnc),
		p.PaternalLastNameEnc, nullableBytes(p.MaternalLastNameEnc),
		p.PaternalLastNameHash, p.FullNameSearchHash,
		nullableBytes(p.DocumentNumberEnc), nullableString(p.DocSearchHash),
		nullableBytes(p.PhoneEnc), nullableBytes(p.EmailEnc), nullableBytes(p.AddressEnc),
		nullableDate(p.BirthDate), nullableString(p.Gender), nullableBytes(p.EmergencyContactEnc),
		nullableBytes(p.DemographicsEnc),
		code,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert patient: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit patient: %w", err)
	}
	return id, nil
}
