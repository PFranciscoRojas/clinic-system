package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

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

func (r *Repository) Create(ctx context.Context, p clinicalrecords.CreateParams) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO clinical_records (
			organization_id, patient_id, responsible_staff_id, created_by,
			appointment_id, dek_id, record_type, session_date,
			subjective_enc, objective_enc, assessment_enc, plan_enc,
			requires_cosign, supervisor_id, content_hash
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15
		)
		RETURNING id
	`,
		p.OrganizationID, p.PatientID, p.ResponsibleStaffID, p.CreatedBy,
		nullableString(p.AppointmentID), p.DEKID, p.RecordType, p.SessionDate,
		nullableBytes(p.SubjectiveEnc), nullableBytes(p.ObjectiveEnc),
		nullableBytes(p.AssessmentEnc), nullableBytes(p.PlanEnc),
		p.RequiresCosign, nullableString(p.SupervisorID), nullableString(p.ContentHash),
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert clinical_record: %w", err)
	}
	return id, nil
}
