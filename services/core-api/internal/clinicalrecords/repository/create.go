package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

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

func (r *Repository) Create(ctx context.Context, p clinicalrecords.CreateParams) (string, error) {
	var id string
	// The CTE atomically assigns the next session_number for this patient,
	// reserving the slot at DRAFT creation — not just at APPROVED time.
	err := r.q(ctx).QueryRow(ctx, `
		WITH next_num AS (
			SELECT COALESCE(MAX(session_number), 0) + 1 AS num
			FROM clinical_records
			WHERE patient_id = $2 AND organization_id = $1
		)
		INSERT INTO clinical_records (
			organization_id, patient_id, responsible_staff_id, created_by,
			appointment_id, dek_id, record_type, session_date,
			requires_cosign, supervisor_id, content_hash,
			template_version, template_id, sections_enc, risk_level, discharge_reason,
			session_number
		)
		SELECT
			$1, $2, $3, $4,
			$5, $6, $7, $8,
			$9, $10, $11,
			$12, $13, $14, $15, $16,
			next_num.num
		FROM next_num
		RETURNING id
	`,
		p.OrganizationID, p.PatientID, p.ResponsibleStaffID, p.CreatedBy,
		nullableString(p.AppointmentID), p.DEKID, p.RecordType, p.SessionDate,
		p.RequiresCosign, nullableString(p.SupervisorID), nullableString(p.ContentHash),
		templateVersionOrDefault(p.TemplateVersion), nullableString(p.TemplateID),
		nullableBytes(p.SectionsEnc), p.RiskLevel, p.DischargeReason,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert clinical_record: %w", err)
	}
	return id, nil
}

// templateVersionOrDefault keeps records at the current section format (v2).
func templateVersionOrDefault(v int16) int16 {
	if v == 0 {
		return 2
	}
	return v
}
