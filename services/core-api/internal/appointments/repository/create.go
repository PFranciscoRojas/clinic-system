package repository

import (
	"context"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) Create(ctx context.Context, p appointments.CreateParams) (string, error) {
	const q = `
		INSERT INTO appointments (organization_id, patient_id, staff_id, scheduled_at, duration_min, modality)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`

	var id string
	err := r.db.QueryRow(ctx, q,
		p.OrganizationID,
		p.PatientID,
		p.StaffID,
		p.ScheduledAt,
		p.DurationMin,
		p.Modality,
	).Scan(&id)
	return id, err
}
