package repository

import (
	"context"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) Create(ctx context.Context, p appointments.CreateParams) (string, error) {
	const q = `
		INSERT INTO appointments (organization_id, patient_id, guest_name, staff_id, scheduled_at, duration_min, modality)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`

	var patientID *string
	if p.PatientID != "" {
		patientID = &p.PatientID
	}
	var guestName *string
	if p.GuestName != "" {
		guestName = &p.GuestName
	}

	var id string
	err := r.db.QueryRow(ctx, q,
		p.OrganizationID,
		patientID,
		guestName,
		p.StaffID,
		p.ScheduledAt,
		p.DurationMin,
		p.Modality,
	).Scan(&id)
	return id, err
}
