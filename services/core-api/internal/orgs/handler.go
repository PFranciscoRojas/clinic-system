package orgs

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// Handler exposes org-level configuration the admin manages from Settings.
type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

// Routes mounts under /api/v1/org (JWT required by the parent group).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("organization:configure")).Get("/notifications", h.getNotifications)
	r.With(middleware.RequirePermission("organization:configure")).Put("/notifications", h.putNotifications)
	return r
}

func (h *Handler) getNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	s, err := h.repo.GetNotifications(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo leer la configuración")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) putNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var s NotificationSettings
	if err := httputil.DecodeJSON(r, &s); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.repo.SetNotifications(r.Context(), claims.OrganizationID, s); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo guardar")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}
