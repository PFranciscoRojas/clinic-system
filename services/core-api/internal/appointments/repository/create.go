package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) Create(ctx context.Context, p appointments.CreateParams) (string, error) {
	// Abort if the slot already has a live booking hold (deferred payment in progress).
	// The CTE skips the INSERT when a PENDING_PAYMENT booking overlaps; RETURNING then
	// produces no rows, which we map to ErrConflict. The check is atomic with the INSERT.
	// _psr auto-registers the professional as PRIMARY_THERAPIST so patient_staff_rel
	// enforcement stays in sync without a separate call (Res. 1995/1999 Art. 14).
	const q = `
		WITH hold_conflict AS (
			SELECT 1 FROM bookings
			WHERE staff_id = $4
			  AND status = 'PENDING_PAYMENT'
			  AND hold_expires_at > NOW()
			  AND scheduled_at < $5::timestamptz + ($6::integer * interval '1 minute')
			  AND scheduled_at + (duration_min * interval '1 minute') > $5::timestamptz
			LIMIT 1
		),
		staff_ok AS (
			SELECT 1 FROM users
			WHERE id = $4 AND organization_id = $1 AND is_active
		),
		ins AS (
			INSERT INTO appointments (organization_id, patient_id, guest_name, staff_id, scheduled_at, duration_min, modality)
			SELECT $1, $2, $3, $4, $5::timestamptz, $6::integer, $7::appointment_modality
			WHERE NOT EXISTS (SELECT 1 FROM hold_conflict)
			  AND EXISTS (SELECT 1 FROM staff_ok)
			RETURNING id
		),
		_psr AS (
			INSERT INTO patient_staff_rel (organization_id, patient_id, staff_id, relation_type)
			SELECT $1, $2, $4, 'PRIMARY_THERAPIST'::staff_relation_type
			FROM ins
			WHERE $2 IS NOT NULL
			ON CONFLICT DO NOTHING
		)
		SELECT id FROM ins`

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
		// No row can mean a hold conflict or a staff_id outside the org —
		// distinguish so a forged staff_id doesn't read as "slot taken".
		var staffOK bool
		if e := r.q(ctx).QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND is_active)`,
			p.StaffID, p.OrganizationID,
		).Scan(&staffOK); e == nil && !staffOK {
			return "", fmt.Errorf("%w: staff_id is not an active member of the organization", appointments.ErrInvalidInput)
		}
		return "", appointments.ErrConflict
	}
	return id, err
}
