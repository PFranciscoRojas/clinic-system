// Package invoicing owns BC-6: the clinic's internal billing — the service-rate
// catalogue, patient invoices and recorded payments. It is INTERNAL billing
// (recibos/comprobantes), distinct from internal/billing, which is the SaaS
// subscription the clinic pays to the operator. No DIAN electronic invoicing.
//
// This first slice covers the service-rate catalogue (service_rates).
package invoicing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/dbctx"
)

var (
	ErrNotFound     = errors.New("rate not found")
	ErrInvalidInput = errors.New("invalid input")
)

// Rate is the API-facing view of a row in service_rates. Amount travels as a
// decimal string (never a float) to keep money exact end-to-end.
type Rate struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Amount      string    `json:"amount"`
	Currency    string    `json:"currency"`
	Modality    *string   `json:"modality,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

// RateInput carries the writable fields of a rate.
type RateInput struct {
	Name        string
	Description string
	Amount      string
	Currency    string
	Modality    *string
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }

const rateColumns = `id, name, COALESCE(description, ''), amount::text, currency, modality, is_active, created_at`

func scanRate(row pgx.Row) (Rate, error) {
	var rt Rate
	err := row.Scan(&rt.ID, &rt.Name, &rt.Description, &rt.Amount, &rt.Currency, &rt.Modality, &rt.IsActive, &rt.CreatedAt)
	return rt, err
}

// List returns the org's rates, newest first. Inactive rates are included only
// when includeInactive is set (the catalogue keeps history for past invoices).
func (r *Repository) List(ctx context.Context, orgID string, includeInactive bool) ([]Rate, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+rateColumns+`
		FROM service_rates
		WHERE organization_id = $1 AND ($2 OR is_active)
		ORDER BY is_active DESC, created_at DESC
	`, orgID, includeInactive)
	if err != nil {
		return nil, fmt.Errorf("list rates: %w", err)
	}
	defer rows.Close()

	out := make([]Rate, 0)
	for rows.Next() {
		rt, err := scanRate(rows)
		if err != nil {
			return nil, fmt.Errorf("scan rate: %w", err)
		}
		out = append(out, rt)
	}
	return out, rows.Err()
}

func (r *Repository) Create(ctx context.Context, orgID string, in RateInput) (Rate, error) {
	row := r.q(ctx).QueryRow(ctx, `
		INSERT INTO service_rates (organization_id, name, description, amount, currency, modality)
		VALUES ($1, $2, NULLIF($3, ''), $4::numeric, $5, $6)
		RETURNING `+rateColumns+`
	`, orgID, in.Name, in.Description, in.Amount, in.Currency, in.Modality)
	rt, err := scanRate(row)
	if err != nil {
		return Rate{}, fmt.Errorf("insert rate: %w", err)
	}
	return rt, nil
}

func (r *Repository) Update(ctx context.Context, orgID, id string, in RateInput) (Rate, error) {
	row := r.q(ctx).QueryRow(ctx, `
		UPDATE service_rates
		SET name = $3, description = NULLIF($4, ''), amount = $5::numeric,
		    currency = $6, modality = $7, updated_at = NOW()
		WHERE organization_id = $1 AND id = $2
		RETURNING `+rateColumns+`
	`, orgID, id, in.Name, in.Description, in.Amount, in.Currency, in.Modality)
	rt, err := scanRate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Rate{}, ErrNotFound
	}
	if err != nil {
		return Rate{}, fmt.Errorf("update rate: %w", err)
	}
	return rt, nil
}

// SetActive toggles a rate's availability without deleting it (past invoices
// keep their rate_id reference).
func (r *Repository) SetActive(ctx context.Context, orgID, id string, active bool) (Rate, error) {
	row := r.q(ctx).QueryRow(ctx, `
		UPDATE service_rates
		SET is_active = $3, updated_at = NOW()
		WHERE organization_id = $1 AND id = $2
		RETURNING `+rateColumns+`
	`, orgID, id, active)
	rt, err := scanRate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Rate{}, ErrNotFound
	}
	if err != nil {
		return Rate{}, fmt.Errorf("toggle rate: %w", err)
	}
	return rt, nil
}

// ListBookingPayments returns bookings for the org: PAID ones in the period
// window (or all if from/to are nil), plus active PENDING_PAYMENT holds.
func (r *Repository) ListBookingPayments(ctx context.Context, orgID, status string, from, to *time.Time) ([]BookingPayment, error) {
	q := `
		SELECT id,
		       ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at) AS booking_number,
		       scheduled_at, COALESCE(guest_name,''), COALESCE(email,''), COALESCE(phone,''), COALESCE(modality::text,''),
		       amount, status,
		       COALESCE(mp_payment_type,''), COALESCE(mp_payment_method,''),
		       COALESCE(mp_payment_id::text,''),
		       COALESCE(payment_voucher_url,''), hold_expires_at,
		       CASE WHEN status = 'PAID' THEN updated_at ELSE NULL END,
		       appointment_id, invoice_id,
		       (SELECT i.invoice_number FROM invoices i WHERE i.id = bookings.invoice_id)
		FROM bookings
		WHERE organization_id = $1
		  AND (
		    ($2::text = '' AND (
		      (status = 'PAID' AND ($3::timestamptz IS NULL OR updated_at >= $3) AND ($4::timestamptz IS NULL OR updated_at < $4))
		      OR (status = 'PENDING_PAYMENT' AND hold_expires_at > NOW())
		    ))
		    OR ($2::text = 'PAID'             AND status = 'PAID' AND ($3::timestamptz IS NULL OR updated_at >= $3) AND ($4::timestamptz IS NULL OR updated_at < $4))
		    OR ($2::text = 'PENDING_PAYMENT'  AND status = 'PENDING_PAYMENT' AND hold_expires_at > NOW())
		  )
		ORDER BY scheduled_at DESC`

	var fromP, toP *time.Time
	if from != nil {
		fromP = from
	}
	if to != nil {
		toP = to
	}
	rows, err := r.q(ctx).Query(ctx, q, orgID, status, fromP, toP)
	if err != nil {
		return nil, fmt.Errorf("list booking payments: %w", err)
	}
	defer rows.Close()
	var out []BookingPayment
	for rows.Next() {
		var bp BookingPayment
		if err := rows.Scan(
			&bp.ID, &bp.BookingNumber,
			&bp.ScheduledAt, &bp.GuestName, &bp.Email, &bp.Phone, &bp.Modality,
			&bp.Amount, &bp.Status,
			&bp.PaymentType, &bp.PaymentMethod, &bp.MpPaymentID,
			&bp.VoucherURL, &bp.HoldExpiresAt, &bp.PaidAt,
			&bp.AppointmentID, &bp.InvoiceID, &bp.InvoiceNumber,
		); err != nil {
			return nil, fmt.Errorf("scan booking payment: %w", err)
		}
		out = append(out, bp)
	}
	return out, rows.Err()
}

// bookingForInvoice carries the booking fields needed to derive an invoice
// from a paid public booking.
type bookingForInvoice struct {
	ID            string
	BookingNumber int64
	Amount        int
	Currency      string
	Status        string
	PaymentType   string
	PaymentMethod string
	MpPaymentID   string
	AppointmentID *string
	InvoiceID     *string
	PaidAt        *time.Time
}

func (r *Repository) GetBookingForInvoice(ctx context.Context, orgID, id string) (bookingForInvoice, error) {
	var b bookingForInvoice
	err := r.q(ctx).QueryRow(ctx, `
		SELECT b.id,
		       (SELECT COUNT(*) FROM bookings b2
		        WHERE b2.organization_id = b.organization_id AND b2.created_at <= b.created_at),
		       b.amount, b.currency, b.status,
		       COALESCE(b.mp_payment_type,''), COALESCE(b.mp_payment_method,''),
		       COALESCE(b.mp_payment_id::text,''),
		       b.appointment_id, b.invoice_id,
		       CASE WHEN b.status = 'PAID' THEN b.updated_at ELSE NULL END
		FROM bookings b
		WHERE b.organization_id = $1 AND b.id = $2
	`, orgID, id).Scan(
		&b.ID, &b.BookingNumber, &b.Amount, &b.Currency, &b.Status,
		&b.PaymentType, &b.PaymentMethod, &b.MpPaymentID,
		&b.AppointmentID, &b.InvoiceID, &b.PaidAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return bookingForInvoice{}, ErrNotFound
	}
	if err != nil {
		return bookingForInvoice{}, fmt.Errorf("get booking for invoice: %w", err)
	}
	return b, nil
}

// ClaimBookingInvoice links a booking to its invoice, but only if it is PAID
// and not already invoiced — the partial unique index plus this guard make the
// booking→invoice relation effectively one-shot even under concurrent clicks.
// updated_at is left untouched: it doubles as the payment timestamp.
func (r *Repository) ClaimBookingInvoice(ctx context.Context, orgID, bookingID, invoiceID string) (bool, error) {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE bookings SET invoice_id = $3
		WHERE organization_id = $1 AND id = $2 AND status = 'PAID' AND invoice_id IS NULL
	`, orgID, bookingID, invoiceID)
	if err != nil {
		return false, fmt.Errorf("claim booking invoice: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}
