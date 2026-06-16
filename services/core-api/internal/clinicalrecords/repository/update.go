package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

func (r *Repository) Update(ctx context.Context, p clinicalrecords.UpdateParams) error {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE clinical_records
		SET subjective_enc   = $3,
		    objective_enc    = $4,
		    assessment_enc   = $5,
		    plan_enc         = $6,
		    sections_enc     = $7,
		    risk_level       = COALESCE($8, risk_level),
		    discharge_reason = COALESCE($9, discharge_reason),
		    content_hash     = $10,
		    updated_at       = NOW()
		WHERE id = $1 AND organization_id = $2 AND status = 'DRAFT'
	`,
		p.ID, p.OrganizationID,
		nullableBytes(p.SubjectiveEnc), nullableBytes(p.ObjectiveEnc),
		nullableBytes(p.AssessmentEnc), nullableBytes(p.PlanEnc),
		nullableBytes(p.SectionsEnc),
		p.RiskLevel, p.DischargeReason,
		nullableString(p.ContentHash),
	)
	if err != nil {
		return fmt.Errorf("update clinical_record: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return clinicalrecords.ErrNotFound
	}
	return nil
}

func (r *Repository) Approve(ctx context.Context, orgID, recordID, approvedBy string) error {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE clinical_records
		SET status      = 'APPROVED',
		    approved_at = NOW(),
		    updated_at  = NOW()
		WHERE id = $1 AND organization_id = $2
		  AND status = 'DRAFT'
		  AND (requires_cosign = FALSE OR supervisor_cosigned_at IS NOT NULL)
	`, recordID, orgID)
	if err != nil {
		return fmt.Errorf("approve clinical_record: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return clinicalrecords.ErrNotFound
	}
	return nil
}

func (r *Repository) Cosign(ctx context.Context, orgID, recordID, supervisorID string) error {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE clinical_records
		SET supervisor_cosigned_at = NOW(),
		    updated_at             = NOW()
		WHERE id = $1 AND organization_id = $2
		  AND supervisor_id = $3
		  AND requires_cosign = TRUE
		  AND status = 'DRAFT'
	`, recordID, orgID, supervisorID)
	if err != nil {
		return fmt.Errorf("cosign clinical_record: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return clinicalrecords.ErrNotFound
	}
	return nil
}

// nullableString converts an empty string to nil for SQL NULL.
func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// nullableBytes converts a nil/empty slice to nil for SQL NULL.
func nullableBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}
