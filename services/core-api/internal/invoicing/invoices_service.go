package invoicing

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"sghcp/core-api/internal/shared/crypto"
)

var validPaymentMethods = map[string]bool{
	"CASH": true, "DEBIT_CARD": true, "CREDIT_CARD": true, "BANK_TRANSFER": true,
	"NEQUI": true, "DAVIPLATA": true, "PSE": true, "INSURANCE_EPS": true,
	"INSURANCE_PRIVATE": true, "OTHER": true,
}

// Invoice is the API-facing view of an invoice. Money fields are decimal strings.
type Invoice struct {
	ID               string     `json:"id"`
	PatientID        string     `json:"patient_id"`
	AppointmentID    *string    `json:"appointment_id,omitempty"`
	RateID           *string    `json:"rate_id,omitempty"`
	Currency         string     `json:"currency"`
	Subtotal         string     `json:"subtotal"`
	Discount         string     `json:"discount"`
	InsuranceCovered string     `json:"insurance_covered"`
	TotalDue         string     `json:"total_due"`
	TotalPaid        string     `json:"total_paid"`
	Status           string     `json:"status"`
	Notes            string     `json:"notes,omitempty"`
	IssuedAt         *time.Time `json:"issued_at,omitempty"`
	DueAt            *time.Time `json:"due_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	Payments         []Payment  `json:"payments,omitempty"`
}

type Payment struct {
	ID            string    `json:"id"`
	Amount        string    `json:"amount"`
	Currency      string    `json:"currency"`
	PaymentMethod string    `json:"payment_method"`
	Reference     string    `json:"reference,omitempty"`
	Notes         string    `json:"notes,omitempty"`
	PaidAt        time.Time `json:"paid_at"`
}

// InvoiceInput is the create payload (money as decimal strings).
type InvoiceInput struct {
	PatientID        string
	AppointmentID    *string
	RateID           *string
	Currency         string
	Subtotal         string
	Discount         string
	InsuranceCovered string
	Notes            string
	DueAt            *time.Time
}

type PaymentInput struct {
	Amount        string
	PaymentMethod string
	Reference     string
	Notes         string
	PaidAt        *time.Time
}

func toInvoiceSummary(r rawInvoice) Invoice {
	return Invoice{
		ID: r.ID, PatientID: r.PatientID, AppointmentID: r.AppointmentID, RateID: r.RateID,
		Currency: r.Currency, Subtotal: r.Subtotal, Discount: r.Discount,
		InsuranceCovered: r.InsuranceCovered, TotalDue: r.TotalDue, TotalPaid: r.TotalPaid,
		Status: r.Status, IssuedAt: r.IssuedAt, DueAt: r.DueAt, CreatedAt: r.CreatedAt,
	}
}

func (s *Service) CreateInvoice(ctx context.Context, orgID, userID string, in InvoiceInput) (Invoice, error) {
	if strings.TrimSpace(in.PatientID) == "" {
		return Invoice{}, fmt.Errorf("%w: patient_id es obligatorio", ErrInvalidInput)
	}
	subtotal, err := normalizeAmount(in.Subtotal, false)
	if err != nil {
		return Invoice{}, fmt.Errorf("%w: subtotal — %s", ErrInvalidInput, err)
	}
	discount, err := normalizeAmount(in.Discount, true)
	if err != nil {
		return Invoice{}, fmt.Errorf("%w: descuento — %s", ErrInvalidInput, err)
	}
	insurance, err := normalizeAmount(in.InsuranceCovered, true)
	if err != nil {
		return Invoice{}, fmt.Errorf("%w: cubierto por seguro — %s", ErrInvalidInput, err)
	}
	sc, _ := toCents(subtotal)
	if cents(discount)+cents(insurance) > sc {
		return Invoice{}, fmt.Errorf("%w: descuento + seguro no pueden superar el subtotal", ErrInvalidInput)
	}

	currency := normalizeCurrency(in.Currency)
	if len(currency) != 3 {
		return Invoice{}, fmt.Errorf("%w: moneda inválida", ErrInvalidInput)
	}

	plainDEK, dekID, err := s.newDEK(ctx)
	if err != nil {
		return Invoice{}, err
	}
	defer crypto.Zeroize(plainDEK)

	notes := strings.TrimSpace(in.Notes)
	notesEnc, err := sealField(plainDEK, notes)
	if err != nil {
		return Invoice{}, err
	}

	raw, err := s.repo.CreateInvoice(ctx, createInvoiceParams{
		OrgID: orgID, PatientID: in.PatientID, CreatedBy: userID, DEKID: dekID,
		AppointmentID: in.AppointmentID, RateID: in.RateID, Currency: currency,
		Subtotal: subtotal, Discount: discount, InsuranceCovered: insurance,
		NotesEnc: notesEnc, DueAt: in.DueAt,
	})
	if err != nil {
		return Invoice{}, err
	}
	inv := toInvoiceSummary(raw)
	inv.Notes = notes
	inv.Payments = []Payment{}
	return inv, nil
}

func (s *Service) ListInvoices(ctx context.Context, orgID, patientID, status string) ([]Invoice, error) {
	raws, err := s.repo.ListInvoices(ctx, orgID, patientID, strings.ToUpper(strings.TrimSpace(status)))
	if err != nil {
		return nil, err
	}
	out := make([]Invoice, len(raws))
	for i, r := range raws {
		out[i] = toInvoiceSummary(r)
	}
	return out, nil
}

// GetInvoice returns a single invoice with its decrypted notes and its payments
// (references decrypted with the same per-invoice DEK).
func (s *Service) GetInvoice(ctx context.Context, orgID, id string) (Invoice, error) {
	raw, err := s.repo.GetInvoice(ctx, orgID, id)
	if err != nil {
		return Invoice{}, err
	}
	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return Invoice{}, err
	}
	defer crypto.Zeroize(dek)

	inv := toInvoiceSummary(raw)
	if inv.Notes, err = openField(dek, raw.NotesEnc); err != nil {
		return Invoice{}, err
	}

	pays, err := s.repo.ListPayments(ctx, orgID, id)
	if err != nil {
		return Invoice{}, err
	}
	inv.Payments = make([]Payment, len(pays))
	for i, p := range pays {
		ref, err := openField(dek, p.ReferenceEnc)
		if err != nil {
			return Invoice{}, err
		}
		inv.Payments[i] = Payment{
			ID: p.ID, Amount: p.Amount, Currency: p.Currency, PaymentMethod: p.PaymentMethod,
			Reference: ref, Notes: p.Notes, PaidAt: p.PaidAt,
		}
	}
	return inv, nil
}

func (s *Service) IssueInvoice(ctx context.Context, orgID, id string, dueAt *time.Time) (Invoice, error) {
	raw, err := s.repo.IssueInvoice(ctx, orgID, id, dueAt)
	if err != nil {
		return Invoice{}, err
	}
	return toInvoiceSummary(raw), nil
}

func (s *Service) CancelInvoice(ctx context.Context, orgID, id string) (Invoice, error) {
	raw, err := s.repo.CancelInvoice(ctx, orgID, id)
	if err != nil {
		return Invoice{}, err
	}
	return toInvoiceSummary(raw), nil
}

// RecordPayment seals the optional reference with the invoice's DEK and records
// the payment, refusing amounts that would overpay the remaining balance.
func (s *Service) RecordPayment(ctx context.Context, orgID, userID, invoiceID string, in PaymentInput) (Invoice, error) {
	amount, err := normalizeAmount(in.Amount, false)
	if err != nil {
		return Invoice{}, fmt.Errorf("%w: monto — %s", ErrInvalidInput, err)
	}
	method := strings.ToUpper(strings.TrimSpace(in.PaymentMethod))
	if !validPaymentMethods[method] {
		return Invoice{}, fmt.Errorf("%w: medio de pago inválido", ErrInvalidInput)
	}

	raw, err := s.repo.GetInvoice(ctx, orgID, invoiceID)
	if err != nil {
		return Invoice{}, err
	}
	if raw.Status != "ISSUED" && raw.Status != "PARTIAL" {
		return Invoice{}, ErrNotPayable
	}
	remaining := cents(raw.TotalDue) - cents(raw.TotalPaid)
	if cents(amount) > remaining {
		return Invoice{}, fmt.Errorf("%w: el pago supera el saldo pendiente", ErrInvalidInput)
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return Invoice{}, err
	}
	defer crypto.Zeroize(dek)
	refEnc, err := sealField(dek, strings.TrimSpace(in.Reference))
	if err != nil {
		return Invoice{}, err
	}

	paidAt := time.Now()
	if in.PaidAt != nil {
		paidAt = *in.PaidAt
	}

	_, inv, err := s.repo.AddPayment(ctx, addPaymentParams{
		OrgID: orgID, InvoiceID: invoiceID, RecordedBy: userID,
		Amount: amount, Currency: raw.Currency, PaymentMethod: method,
		ReferenceEnc: refEnc, Notes: strings.TrimSpace(in.Notes), PaidAt: paidAt,
	})
	if err != nil {
		return Invoice{}, err
	}
	return toInvoiceSummary(inv), nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

func (s *Service) newDEK(ctx context.Context) (dek []byte, dekID string, err error) {
	plainDEK, encDEK, keySource, err := s.km.GenerateDEK()
	if err != nil {
		return nil, "", err
	}
	dekID, err = s.repo.CreateEncKey(ctx, encDEK, keySource)
	if err != nil {
		return nil, "", err
	}
	return plainDEK, dekID, nil
}

func (s *Service) loadDEK(ctx context.Context, dekID string) ([]byte, error) {
	row, err := s.repo.FindEncKey(ctx, dekID)
	if err != nil {
		return nil, fmt.Errorf("load DEK: %w", err)
	}
	return s.km.DecryptDEK(row.KeySource, row.EncryptedDEK)
}

func sealField(dek []byte, plaintext string) ([]byte, error) {
	if plaintext == "" {
		return nil, nil
	}
	return crypto.Seal(dek, []byte(plaintext))
}

func openField(dek, ciphertext []byte) (string, error) {
	if len(ciphertext) == 0 {
		return "", nil
	}
	b, err := crypto.Open(dek, ciphertext)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// normalizeAmount validates a decimal money string (≤8 int digits, ≤2 decimals).
// When allowZero is false it must be strictly positive. Empty defaults to "0"
// only when allowZero. Returns the trimmed string ready for ::numeric.
func normalizeAmount(s string, allowZero bool) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		if allowZero {
			return "0", nil
		}
		return "", fmt.Errorf("requerido")
	}
	if !amountPattern.MatchString(s) {
		return "", fmt.Errorf("debe ser un número con hasta dos decimales")
	}
	if !allowZero && isZeroAmount(s) {
		return "", fmt.Errorf("debe ser mayor que cero")
	}
	return s, nil
}

func normalizeCurrency(c string) string {
	c = strings.ToUpper(strings.TrimSpace(c))
	if c == "" {
		return "COP"
	}
	return c
}

// toCents converts a validated decimal string to integer cents.
func toCents(s string) (int64, bool) {
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	intPart, frac, _ := strings.Cut(s, ".")
	frac = (frac + "00")[:2]
	whole, err1 := strconv.ParseInt(intPart, 10, 64)
	cs, err2 := strconv.ParseInt(frac, 10, 64)
	if err1 != nil || err2 != nil {
		return 0, false
	}
	v := whole*100 + cs
	if neg {
		v = -v
	}
	return v, true
}

// cents is toCents for already-validated strings (parse failure → 0).
func cents(s string) int64 {
	v, _ := toCents(s)
	return v
}
