package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/appointments"
)

func (r *Repository) FindByID(ctx context.Context, orgID, appointmentID string) (*appointments.Appointment, error) {
	row := r.q(ctx).QueryRow(ctx, `
		SELECT a.id::text, a.organization_id::text, a.patient_id::text, a.guest_name, a.staff_id::text,
		       a.scheduled_at, a.duration_min, a.modality::text, a.status::text,
		       a.notes_enc, a.rescheduled_to::text, a.cancelled_by::text, a.cancel_reason,
		       a.started_at, a.created_at, a.updated_at,
		       bk.amount, bk.currency, bk.mp_payment_id
		FROM appointments a
		LEFT JOIN bookings bk ON bk.appointment_id = a.id AND bk.status = 'PAID'
		WHERE a.id = $1 AND a.organization_id = $2
	`, appointmentID, orgID)

	return scanAppointment(row)
}

func (r *Repository) List(ctx context.Context, orgID string, f appointments.ListFilter) ([]*appointments.Appointment, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}

	q := `
		SELECT a.id::text, a.organization_id::text, a.patient_id::text, a.guest_name, a.staff_id::text,
		       a.scheduled_at, a.duration_min, a.modality::text, a.status::text,
		       a.notes_enc, a.rescheduled_to::text, a.cancelled_by::text, a.cancel_reason,
		       a.started_at, a.created_at, a.updated_at,
		       bk.amount, bk.currency, bk.mp_payment_id
		FROM appointments a
		LEFT JOIN bookings bk ON bk.appointment_id = a.id AND bk.status = 'PAID'
		WHERE a.organization_id = $1`
	args := []any{orgID}

	if f.PatientID != "" {
		args = append(args, f.PatientID)
		q += fmt.Sprintf(" AND a.patient_id = $%d", len(args))
	}
	if f.StaffID != "" {
		args = append(args, f.StaffID)
		q += fmt.Sprintf(" AND a.staff_id = $%d", len(args))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		q += fmt.Sprintf(" AND a.status = $%d", len(args))
	}
	if !f.DateFrom.IsZero() {
		args = append(args, f.DateFrom)
		q += fmt.Sprintf(" AND a.scheduled_at >= $%d", len(args))
	}
	if !f.DateTo.IsZero() {
		args = append(args, f.DateTo)
		q += fmt.Sprintf(" AND a.scheduled_at <= $%d", len(args))
	}

	args = append(args, f.Limit, f.Offset)
	q += fmt.Sprintf(" ORDER BY a.scheduled_at ASC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.q(ctx).Query(ctx, q, args...)
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
	var patientID, guestName, rescheduledTo, cancelledBy, cancelReason *string
	var paidAmount *int
	var paidCurrency, paymentRef *string
	err := row.Scan(
		&a.ID, &a.OrganizationID, &patientID, &guestName, &a.StaffID,
		&a.ScheduledAt, &a.DurationMin, &a.Modality, &a.Status,
		&a.NotesEnc, &rescheduledTo, &cancelledBy, &cancelReason,
		&a.StartedAt, &a.CreatedAt, &a.UpdatedAt,
		&paidAmount, &paidCurrency, &paymentRef,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, appointments.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan appointment: %w", err)
	}
	if paidAmount != nil {
		a.Paid = true
		a.PaidAmount = *paidAmount
	}
	if paidCurrency != nil {
		a.PaidCurrency = *paidCurrency
	}
	if paymentRef != nil {
		a.PaymentRef = *paymentRef
	}
	if patientID != nil {
		a.PatientID = *patientID
	}
	if guestName != nil {
		a.GuestName = *guestName
	}
	if rescheduledTo != nil {
		a.RescheduledTo = *rescheduledTo
	}
	if cancelledBy != nil {
		a.CancelledBy = *cancelledBy
	}
	if cancelReason != nil {
		a.CancelReason = *cancelReason
	}
	return &a, nil
}
