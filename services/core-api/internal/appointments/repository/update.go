package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/appointments"
)

// UpdateStatus transitions an appointment to the requested status.
// Allowed transitions: SCHEDULED→IN_PROGRESS, IN_PROGRESS→COMPLETED, any→NO_SHOW.
func (r *Repository) UpdateStatus(ctx context.Context, orgID, appointmentID, status string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE appointments
		SET status = $3::appointment_status,
		    started_at = CASE WHEN $3 = 'IN_PROGRESS' AND started_at IS NULL THEN NOW() ELSE started_at END,
		    updated_at = NOW()
		WHERE id = $1 AND organization_id = $2
		  AND status NOT IN ('CANCELLED', 'COMPLETED', 'NO_SHOW')
	`, appointmentID, orgID, status)
	if err != nil {
		return fmt.Errorf("update appointment status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return appointments.ErrAlreadyDone
	}
	return nil
}

// AssignPatient links a registered patient to a guest reservation.
// Only open appointments can be re-assigned; guest_name is cleared.
func (r *Repository) AssignPatient(ctx context.Context, orgID, appointmentID, patientID string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE appointments
		SET patient_id = $3, guest_name = NULL, updated_at = NOW()
		WHERE id = $1 AND organization_id = $2
		  AND status NOT IN ('CANCELLED', 'COMPLETED', 'NO_SHOW')
	`, appointmentID, orgID, patientID)
	if err != nil {
		return fmt.Errorf("assign patient to appointment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return appointments.ErrAlreadyDone
	}
	return nil
}

// Cancel only applies to appointments that never started: once the session
// is IN_PROGRESS the encounter happened and must end as COMPLETED or NO_SHOW.
func (r *Repository) Cancel(ctx context.Context, p appointments.CancelParams) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE appointments
		SET status = 'CANCELLED',
		    cancelled_by = $3,
		    cancel_reason = $4,
		    updated_at = NOW()
		WHERE id = $1 AND organization_id = $2
		  AND status = 'SCHEDULED'
	`, p.AppointmentID, p.OrganizationID, p.CancelledBy, p.CancelReason)
	if err != nil {
		return fmt.Errorf("cancel appointment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return appointments.ErrAlreadyDone
	}
	return nil
}
