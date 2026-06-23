package invoicing

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// InvoiceRoutes is mounted at /api/v1/invoices (JWT + tenant scope by the parent
// group). Reading needs billing:read; creating/issuing/cancelling needs
// billing:create; recording a payment needs billing:record_payment.
func (h *Handler) InvoiceRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("billing:reports")).Get("/overview", h.overview)
	r.With(middleware.RequirePermission("billing:reports")).Get("/patients-balance", h.patientsBalance)
	r.With(middleware.RequirePermission("billing:read")).Get("/bookings", h.listBookingPayments)
	r.With(middleware.RequirePermission("billing:read")).Get("/", h.listInvoices)
	r.With(middleware.RequirePermission("billing:read")).Get("/{invoice_id}", h.getInvoice)
	r.With(middleware.RequirePermission("billing:read")).Get("/{invoice_id}/receipt", h.receipt)
	r.With(middleware.RequirePermission("billing:read")).Post("/{invoice_id}/send", h.sendReceipt)
	r.With(middleware.RequirePermission("billing:create")).Post("/", h.createInvoice)
	r.With(middleware.RequirePermission("billing:create")).Post("/{invoice_id}/issue", h.issueInvoice)
	r.With(middleware.RequirePermission("billing:create")).Post("/{invoice_id}/cancel", h.cancelInvoice)
	r.With(middleware.RequirePermission("billing:create")).Post("/send-reminders", h.sendReminders)
	r.With(middleware.RequirePermission("billing:record_payment")).Post("/{invoice_id}/payments", h.recordPayment)
	return r
}

// BookingPayment is one row returned by GET /invoices/bookings.
type BookingPayment struct {
	ID             string     `json:"id"`
	BookingNumber  int64      `json:"booking_number"`
	ScheduledAt    time.Time  `json:"scheduled_at"`
	GuestName      string     `json:"guest_name"`
	Email          string     `json:"email"`
	Phone          string     `json:"phone"`
	Modality       string     `json:"modality"`
	Amount         int        `json:"amount"`
	Status         string     `json:"status"`
	PaymentType    string     `json:"payment_type"`
	PaymentMethod  string     `json:"payment_method"`
	MpPaymentID    string     `json:"mp_payment_id"`
	VoucherURL     string     `json:"voucher_url"`
	HoldExpiresAt  *time.Time `json:"hold_expires_at"`
	PaidAt         *time.Time `json:"paid_at"`
	AppointmentID  *string    `json:"appointment_id"`
}

// GET /invoices/bookings — list booking payments (PAID and active PENDING_PAYMENT holds).
func (h *Handler) listBookingPayments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	q := r.URL.Query()
	from, to := periodBounds(q.Get("period"))
	status := q.Get("status")

	rows, err := h.svc.repo.ListBookingPayments(ctx, claims.OrganizationID, status, from, to)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudieron cargar las reservas")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, rows)
}

// parseTime turns an optional RFC3339 string into a *time.Time (nil when empty).
func parseTime(s string) (*time.Time, bool) {
	if s == "" {
		return nil, true
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, false
	}
	return &t, true
}

// periodBounds maps a period name to a [from, to) window, or nils for "all"/none.
func periodBounds(period string) (from, to *time.Time) {
	switch period {
	case "week", "month", "quarter", "year":
		f, t, _, _, _ := periodRange(period, time.Now())
		return &f, &t
	default:
		return nil, nil
	}
}

func (h *Handler) listInvoices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	q := r.URL.Query()
	from, to := periodBounds(q.Get("period"))
	invoices, err := h.svc.ListInvoices(ctx, claims.OrganizationID, q.Get("patient_id"), q.Get("status"), from, to)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudieron cargar las facturas")
		return
	}
	// The org-wide view needs each invoice's patient name. Resolve distinct
	// patients once (names are encrypted per-patient, so this decrypts on read).
	if q.Get("with_patient") == "true" {
		names := map[string]string{}
		for i := range invoices {
			pid := invoices[i].PatientID
			name, ok := names[pid]
			if !ok {
				if p, err := h.patients.Get(ctx, claims.OrganizationID, pid); err == nil {
					name = joinNonEmpty(p.FirstName, p.MiddleName, p.PaternalLastName, p.MaternalLastName)
				}
				names[pid] = name
			}
			invoices[i].PatientName = name
		}
	}
	httputil.WriteJSON(w, http.StatusOK, invoices)
}

