package invoicing

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// InvoiceRoutes is mounted at /api/v1/invoices (JWT + tenant scope by the parent
// group). Reading needs billing:read; creating/issuing/cancelling needs
// billing:create; recording a payment needs billing:record_payment.
func (h *Handler) InvoiceRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("billing:read")).Get("/", h.listInvoices)
	r.With(middleware.RequirePermission("billing:read")).Get("/{invoice_id}", h.getInvoice)
	r.With(middleware.RequirePermission("billing:create")).Post("/", h.createInvoice)
	r.With(middleware.RequirePermission("billing:create")).Post("/{invoice_id}/issue", h.issueInvoice)
	r.With(middleware.RequirePermission("billing:create")).Post("/{invoice_id}/cancel", h.cancelInvoice)
	r.With(middleware.RequirePermission("billing:record_payment")).Post("/{invoice_id}/payments", h.recordPayment)
	return r
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

func (h *Handler) listInvoices(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()
	invoices, err := h.svc.ListInvoices(r.Context(), claims.OrganizationID, q.Get("patient_id"), q.Get("status"))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudieron cargar las facturas")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, invoices)
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
