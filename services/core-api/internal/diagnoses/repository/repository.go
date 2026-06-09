package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/diagnoses"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// SearchCodes matches active catalog entries by code prefix or description substring.
func (r *Repository) SearchCodes(ctx context.Context, query string, limit int) ([]*diagnoses.ICD10Code, error) {
	rows, err := r.db.Query(ctx, `
		SELECT code, description, COALESCE(chapter, '')
		FROM icd10_codes
		WHERE is_active AND (code ILIKE $1 || '%' OR description ILIKE '%' || $1 || '%')
		ORDER BY code
		LIMIT $2
	`, query, limit)
	if err != nil {
		return nil, fmt.Errorf("search icd10: %w", err)
	}
	defer rows.Close()

	var out []*diagnoses.ICD10Code
	for rows.Next() {
		var c diagnoses.ICD10Code
		if err := rows.Scan(&c.Code, &c.Description, &c.Chapter); err != nil {
			return nil, fmt.Errorf("scan icd10: %w", err)
		}
		out = append(out, &c)
	}
	return out, rows.Err()
}

func (r *Repository) Create(ctx context.Context, p diagnoses.CreateParams) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO patient_diagnoses
			(organization_id, patient_id, staff_id, clinical_record_id,
			 icd10_code, diagnosis_type, diagnosed_at)
		VALUES ($1, $2, $3, NULLIF($4, '')::uuid, $5, $6, $7)
		RETURNING id
	`, p.OrganizationID, p.PatientID, p.StaffID, p.ClinicalRecordID,
		p.ICD10Code, p.DiagnosisType, p.DiagnosedAt).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" && pgErr.ConstraintName == "patient_diagnoses_icd10_code_fkey" {
			return "", diagnoses.ErrUnknownCode
		}
		return "", fmt.Errorf("insert diagnosis: %w", err)
	}
	return id, nil
}

func (r *Repository) ListByPatient(ctx context.Context, orgID, patientID string) ([]*diagnoses.Diagnosis, error) {
	rows, err := r.db.Query(ctx, `
		SELECT d.id, d.patient_id, d.staff_id, d.clinical_record_id,
		       d.icd10_code, c.description, d.diagnosis_type, d.status,
		       d.diagnosed_at, d.resolved_at, d.created_at
		FROM patient_diagnoses d
		JOIN icd10_codes c ON c.code = d.icd10_code
		WHERE d.organization_id = $1 AND d.patient_id = $2
		ORDER BY d.status = 'ACTIVE' DESC, d.diagnosed_at DESC
	`, orgID, patientID)
	if err != nil {
		return nil, fmt.Errorf("list diagnoses: %w", err)
	}
	defer rows.Close()

	var out []*diagnoses.Diagnosis
	for rows.Next() {
		var d diagnoses.Diagnosis
		if err := rows.Scan(
			&d.ID, &d.PatientID, &d.StaffID, &d.ClinicalRecordID,
			&d.ICD10Code, &d.Description, &d.DiagnosisType, &d.Status,
			&d.DiagnosedAt, &d.ResolvedAt, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan diagnosis: %w", err)
		}
		out = append(out, &d)
	}
	return out, rows.Err()
}

// UpdateStatus moves a diagnosis through its lifecycle; resolved_at is set
// when leaving ACTIVE and cleared when returning to it.
func (r *Repository) UpdateStatus(ctx context.Context, orgID, diagnosisID string, status diagnoses.Status) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE patient_diagnoses
		SET status = $3,
		    resolved_at = CASE WHEN $3 = 'ACTIVE' THEN NULL ELSE COALESCE(resolved_at, CURRENT_DATE) END,
		    updated_at = NOW()
		WHERE id = $1 AND organization_id = $2
	`, diagnosisID, orgID, status)
	if err != nil {
		return fmt.Errorf("update diagnosis: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return diagnoses.ErrNotFound
	}
	return nil
}