func (h *Handler) patientsBalance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	from, to := periodBounds(r.URL.Query().Get("period"))

	rows, err := h.svc.PatientsBalance(ctx, claims.OrganizationID, from, to)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo calcular el balance por paciente")
		return
	}
	for i := range rows {
		if p, err := h.patients.Get(ctx, claims.OrganizationID, rows[i].PatientID); err == nil {
			rows[i].Name = joinNonEmpty(p.FirstName, p.MiddleName, p.PaternalLastName, p.MaternalLastName)
		}
	}
	httputil.WriteJSON(w, http.StatusOK, rows)
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	ov, err := h.svc.Overview(r.Context(), claims.OrganizationID, r.URL.Query().Get("period"))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, ov)
}

func (h *Handler) getInvoice(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	inv, err := h.svc.GetInvoice(r.Context(), claims.OrganizationID, chi.URLParam(r, "invoice_id"))
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, inv)
}

type invoiceBody struct {
	PatientID        string  `json:"patient_id"`
	AppointmentID    *string `json:"appointment_id"`
	RateID           *string `json:"rate_id"`
	Currency         string  `json:"currency"`
	Subtotal         string  `json:"subtotal"`
	Discount         string  `json:"discount"`
	InsuranceCovered string  `json:"insurance_covered"`
	Notes            string  `json:"notes"`
	DueAt            string  `json:"due_at"`
}

func (h *Handler) createInvoice(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var body invoiceBody
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	dueAt, ok := parseTime(body.DueAt)
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "fecha de vencimiento inválida")
		return
	}
	inv, err := h.svc.CreateInvoice(r.Context(), claims.OrganizationID, claims.UserID, InvoiceInput{
		PatientID: body.PatientID, AppointmentID: body.AppointmentID, RateID: body.RateID,
		Currency: body.Currency, Subtotal: body.Subtotal, Discount: body.Discount,
		InsuranceCovered: body.InsuranceCovered, Notes: body.Notes, DueAt: dueAt,
	})
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, inv)
}

func (h *Handler) issueInvoice(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var body struct {
		DueAt string `json:"due_at"`
	}
	_ = httputil.DecodeJSON(r, &body) // body is optional
	dueAt, ok := parseTime(body.DueAt)
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "fecha de vencimiento inválida")
		return
	}
	inv, err := h.svc.IssueInvoice(r.Context(), claims.OrganizationID, chi.URLParam(r, "invoice_id"), dueAt)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, inv)
}

func (h *Handler) cancelInvoice(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	inv, err := h.svc.CancelInvoice(r.Context(), claims.OrganizationID, chi.URLParam(r, "invoice_id"))
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, inv)
}

// patientReceipt bundles a rendered receipt PDF with the patient identity it
// was built for, so both the download and the email path can reuse it.
type patientReceipt struct {
	PDF         []byte
	Invoice     Invoice
	PatientName string
	Email       string
}

func (h *Handler) buildReceipt(ctx context.Context, orgID, invoiceID string) (patientReceipt, error) {
	inv, err := h.svc.GetInvoice(ctx, orgID, invoiceID)
	if err != nil {
		return patientReceipt{}, err
	}
	name, doc, email := "", "", ""
	if p, err := h.patients.Get(ctx, orgID, inv.PatientID); err == nil {
		name = joinNonEmpty(p.FirstName, p.MiddleName, p.PaternalLastName, p.MaternalLastName)
		doc = p.DocumentNumber
		email = p.Email
	}
	var buf bytes.Buffer
	if err := RenderReceipt(&buf, ReceiptData{
		Org:         h.orgLetterhead(ctx, orgID),
		PatientName: name,
		PatientDoc:  doc,
		Invoice:     inv,
		GeneratedAt: time.Now(),
	}); err != nil {
		return patientReceipt{}, err
	}
	return patientReceipt{PDF: buf.Bytes(), Invoice: inv, PatientName: name, Email: email}, nil
}

// invoiceLabel renders the human consecutive number (F-000001) or, for a draft
// without one, the short id.
func invoiceLabel(inv Invoice) string {
	if inv.InvoiceNumber != nil {
		return fmt.Sprintf("F-%06d", *inv.InvoiceNumber)
	}
	return shortID(inv.ID)
}

