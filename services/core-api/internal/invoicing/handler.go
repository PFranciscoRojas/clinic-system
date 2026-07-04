package invoicing

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/patients"
	patsrepo "sghcp/core-api/internal/patients/repository"
	patssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// patientGetter resolves a patient's decrypted identity for the receipt header.
type patientGetter interface {
	Get(ctx context.Context, orgID, patientID string) (*patients.Patient, error)
}

type Handler struct {
	svc      *Service
	patients patientGetter
	notifier notify.Notifier
	pool     *pgxpool.Pool
}

func New(db *pgxpool.Pool, km *crypto.KeyManager, notifier notify.Notifier) *Handler {
	return &Handler{
		svc:      NewService(NewRepository(db), km),
		patients: patssvc.New(patsrepo.New(db), km),
		notifier: notifier,
		pool:     db,
	}
}

// RateRoutes is mounted at /api/v1/service-rates (JWT + tenant scope applied by
// the parent group). Reading a rate needs billing:read (any clinical role);
// managing the catalogue needs billing:manage_rates (CLINIC_ADMIN).
func (h *Handler) RateRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("billing:read")).Get("/", h.list)
	r.With(middleware.RequirePermission("billing:manage_rates")).Post("/", h.create)
	r.With(middleware.RequirePermission("billing:manage_rates")).Put("/{rate_id}", h.update)
	r.With(middleware.RequirePermission("billing:manage_rates")).Patch("/{rate_id}/active", h.setActive)
	return r
}

type rateBody struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Amount      string  `json:"amount"`
	Currency    string  `json:"currency"`
	Modality    *string `json:"modality"`
	StaffID     *string `json:"staff_id"` // null/absent = org-wide rate
}

func (b rateBody) toInput() RateInput {
	return RateInput(b)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	includeInactive := r.URL.Query().Get("include_inactive") == "true"
	rates, err := h.svc.List(r.Context(), claims.OrganizationID, includeInactive)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudieron cargar las tarifas")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, rates)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var body rateBody
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	rate, err := h.svc.Create(r.Context(), claims.OrganizationID, body.toInput())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, rate)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "rate_id")
	var body rateBody
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	rate, err := h.svc.Update(r.Context(), claims.OrganizationID, id, body.toInput())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, rate)
}

func (h *Handler) setActive(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "rate_id")
	var body struct {
		Active bool `json:"active"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	rate, err := h.svc.SetActive(r.Context(), claims.OrganizationID, id, body.Active)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, rate)
}

func (h *Handler) writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httputil.WriteError(w, http.StatusNotFound, "recurso no encontrado")
	case errors.Is(err, ErrNotPayable):
		httputil.WriteError(w, http.StatusConflict, "la factura no admite esta operación en su estado actual")
	case errors.Is(err, ErrNotDraft):
		httputil.WriteError(w, http.StatusConflict, "la factura ya no es un borrador")
	case errors.Is(err, ErrInvalidInput):
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
	default:
		httputil.WriteError(w, http.StatusInternalServerError, "error")
	}
}
