package invoicing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	// ErrNotPayable is returned when a payment targets an invoice that is not in
	// a payable state (DRAFT, CANCELLED, or already PAID).
	ErrNotPayable = errors.New("invoice is not payable")
	// ErrNotDraft is returned when issuing/editing requires a DRAFT invoice.
	ErrNotDraft = errors.New("invoice is not a draft")
)

// rawInvoice mirrors a row of invoices, money as decimal strings and notes still
// encrypted.
type rawInvoice struct {
	ID               string
	PatientID        string
	AppointmentID    *string
	RateID           *string
	DEKID            string
	Currency         string
	Subtotal         string
	Discount         string
	InsuranceCovered string
	TotalDue         string
	TotalPaid        string
	Status           string
	NotesEnc         []byte
	IssuedAt         *time.Time
	DueAt            *time.Time
	CreatedAt        time.Time
}

const invoiceColumns = `id, patient_id, appointment_id, rate_id, dek_id, currency,
	subtotal::text, discount::text, insurance_covered::text, total_due::text, total_paid::text,
	status, notes_enc, issued_at, due_at, created_at`

func scanInvoice(row pgx.Row) (rawInvoice, error) {
	var i rawInvoice
	err := row.Scan(&i.ID, &i.PatientID, &i.AppointmentID, &i.RateID, &i.DEKID, &i.Currency,
		&i.Subtotal, &i.Discount, &i.InsuranceCovered, &i.TotalDue, &i.TotalPaid,
		&i.Status, &i.NotesEnc, &i.IssuedAt, &i.DueAt, &i.CreatedAt)
	return i, err
}

// createInvoiceParams carries an invoice insert. Money fields are decimal
// strings; total_due is computed in SQL so no float ever touches the amount.
type createInvoiceParams struct {
	OrgID            string
	PatientID        string
	CreatedBy        string
	DEKID            string
	AppointmentID    *string
	RateID           *string
	Currency         string
	Subtotal         string
	Discount         string
	InsuranceCovered string
	NotesEnc         []byte
	DueAt            *time.Time
}

func (r *Repository) CreateInvoice(ctx context.Context, p createInvoiceParams) (rawInvoice, error) {
	row := r.q(ctx).QueryRow(ctx, `
		INSERT INTO invoices (
			organization_id, patient_id, appointment_id, rate_id, dek_id, created_by,
			currency, subtotal, discount, insurance_covered, total_due, notes_enc, due_at, status
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8::numeric, $9::numeric, $10::numeric,
			($8::numeric - $9::numeric - $10::numeric), $11, $12, 'DRAFT'
		)
		RETURNING `+invoiceColumns,
		p.OrgID, p.PatientID, p.AppointmentID, p.RateID, p.DEKID, p.CreatedBy,
		p.Currency, p.Subtotal, p.Discount, p.InsuranceCovered, p.NotesEnc, p.DueAt)
	inv, err := scanInvoice(row)
	if err != nil {
		return rawInvoice{}, fmt.Errorf("insert invoice: %w", err)
	}
	return inv, nil
}

// ListInvoices returns the org's invoices, optionally filtered by patient and/or
// status, newest first. Notes are left encrypted (the list view doesn't show them).
func (r *Repository) ListInvoices(ctx context.Context, orgID string, patientID, status string) ([]rawInvoice, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+invoiceColumns+`
		FROM invoices
		WHERE organization_id = $1
		  AND ($2 = '' OR patient_id = $2::uuid)
		  AND ($3 = '' OR status = $3::invoice_status)
		ORDER BY created_at DESC
	`, orgID, patientID, status)
	if err != nil {
		return nil, fmt.Errorf("list invoices: %w", err)
	}
	defer rows.Close()

	out := make([]rawInvoice, 0)
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err != nil {
			return nil, fmt.Errorf("scan invoice: %w", err)
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

func (r *Repository) GetInvoice(ctx context.Context, orgID, id string) (rawInvoice, error) {
	row := r.q(ctx).QueryRow(ctx, `
		SELECT `+invoiceColumns+`
		FROM invoices WHERE organization_id = $1 AND id = $2
	`, orgID, id)
	inv, err := scanInvoice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return rawInvoice{}, ErrNotFound
	}
	if err != nil {
		return rawInvoice{}, fmt.Errorf("get invoice: %w", err)
	}
	return inv, nil
}

