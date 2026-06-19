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
// brand color) so the booking page can theme itself per tenant.
func (h *Handler) InfoRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.info)
	return r
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

// GET /availability?org_slug=&from=&to=  (modality is accepted but not yet
// differentiated — same hours apply to both for now).
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
	days, err := h.svc.Availability(r.Context(), slug, modality, from, to)
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
