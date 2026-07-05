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
	InvoiceNumber    *int
	ReceiptSentAt    *time.Time
	RateName         *string
}

// invoiceColumns is selected by every read and RETURNing query. rate name comes
// from a correlated subquery so it works in RETURNING too (no join needed).
const invoiceColumns = `id, patient_id, appointment_id, rate_id, dek_id, currency,
	subtotal::text, discount::text, insurance_covered::text, total_due::text, total_paid::text,
	status, notes_enc, issued_at, due_at, created_at,
	invoice_number, receipt_sent_at,
	(SELECT sr.name FROM service_rates sr WHERE sr.id = invoices.rate_id)`

func scanInvoice(row pgx.Row) (rawInvoice, error) {
	var i rawInvoice
	err := row.Scan(&i.ID, &i.PatientID, &i.AppointmentID, &i.RateID, &i.DEKID, &i.Currency,
		&i.Subtotal, &i.Discount, &i.InsuranceCovered, &i.TotalDue, &i.TotalPaid,
		&i.Status, &i.NotesEnc, &i.IssuedAt, &i.DueAt, &i.CreatedAt,
		&i.InvoiceNumber, &i.ReceiptSentAt, &i.RateName)
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

// ListInvoices returns the org's invoices, optionally filtered by patient,
// status and an issued/created-date window ([from, to); nil bounds disable it),
// newest first. Notes are left encrypted (the list view doesn't show them).
//
// staffID scopes the result to the invoices of patients assigned to that staff
// member (via patient_staff_rel) — the "own patients" view for a clinical
// professional. An empty staffID disables the scope (org-wide view).
func (r *Repository) ListInvoices(ctx context.Context, orgID string, patientID, status, staffID string, from, to *time.Time) ([]rawInvoice, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+invoiceColumns+`
		FROM invoices
		WHERE organization_id = $1
		  AND ($2 = '' OR patient_id = $2::uuid)
		  AND ($3 = '' OR status = $3::invoice_status)
		  AND ($4::timestamptz IS NULL OR COALESCE(issued_at, created_at) >= $4)
		  AND ($5::timestamptz IS NULL OR COALESCE(issued_at, created_at) <  $5)
		  AND ($6 = '' OR patient_id IN (
		        SELECT patient_id FROM patient_staff_rel
		        WHERE organization_id = $1 AND staff_id = $6::uuid AND ended_at IS NULL))
		ORDER BY created_at DESC
	`, orgID, patientID, status, from, to, staffID)
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

// ListPending returns invoices with an outstanding balance (ISSUED or PARTIAL),
// oldest first — the candidates for a payment-reminder run.
func (r *Repository) ListPending(ctx context.Context, orgID string) ([]rawInvoice, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+invoiceColumns+`
		FROM invoices
		WHERE organization_id = $1 AND status IN ('ISSUED','PARTIAL')
		ORDER BY COALESCE(due_at, issued_at, created_at) ASC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list pending invoices: %w", err)
	}
	defer rows.Close()
	out := make([]rawInvoice, 0)
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err != nil {
			return nil, fmt.Errorf("scan pending invoice: %w", err)
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

// IssueInvoice transitions a DRAFT invoice to ISSUED, stamping issued_at, an
// optional due date and the next per-org consecutive number. A transaction-level
// advisory lock per org serializes numbering so two concurrent issues can't take
// the same number.
func (r *Repository) IssueInvoice(ctx context.Context, orgID, id string, dueAt *time.Time) (rawInvoice, error) {
	tx, err := r.q(ctx).Begin(ctx)
	if err != nil {
		return rawInvoice{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, orgID); err != nil {
		return rawInvoice{}, fmt.Errorf("lock numbering: %w", err)
	}
	var next int
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(invoice_number), 0) + 1 FROM invoices WHERE organization_id = $1`, orgID,
	).Scan(&next); err != nil {
		return rawInvoice{}, fmt.Errorf("next invoice number: %w", err)
	}

	row := tx.QueryRow(ctx, `
		UPDATE invoices
		SET status = 'ISSUED', issued_at = NOW(), invoice_number = $3,
		    due_at = COALESCE($4, due_at), updated_at = NOW()
		WHERE organization_id = $1 AND id = $2 AND status = 'DRAFT'
		RETURNING `+invoiceColumns,
		orgID, id, next, dueAt)
	inv, err := scanInvoice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return rawInvoice{}, ErrNotDraft
	}
	if err != nil {
		return rawInvoice{}, fmt.Errorf("issue invoice: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return rawInvoice{}, fmt.Errorf("commit: %w", err)
	}
	return inv, nil
}

// MarkReceiptSent stamps when the receipt was last emailed to the patient.
func (r *Repository) MarkReceiptSent(ctx context.Context, orgID, id string) error {
	_, err := r.q(ctx).Exec(ctx,
		`UPDATE invoices SET receipt_sent_at = NOW(), updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
		orgID, id)
	if err != nil {
		return fmt.Errorf("mark receipt sent: %w", err)
	}
	return nil
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