// GET /{invoice_id}/receipt — a printable payment receipt PDF (comprobante de
// pago, not a DIAN electronic invoice).
func (h *Handler) receipt(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)

	rc, err := h.buildReceipt(ctx, claims.OrganizationID, chi.URLParam(r, "invoice_id"))
	if err != nil {
		h.writeErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="comprobante-%s.pdf"`, invoiceLabel(rc.Invoice)))
	_, _ = w.Write(rc.PDF)
}

// POST /{invoice_id}/send — email the receipt PDF to the patient.
func (h *Handler) sendReceipt(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)

	rc, err := h.buildReceipt(ctx, claims.OrganizationID, chi.URLParam(r, "invoice_id"))
	if err != nil {
		h.writeErr(w, err)
		return
	}
	if rc.Email == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "el paciente no tiene correo registrado")
		return
	}
	if err := h.notifier.InvoiceReceipt(ctx, rc.Email, notify.InvoiceEmailDetails{
		OrgID:         claims.OrganizationID,
		PatientName:   rc.PatientName,
		InvoiceNumber: invoiceLabel(rc.Invoice),
		Amount:        formatMoney(rc.Invoice.TotalDue, rc.Invoice.Currency),
		StatusLabel:   statusES(rc.Invoice.Status),
	}, rc.PDF); err != nil {
		httputil.WriteError(w, http.StatusBadGateway, "no se pudo enviar el correo")
		return
	}
	if err := h.svc.MarkReceiptSent(ctx, claims.OrganizationID, rc.Invoice.ID); err != nil {
		// The email already went out; the timestamp is best-effort.
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"sent": true})
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"sent": true, "email": rc.Email})
}

// orgLetterhead reads the clinic identification (name, NIT, contact) for the
// receipt header from organizations.settings, like the clinical PDF exporter.
func (h *Handler) orgLetterhead(ctx context.Context, orgID string) OrgLetterhead {
	var name, nit string
	var settingsRaw []byte
	if err := dbctx.From(ctx, h.pool).QueryRow(ctx,
		`SELECT name, COALESCE(nit, ''), settings FROM organizations WHERE id = $1`, orgID,
	).Scan(&name, &nit, &settingsRaw); err != nil {
		return OrgLetterhead{Name: name}
	}
	lh := OrgLetterhead{Name: name, NIT: nit}
	var settings map[string]any
	if json.Unmarshal(settingsRaw, &settings) == nil {
		if v, ok := settings["address"].(string); ok {
			lh.Address = v
		}
		if v, ok := settings["phone"].(string); ok {
			lh.Phone = v
		}
		if v, ok := settings["email"].(string); ok {
			lh.Email = v
		}
	}
	return lh
}

func joinNonEmpty(parts ...string) string {
	out := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		if out != "" {
			out += " "
		}
		out += p
	}
	return out
}

// POST /send-reminders — email a pending-balance reminder to every patient with
// an outstanding (ISSUED/PARTIAL) invoice that has a registered email.
func (h *Handler) sendReminders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)

	pending, err := h.svc.ListPending(ctx, claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudieron cargar las facturas pendientes")
		return
	}

	emailByPatient := map[string]string{}
	nameByPatient := map[string]string{}
	sent, skipped := 0, 0
	for _, inv := range pending {
		email, ok := emailByPatient[inv.PatientID]
		if !ok {
			if p, err := h.patients.Get(ctx, claims.OrganizationID, inv.PatientID); err == nil {
				email = p.Email
				nameByPatient[inv.PatientID] = joinNonEmpty(p.FirstName, p.MiddleName, p.PaternalLastName, p.MaternalLastName)
			}
			emailByPatient[inv.PatientID] = email
		}
		if email == "" {
			skipped++
			continue
		}
		balance := balanceStr(inv)
		due := ""
		if inv.DueAt != nil {
			due = inv.DueAt.In(colombia).Format("2006-01-02")
		}
		if err := h.notifier.PaymentReminder(ctx, email, notify.PaymentReminderDetails{
			OrgID:         claims.OrganizationID,
			PatientName:   nameByPatient[inv.PatientID],
			InvoiceNumber: invoiceLabel(inv),
			Balance:       formatMoney(balance, inv.Currency),
			DueDate:       due,
		}); err != nil {
			skipped++
			continue
		}
		sent++
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]int{"sent": sent, "skipped": skipped, "pending": len(pending)})
}

// balanceStr is the outstanding balance of an invoice as a decimal string.
func balanceStr(inv Invoice) string {
	v := cents(inv.TotalDue) - cents(inv.TotalPaid)
	if v < 0 {
		v = 0
	}
	return itoaCents(v)
}

func (h *Handler) recordPayment(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var body struct {
		Amount        string `json:"amount"`
		PaymentMethod string `json:"payment_method"`
		Reference     string `json:"reference"`
		Notes         string `json:"notes"`
		PaidAt        string `json:"paid_at"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	paidAt, ok := parseTime(body.PaidAt)
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "fecha de pago inválida")
		return
	}
	inv, err := h.svc.RecordPayment(r.Context(), claims.OrganizationID, claims.UserID, chi.URLParam(r, "invoice_id"), PaymentInput{
		Amount: body.Amount, PaymentMethod: body.PaymentMethod, Reference: body.Reference,
		Notes: body.Notes, PaidAt: paidAt,
	})
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, inv)
}
