package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/clinicalrecords"
)

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*clinicalrecords.EncKeyRow, error) {
	var k clinicalrecords.EncKeyRow
	err := r.q(ctx).QueryRow(ctx,
		`SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1`,
		dekID,
	).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find enc_key: %w", err)
	}
	return &k, nil
}

func (r *Repository) FindByID(ctx context.Context, orgID, recordID string) (*clinicalrecords.RawRecord, error) {
	row := r.q(ctx).QueryRow(ctx, `
		SELECT id, organization_id, patient_id, responsible_staff_id, created_by,
		       COALESCE(appointment_id::text, ''), dek_id,
		       record_type, session_date,
		       template_version, sections_enc, risk_level::text, discharge_reason::text,
		       status, approved_at, requires_cosign,
		       COALESCE(supervisor_id::text, ''), supervisor_cosigned_at,
		       created_at, updated_at
		FROM clinical_records
		WHERE id = $1 AND organization_id = $2
	`, recordID, orgID)

	var rec clinicalrecords.RawRecord
	err := row.Scan(
		&rec.ID, &rec.OrganizationID, &rec.PatientID,
		&rec.ResponsibleStaffID, &rec.CreatedBy,
		&rec.AppointmentID, &rec.DEKID,
		&rec.RecordType, &rec.SessionDate,
		&rec.TemplateVersion, &rec.SectionsEnc, &rec.RiskLevel, &rec.DischargeReason,
		&rec.Status, &rec.ApprovedAt, &rec.RequiresCosign,
		&rec.SupervisorID, &rec.SupervisorCosignedAt,
		&rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, clinicalrecords.ErrNotFound
		}
		return nil, fmt.Errorf("find clinical_record: %w", err)
	}
	return &rec, nil
}

func scanRecordMeta(rows interface {
	Scan(...any) error
}, m *clinicalrecords.RecordMeta) error {
	return rows.Scan(
		&m.ID, &m.PatientID, &m.PatientCode, &m.ResponsibleStaffID, &m.CreatedBy,
		&m.AppointmentID, &m.RecordType,
		&m.SessionDate, &m.TemplateVersion, &m.RiskLevel,
		&m.Status, &m.RequiresCosign,
		&m.SupervisorID, &m.CreatedAt,
	)
}

const metaCols = `
	cr.id, cr.patient_id, p.patient_code, cr.responsible_staff_id, cr.created_by,
	COALESCE(cr.appointment_id::text, ''), cr.record_type,
	cr.session_date, cr.template_version, cr.risk_level::text,
	cr.status, cr.requires_cosign,
	COALESCE(cr.supervisor_id::text, ''), cr.created_at`

func (r *Repository) List(ctx context.Context, f clinicalrecords.ListFilter) ([]*clinicalrecords.RecordMeta, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT`+metaCols+`
		FROM clinical_records cr
		LEFT JOIN patients p ON p.id = cr.patient_id
		WHERE cr.organization_id = $1 AND cr.patient_id = $2
		ORDER BY cr.session_date DESC, cr.created_at DESC
		LIMIT $3 OFFSET $4
	`, f.OrganizationID, f.PatientID, f.Limit, f.Offset)
	if err != nil {
		return nil, fmt.Errorf("list clinical_records: %w", err)
	}
	defer rows.Close()

	var result []*clinicalrecords.RecordMeta
	for rows.Next() {
		var m clinicalrecords.RecordMeta
		if err := scanRecordMeta(rows, &m); err != nil {
			return nil, fmt.Errorf("scan record_meta: %w", err)
		}
		result = append(result, &m)
	}
	return result, rows.Err()
}

func (r *Repository) ListByOrg(ctx context.Context, f clinicalrecords.OrgListFilter) ([]*clinicalrecords.RecordMeta, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT`+metaCols+`
		FROM clinical_records cr
		LEFT JOIN patients p ON p.id = cr.patient_id
		WHERE cr.organization_id = $1
		  AND ($2 = '' OR cr.status::text = $2)
		ORDER BY cr.session_date DESC, cr.created_at DESC
		LIMIT $3 OFFSET $4
	`, f.OrganizationID, f.Status, f.Limit, f.Offset)
	if err != nil {
		return nil, fmt.Errorf("list clinical_records by org: %w", err)
	}
	defer rows.Close()

	var result []*clinicalrecords.RecordMeta
	for rows.Next() {
		var m clinicalrecords.RecordMeta
		if err := scanRecordMeta(rows, &m); err != nil {
			return nil, fmt.Errorf("scan record_meta (org): %w", err)
		}
		result = append(result, &m)
	}
	return result, rows.Err()
}

// GetProcessDates returns the latest INITIAL and DISCHARGE session dates for
// a patient, the basis of the open-process rules for template v2 records.
func (r *Repository) GetProcessDates(ctx context.Context, orgID, patientID string) (clinicalrecords.ProcessDates, error) {
	var d clinicalrecords.ProcessDates
	err := r.q(ctx).QueryRow(ctx, `
		SELECT
			MAX(session_date) FILTER (WHERE record_type = 'INITIAL'),
			MAX(session_date) FILTER (WHERE record_type = 'DISCHARGE')
		FROM clinical_records
		WHERE organization_id = $1 AND patient_id = $2
	`, orgID, patientID).Scan(&d.LastInitial, &d.LastDischarge)
	if err != nil {
		return d, fmt.Errorf("get process dates: %w", err)
	}
	return d, nil
}
