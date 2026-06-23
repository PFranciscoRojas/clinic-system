package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) Create(ctx context.Context, p appointments.CreateParams) (string, error) {
	// Abort if the slot already has a live booking hold (deferred payment in progress).
	// The CTE skips the INSERT when a PENDING_PAYMENT booking overlaps; RETURNING then
	// produces no rows, which we map to ErrConflict. The check is atomic with the INSERT.
	const q = `
		WITH hold_conflict AS (
			SELECT 1 FROM bookings
			WHERE staff_id = $4
			  AND status = 'PENDING_PAYMENT'
			  AND hold_expires_at > NOW()
			  AND scheduled_at < $5 + ($6 * interval '1 minute')
			  AND scheduled_at + (duration_min * interval '1 minute') > $5
			LIMIT 1
		)
		INSERT INTO appointments (organization_id, patient_id, guest_name, staff_id, scheduled_at, duration_min, modality)
		SELECT $1, $2, $3, $4, $5, $6, $7
		WHERE NOT EXISTS (SELECT 1 FROM hold_conflict)
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
	err := r.q(ctx).QueryRow(ctx, q,
		p.OrganizationID,
		patientID,
		guestName,
		p.StaffID,
		p.ScheduledAt,
		p.DurationMin,
		p.Modality,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", appointments.ErrConflict
	}
	return id, err
}
