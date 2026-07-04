package notifications

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

const (
	defaultListLimit = 20
	maxListLimit     = 50
)

// Routes mounts the authenticated notification-inbox endpoints. Every route
// resolves the recipient from the JWT claims, so a user only ever sees or
// mutates their own notifications.
func (s *Service) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", s.handleList)
	r.Get("/unread-count", s.handleUnreadCount)
	r.Post("/{id}/read", s.handleMarkRead)
	r.Post("/read-all", s.handleMarkAllRead)
	return r
}

// GET /api/v1/notifications?limit=20
func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	limit := defaultListLimit
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}
	items, err := s.list(r.Context(), claims.UserID, limit)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not load notifications")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/notifications/unread-count
func (s *Service) handleUnreadCount(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	n, err := s.unreadCount(r.Context(), claims.UserID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not load unread count")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]int{"unread": n})
}

// POST /api/v1/notifications/{id}/read
func (s *Service) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	id := chi.URLParam(r, "id")
	if err := s.markRead(r.Context(), claims.UserID, id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not update notification")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/notifications/read-all
func (s *Service) handleMarkAllRead(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if err := s.markAllRead(r.Context(), claims.UserID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not update notifications")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
