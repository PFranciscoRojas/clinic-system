package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/patients"
)

func (r *Repository) Update(ctx context.Context, p patients.UpdateParams) error {
	_, err := r.db.Exec(ctx, `
		UPDATE patients SET
			first_name_enc         = $3,
			middle_name_enc        = $4,
			paternal_last_name_enc = $5,
			maternal_last_name_enc = $6,
			paternal_last_name_hash = $7,
			full_name_search_hash  = $8,
			phone_enc              = $9,
			email_enc              = $10,
			address_enc            = $11,
			gender                 = $12,
			updated_at             = NOW()
		WHERE id = $1 AND organization_id = $2
	`,
		p.PatientID, p.OrganizationID,
		p.FirstNameEnc, nullableBytes(p.MiddleNameEnc),
		p.PaternalLastNameEnc, nullableBytes(p.MaternalLastNameEnc),
		p.PaternalLastNameHash, p.FullNameSearchHash,
		nullableBytes(p.PhoneEnc), nullableBytes(p.EmailEnc), nullableBytes(p.AddressEnc),
		nullableString(p.Gender),
	)
	if err != nil {
		return fmt.Errorf("update patient: %w", err)
	}
	return nil
}

func (r *Repository) Deactivate(ctx context.Context, orgID, patientID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE patients SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
		patientID, orgID,
	)
	if err != nil {
		return fmt.Errorf("deactivate patient: %w", err)
	}
	return nil
}
