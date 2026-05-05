package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) FindByID(ctx context.Context, orgID, appointmentID string) (*appointments.Appointment, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, organization_id, patient_id, staff_id,
		       scheduled_at, duration_min, modality, status,
		       notes_enc, rescheduled_to, cancelled_by, cancel_reason,
		       created_at, updated_at
		FROM appointments
		WHERE id = $1 AND organization_id = $2
	`, appointmentID, orgID)

	return scanAppointment(row)
}

func (r *Repository) List(ctx context.Context, orgID string, f appointments.ListFilter) ([]*appointments.Appointment, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}

	q := `
		SELECT id, organization_id, patient_id, staff_id,
		       scheduled_at, duration_min, modality, status,
		       notes_enc, rescheduled_to, cancelled_by, cancel_reason,
		       created_at, updated_at
		FROM appointments
		WHERE organization_id = $1`
	args := []any{orgID}

	if f.PatientID != "" {
		args = append(args, f.PatientID)
		q += fmt.Sprintf(" AND patient_id = $%d", len(args))
	}
	if f.StaffID != "" {
		args = append(args, f.StaffID)
		q += fmt.Sprintf(" AND staff_id = $%d", len(args))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		q += fmt.Sprintf(" AND status = $%d", len(args))
	}
	if !f.DateFrom.IsZero() {
		args = append(args, f.DateFrom)
		q += fmt.Sprintf(" AND scheduled_at >= $%d", len(args))
	}
	if !f.DateTo.IsZero() {
		args = append(args, f.DateTo)
		q += fmt.Sprintf(" AND scheduled_at <= $%d", len(args))
	}

	args = append(args, f.Limit, f.Offset)
	q += fmt.Sprintf(" ORDER BY scheduled_at ASC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list appointments: %w", err)
	}
	defer rows.Close()

	var result []*appointments.Appointment
	for rows.Next() {
		a, err := scanAppointment(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

func scanAppointment(row interface {
	Scan(...any) error
}) (*appointments.Appointment, error) {
	var a appointments.Appointment
	var rescheduledTo, cancelledBy *string
	err := row.Scan(
		&a.ID, &a.OrganizationID, &a.PatientID, &a.StaffID,
		&a.ScheduledAt, &a.DurationMin, &a.Modality, &a.Status,
		&a.NotesEnc, &rescheduledTo, &cancelledBy, &a.CancelReason,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, appointments.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan appointment: %w", err)
	}
	if rescheduledTo != nil {
		a.RescheduledTo = *rescheduledTo
	}
	if cancelledBy != nil {
		a.CancelledBy = *cancelledBy
	}
	return &a, nil
}
