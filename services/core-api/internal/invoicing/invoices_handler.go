package invoicing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

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
	r.With(middleware.RequirePermission("billing:read")).Get("/", h.listInvoices)
	r.With(middleware.RequirePermission("billing:read")).Get("/{invoice_id}", h.getInvoice)
	r.With(middleware.RequirePermission("billing:read")).Get("/{invoice_id}/receipt", h.receipt)
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
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	q := r.URL.Query()
	invoices, err := h.svc.ListInvoices(ctx, claims.OrganizationID, q.Get("patient_id"), q.Get("status"))
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

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	ov, err := h.svc.Overview(r.Context(), claims.OrganizationID)
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

// GET /{invoice_id}/receipt — a printable payment receipt PDF (comprobante de
// pago, not a DIAN electronic invoice).
func (h *Handler) receipt(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	invoiceID := chi.URLParam(r, "invoice_id")

	inv, err := h.svc.GetInvoice(ctx, claims.OrganizationID, invoiceID)
	if err != nil {
		h.writeErr(w, err)
		return
	}

	name, doc := "", ""
	if p, err := h.patients.Get(ctx, claims.OrganizationID, inv.PatientID); err == nil {
		name = joinNonEmpty(p.FirstName, p.MiddleName, p.PaternalLastName, p.MaternalLastName)
		doc = p.DocumentNumber
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="comprobante-%s.pdf"`, shortID(inv.ID)))

	if err := RenderReceipt(w, ReceiptData{
		Org:         h.orgLetterhead(ctx, claims.OrganizationID),
		PatientName: name,
		PatientDoc:  doc,
		Invoice:     inv,
		GeneratedAt: time.Now(),
	}); err != nil {
		// Headers already sent — nothing useful to return.
		return
	}
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
