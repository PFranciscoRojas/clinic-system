package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) Cancel(ctx context.Context, p appointments.CancelParams) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE appointments
		SET status = 'CANCELLED',
		    cancelled_by = $3,
		    cancel_reason = $4,
		    updated_at = NOW()
		WHERE id = $1 AND organization_id = $2
		  AND status NOT IN ('CANCELLED', 'COMPLETED', 'NO_SHOW')
	`, p.AppointmentID, p.OrganizationID, p.CancelledBy, p.CancelReason)
	if err != nil {
		return fmt.Errorf("cancel appointment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return appointments.ErrAlreadyDone
	}
	return nil
}
