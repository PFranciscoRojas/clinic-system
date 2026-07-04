package availability

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	svc *Service
}

func NewHandler(pool *pgxpool.Pool) *Handler {
	return &Handler{svc: NewService(New(pool))}
}

// PublicRoutes is mounted at /api/v1/public/availability — no JWT.
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.availability)
	return r
}

// InfoRoutes is mounted at /api/v1/public/org — public clinic info (name,
// brand color, professional list) so the booking page can theme itself per
// tenant and offer a professional picker in multi-professional clinics.
func (h *Handler) InfoRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.info)
	r.Get("/professionals", h.professionals)
	return r
}

// GET /professionals?org_slug= — the org's active professionals (id + name
// only). The booking wizard shows a picker when there's more than one.
func (h *Handler) professionals(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("org_slug")
	if slug == "" {
		httputil.WriteError(w, http.StatusBadRequest, "org_slug is required")
		return
	}
	items, err := h.svc.Professionals(r.Context(), slug)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	if items == nil {
		items = []PublicProfessional{}
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"professionals": items})
}

func (h *Handler) info(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("org_slug")
	if slug == "" {
		httputil.WriteError(w, http.StatusBadRequest, "org_slug is required")
		return
	}
	info, err := h.svc.Info(r.Context(), slug)
	if errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "organización no encontrada")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, info)
}

// GET /availability?org_slug=&staff_id=&from=&to=  (modality is accepted but
// not yet differentiated — same hours apply to both for now). staff_id picks a
// professional in multi-professional orgs; empty falls back to the first one.
func (h *Handler) availability(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	slug := q.Get("org_slug")
	if slug == "" {
		httputil.WriteError(w, http.StatusBadRequest, "org_slug is required")
		return
	}
	from := q.Get("from")
	to := q.Get("to")
	now := time.Now().In(bogota)
	if from == "" {
		from = now.Format("2006-01-02")
	}
	if to == "" {
		to = now.AddDate(0, 0, 14).Format("2006-01-02")
	}

	modality := q.Get("modality")
	days, err := h.svc.Availability(r.Context(), slug, q.Get("staff_id"), modality, from, to)
	if errors.Is(err, ErrNotFound) {
		httputil.WriteError(w, http.StatusNotFound, "organización no encontrada")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "parámetros inválidos")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"days": days})
}

// PrivateRoutes is mounted at /api/v1/me/availability — valid JWT required.
// Returns the authenticated professional's free slots using the same schedule
// and busy-window logic as the public booking endpoint.
func (h *Handler) PrivateRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.privateAvailability)
	return r
}

func (h *Handler) privateAvailability(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()
	from := q.Get("from")
	to := q.Get("to")
	now := time.Now().In(bogota)
	if from == "" {
		from = now.Format("2006-01-02")
	}
	if to == "" {
		to = now.AddDate(0, 0, 30).Format("2006-01-02")
	}
	modality := q.Get("modality")

	days, err := h.svc.AvailabilityForStaff(r.Context(), claims.OrganizationID, claims.UserID, modality, from, to)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "parámetros inválidos")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"days": days})
}