// IssueInvoice transitions a DRAFT invoice to ISSUED, stamping issued_at and an
// optional due date.
func (r *Repository) IssueInvoice(ctx context.Context, orgID, id string, dueAt *time.Time) (rawInvoice, error) {
	row := r.q(ctx).QueryRow(ctx, `
		UPDATE invoices
		SET status = 'ISSUED', issued_at = NOW(),
		    due_at = COALESCE($3, due_at), updated_at = NOW()
		WHERE organization_id = $1 AND id = $2 AND status = 'DRAFT'
		RETURNING `+invoiceColumns,
		orgID, id, dueAt)
	inv, err := scanInvoice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return rawInvoice{}, ErrNotDraft
	}
	if err != nil {
		return rawInvoice{}, fmt.Errorf("issue invoice: %w", err)
	}
	return inv, nil
}

// CancelInvoice marks an invoice CANCELLED. A fully paid invoice cannot be
// cancelled (refunds are out of scope for this phase).
func (r *Repository) CancelInvoice(ctx context.Context, orgID, id string) (rawInvoice, error) {
	row := r.q(ctx).QueryRow(ctx, `
		UPDATE invoices
		SET status = 'CANCELLED', updated_at = NOW()
		WHERE organization_id = $1 AND id = $2 AND status <> 'PAID'
		RETURNING `+invoiceColumns,
		orgID, id)
	inv, err := scanInvoice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return rawInvoice{}, ErrNotPayable
	}
	if err != nil {
		return rawInvoice{}, fmt.Errorf("cancel invoice: %w", err)
	}
	return inv, nil
}

// rawPayment mirrors a row of payments, reference still encrypted.
type rawPayment struct {
	ID            string
	Amount        string
	Currency      string
	PaymentMethod string
	ReferenceEnc  []byte
	Notes         string
	PaidAt        time.Time
	CreatedAt     time.Time
}

const paymentColumns = `id, amount::text, currency, payment_method, reference_enc, COALESCE(notes, ''), paid_at, created_at`

type addPaymentParams struct {
	OrgID         string
	InvoiceID     string
	RecordedBy    string
	Amount        string
	Currency      string
	PaymentMethod string
	ReferenceEnc  []byte
	Notes         string
	PaidAt        time.Time
}

