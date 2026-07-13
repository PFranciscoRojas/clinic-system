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

// PendingNotes returns the professional's COMPLETED sessions of the last 30
// days that still have no finalized clinical record — the ones at risk of
// being forgotten. draft_status carries the latest AI draft's state (empty
// when the session has no draft at all).
func (r *Repository) PendingNotes(ctx context.Context, orgID, staffID string) ([]appointments.PendingNote, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT a.id::text, a.patient_id::text, a.scheduled_at,
		       COALESCE(d.status::text, '') AS draft_status
		FROM appointments a
		LEFT JOIN LATERAL (
			SELECT status FROM ai_drafts
			WHERE appointment_id = a.id AND status IN ('PENDING','PROCESSING','DRAFT_READY')
			ORDER BY created_at DESC LIMIT 1
		) d ON TRUE
		WHERE a.organization_id = $1
		  AND a.staff_id = $2
		  AND a.status = 'COMPLETED'
		  AND a.patient_id IS NOT NULL
		  AND a.scheduled_at > NOW() - INTERVAL '30 days'
		  AND NOT EXISTS (
			SELECT 1 FROM clinical_records cr
			WHERE cr.appointment_id = a.id AND cr.finalized_at IS NOT NULL
		  )
		ORDER BY a.scheduled_at DESC
		LIMIT 20
	`, orgID, staffID)
	if err != nil {
		return nil, fmt.Errorf("query pending notes: %w", err)
	}
	defer rows.Close()

	var out []appointments.PendingNote
	for rows.Next() {
		var n appointments.PendingNote
		if err := rows.Scan(&n.AppointmentID, &n.PatientID, &n.ScheduledAt, &n.DraftStatus); err != nil {
			return nil, fmt.Errorf("scan pending note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
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

	var staffIdx, dateFromIdx, dateToIdx int
	if f.PatientID != "" {
		args = append(args, f.PatientID)
		q += fmt.Sprintf(" AND a.patient_id = $%d", len(args))
	}
	if f.StaffID != "" {
		args = append(args, f.StaffID)
		staffIdx = len(args)
		q += fmt.Sprintf(" AND a.staff_id = $%d", staffIdx)
	}
	if f.Status != "" {
		args = append(args, f.Status)
		q += fmt.Sprintf(" AND a.status = $%d", len(args))
	}
	if !f.DateFrom.IsZero() {
		args = append(args, f.DateFrom)
		dateFromIdx = len(args)
		q += fmt.Sprintf(" AND a.scheduled_at >= $%d", dateFromIdx)
	}
	if !f.DateTo.IsZero() {
		args = append(args, f.DateTo)
		dateToIdx = len(args)
		q += fmt.Sprintf(" AND a.scheduled_at <= $%d", dateToIdx)
	}

	// Surface unpaid Efecty/cash-voucher holds alongside real appointments in
	// the default (unfiltered) agenda view, so the clinic sees the slot as
	// occupied instead of looking free — a hold has no patient_id and no
	// status but PENDING_PAYMENT, so a patient/status filter would never
	// match it anyway; skip the branch entirely in that case.
	if f.PatientID == "" && f.Status == "" {
		q += `
		UNION ALL
		SELECT b.id::text, b.organization_id::text, NULL::text, b.guest_name, b.staff_id::text,
		       b.scheduled_at, b.duration_min, b.modality::text, 'PENDING_PAYMENT'::text,
		       NULL::bytea, NULL::text, NULL::text, NULL::text,
		       NULL::timestamptz, b.created_at, b.updated_at,
		       NULL::integer, NULL::text, NULL::text
		FROM bookings b
		WHERE b.organization_id = $1 AND b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > NOW()`
		if staffIdx > 0 {
			q += fmt.Sprintf(" AND b.staff_id = $%d", staffIdx)
		}
		if dateFromIdx > 0 {
			q += fmt.Sprintf(" AND b.scheduled_at >= $%d", dateFromIdx)
		}
		if dateToIdx > 0 {
			q += fmt.Sprintf(" AND b.scheduled_at <= $%d", dateToIdx)
		}
	}

	args = append(args, f.Limit, f.Offset)
	q = fmt.Sprintf("SELECT * FROM (%s) t ORDER BY scheduled_at ASC LIMIT $%d OFFSET $%d", q, len(args)-1, len(args))

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
