package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/patients"
)

func (r *Repository) FindByID(ctx context.Context, orgID, patientID string) (*patients.RawPatient, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, organization_id, document_type_code, dek_id,
		       first_name_enc, middle_name_enc,
		       paternal_last_name_enc, maternal_last_name_enc,
		       document_number_enc, phone_enc, email_enc, address_enc,
		       birth_date, gender, is_active, created_at, updated_at
		FROM patients
		WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
	`, patientID, orgID)

	return scanPatient(row)
}

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*patients.EncKeyRow, error) {
	var k patients.EncKeyRow
	err := r.db.QueryRow(ctx,
		`SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1`,
		dekID,
	).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find enc_key: %w", err)
	}
	return &k, nil
}

// Search returns patients matching the given hash filter within the organization.
// Supports search by paternal last name hash OR document hash (not both simultaneously).
func (r *Repository) Search(ctx context.Context, orgID string, f patients.SearchFilter) ([]*patients.RawPatient, error) {
	query := `
		SELECT id, organization_id, document_type_code, dek_id,
		       first_name_enc, middle_name_enc,
		       paternal_last_name_enc, maternal_last_name_enc,
		       document_number_enc, phone_enc, email_enc, address_enc,
		       birth_date, gender, is_active, created_at, updated_at
		FROM patients
		WHERE organization_id = $1 AND is_active = TRUE
	`
	args := []any{orgID}

	if f.PaternalLastNameHash != "" {
		args = append(args, f.PaternalLastNameHash)
		query += fmt.Sprintf(" AND paternal_last_name_hash = $%d", len(args))
	}
	if f.DocSearchHash != "" {
		args = append(args, f.DocSearchHash)
		query += fmt.Sprintf(" AND doc_search_hash = $%d", len(args))
	}

	args = append(args, f.Limit, f.Offset)
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("search patients: %w", err)
	}
	defer rows.Close()

	var result []*patients.RawPatient
	for rows.Next() {
		p, err := scanPatient(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// scanPatient reads one patient row from either a QueryRow or a Rows iterator.
func scanPatient(row interface {
	Scan(...any) error
}) (*patients.RawPatient, error) {
	var p patients.RawPatient
	err := row.Scan(
		&p.ID, &p.OrganizationID, &p.DocumentTypeCode, &p.DEKID,
		&p.FirstNameEnc, &p.MiddleNameEnc,
		&p.PaternalLastNameEnc, &p.MaternalLastNameEnc,
		&p.DocumentNumberEnc, &p.PhoneEnc, &p.EmailEnc, &p.AddressEnc,
		&p.BirthDate, &p.Gender, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, patients.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan patient: %w", err)
	}
	return &p, nil
}