// AddPayment records a payment against an ISSUED/PARTIAL invoice and advances the
// invoice's total_paid and status atomically. The invoice row is locked FOR
// UPDATE inside a transaction so concurrent payments can't race the running
// total or the status transition.
func (r *Repository) AddPayment(ctx context.Context, p addPaymentParams) (rawPayment, rawInvoice, error) {
	tx, err := r.q(ctx).Begin(ctx)
	if err != nil {
		return rawPayment{}, rawInvoice{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var status, totalDue, totalPaid string
	err = tx.QueryRow(ctx, `
		SELECT status, total_due::text, total_paid::text
		FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE
	`, p.OrgID, p.InvoiceID).Scan(&status, &totalDue, &totalPaid)
	if errors.Is(err, pgx.ErrNoRows) {
		return rawPayment{}, rawInvoice{}, ErrNotFound
	}
	if err != nil {
		return rawPayment{}, rawInvoice{}, fmt.Errorf("lock invoice: %w", err)
	}
	if status != "ISSUED" && status != "PARTIAL" {
		return rawPayment{}, rawInvoice{}, ErrNotPayable
	}

	var pay rawPayment
	err = tx.QueryRow(ctx, `
		INSERT INTO payments (organization_id, invoice_id, amount, currency, payment_method, reference_enc, notes, paid_at, recorded_by)
		VALUES ($1, $2, $3::numeric, $4, $5, $6, NULLIF($7, ''), $8, $9)
		RETURNING `+paymentColumns,
		p.OrgID, p.InvoiceID, p.Amount, p.Currency, p.PaymentMethod, p.ReferenceEnc, p.Notes, p.PaidAt, p.RecordedBy).
		Scan(&pay.ID, &pay.Amount, &pay.Currency, &pay.PaymentMethod, &pay.ReferenceEnc, &pay.Notes, &pay.PaidAt, &pay.CreatedAt)
	if err != nil {
		return rawPayment{}, rawInvoice{}, fmt.Errorf("insert payment: %w", err)
	}

	row := tx.QueryRow(ctx, `
		UPDATE invoices
		SET total_paid = total_paid + $3::numeric,
		    status = CASE
		        WHEN total_paid + $3::numeric >= total_due THEN 'PAID'::invoice_status
		        ELSE 'PARTIAL'::invoice_status
		    END,
		    updated_at = NOW()
		WHERE organization_id = $1 AND id = $2
		RETURNING `+invoiceColumns,
		p.OrgID, p.InvoiceID, p.Amount)
	inv, err := scanInvoice(row)
	if err != nil {
		return rawPayment{}, rawInvoice{}, fmt.Errorf("update invoice total: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return rawPayment{}, rawInvoice{}, fmt.Errorf("commit: %w", err)
	}
	return pay, inv, nil
}

// InvoiceSummary holds the org-wide billing aggregates (money as decimal
// strings, computed in SQL without decrypting anything).
type InvoiceSummary struct {
	Invoiced  string `json:"invoiced"`
	Collected string `json:"collected"`
	Pending   string `json:"pending"`
	Currency  string `json:"currency"`
	Count     int    `json:"count"`
	Draft     int    `json:"draft"`
	Issued    int    `json:"issued"`
	Partial   int    `json:"partial"`
	Paid      int    `json:"paid"`
	Cancelled int    `json:"cancelled"`
}

// Summary aggregates the org's invoices: total invoiced and collected (excluding
// cancelled), outstanding balance (issued + partial) and counts per status.
// Single-currency assumption (Colombian clinics bill in COP): the reported
// currency is that of the most recent invoice.
func (r *Repository) Summary(ctx context.Context, orgID string) (InvoiceSummary, error) {
	var s InvoiceSummary
	err := r.q(ctx).QueryRow(ctx, `
		SELECT
			COALESCE(SUM(total_due)  FILTER (WHERE status <> 'CANCELLED'), 0)::text,
			COALESCE(SUM(total_paid) FILTER (WHERE status <> 'CANCELLED'), 0)::text,
			COALESCE(SUM(total_due - total_paid) FILTER (WHERE status IN ('ISSUED','PARTIAL')), 0)::text,
			COUNT(*) FILTER (WHERE status <> 'CANCELLED'),
			COUNT(*) FILTER (WHERE status = 'DRAFT'),
			COUNT(*) FILTER (WHERE status = 'ISSUED'),
			COUNT(*) FILTER (WHERE status = 'PARTIAL'),
			COUNT(*) FILTER (WHERE status = 'PAID'),
			COUNT(*) FILTER (WHERE status = 'CANCELLED'),
			COALESCE((SELECT currency FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1), 'COP')
		FROM invoices WHERE organization_id = $1
	`, orgID).Scan(&s.Invoiced, &s.Collected, &s.Pending,
		&s.Count, &s.Draft, &s.Issued, &s.Partial, &s.Paid, &s.Cancelled, &s.Currency)
	if err != nil {
		return InvoiceSummary{}, fmt.Errorf("invoice summary: %w", err)
	}
	return s, nil
}

// ListPayments returns an invoice's payments, oldest first.
func (r *Repository) ListPayments(ctx context.Context, orgID, invoiceID string) ([]rawPayment, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+paymentColumns+`
		FROM payments WHERE organization_id = $1 AND invoice_id = $2
		ORDER BY paid_at ASC
	`, orgID, invoiceID)
	if err != nil {
		return nil, fmt.Errorf("list payments: %w", err)
	}
	defer rows.Close()

	out := make([]rawPayment, 0)
	for rows.Next() {
		var p rawPayment
		if err := rows.Scan(&p.ID, &p.Amount, &p.Currency, &p.PaymentMethod, &p.ReferenceEnc, &p.Notes, &p.PaidAt, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan payment: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
