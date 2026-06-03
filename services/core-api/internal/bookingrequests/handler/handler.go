package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/bookingrequests"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	svc *bookingrequests.Service
}

func New(pool *pgxpool.Pool) *Handler {
	return &Handler{svc: bookingrequests.NewService(pool)}
}

// PublicRoutes — no JWT required. Mounted at /api/v1/public/booking
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	return r
}

// Routes — JWT required. Mounted at /api/v1/booking-requests
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("appointments:read")).Get("/", h.list)
	r.With(middleware.RequirePermission("appointments:read")).Get("/count", h.count)
	r.With(middleware.RequirePermission("appointments:update")).Post("/{id}/confirm", h.confirm)
	r.With(middleware.RequirePermission("appointments:update")).Post("/{id}/reject", h.reject)
	return r
}

// ── Public: create booking request ───────────────────────────────────────────

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OrgSlug       string  `json:"org_slug"`
		FirstName     string  `json:"first_name"`
		LastName      string  `json:"last_name"`
		Email         string  `json:"email"`
		Phone         string  `json:"phone"`
		Modality      string  `json:"modality"`
		PreferredDate *string `json:"preferred_date"`
		PreferredTime *string `json:"preferred_time"`
		Notes         *string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	orgID, err := h.svc.OrgIDBySlug(r.Context(), body.OrgSlug)
	if err != nil {
		if errors.Is(err, bookingrequests.ErrOrgNotFound) {
			http.Error(w, "organization not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	modality := body.Modality
	if modality != "IN_PERSON" && modality != "VIRTUAL" {
		modality = "IN_PERSON"
	}

	br, err := h.svc.Create(r.Context(), bookingrequests.CreateInput{
		OrganizationID: orgID,
		FirstName:      body.FirstName,
		LastName:       body.LastName,
		Email:          body.Email,
		Phone:          body.Phone,
		Modality:       modality,
		PreferredDate:  body.PreferredDate,
		PreferredTime:  body.PreferredTime,
		Notes:          body.Notes,
	})
	if errors.Is(err, bookingrequests.ErrInvalidInput) {
		http.Error(w, "nombre, apellido y correo son requeridos", http.StatusUnprocessableEntity)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": br.ID})
}

// ── Private: list ─────────────────────────────────────────────────────────────

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	statusStr := r.URL.Query().Get("status")

	var statusFilter *bookingrequests.Status
	if statusStr != "" {
		s := bookingrequests.Status(statusStr)
		statusFilter = &s
	}

	items, err := h.svc.List(r.Context(), claims.OrganizationID, statusFilter)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []*bookingrequests.BookingRequest{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"items": items})
}

func (h *Handler) count(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	n, err := h.svc.PendingCount(r.Context(), claims.OrganizationID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"count": n})
}

// ── Private: confirm / reject ─────────────────────────────────────────────────

func (h *Handler) confirm(w http.ResponseWriter, r *http.Request) {
	h.resolve(w, r, bookingrequests.StatusConfirmed)
}

func (h *Handler) reject(w http.ResponseWriter, r *http.Request) {
	h.resolve(w, r, bookingrequests.StatusRejected)
}

func (h *Handler) resolve(w http.ResponseWriter, r *http.Request, status bookingrequests.Status) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var body struct {
		StaffNote *string `json:"staff_note"`
	}
	json.NewDecoder(r.Body).Decode(&body) //nolint:errcheck — body is optional

	err := h.svc.Resolve(r.Context(), bookingrequests.ResolveInput{
		ID:             id,
		OrganizationID: claims.OrganizationID,
		Status:         status,
		StaffNote:      body.StaffNote,
		ResolvedBy:     claims.UserID,
	})
	if errors.Is(err, bookingrequests.ErrNotFound) {
		http.Error(w, "not found or already resolved", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
