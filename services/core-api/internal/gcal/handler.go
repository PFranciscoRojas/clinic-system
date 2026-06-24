package gcal

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// Routes returns the chi router for Google Calendar integration endpoints.
// connect/status/disconnect require JWT; callback is public (Google redirects here).
func (s *Syncer) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/status", s.getStatus)
	r.Get("/connect", s.getConnectURL)
	r.Delete("/", s.disconnect)
	return r
}

// PublicRoutes returns the public callback route (no JWT).
func (s *Syncer) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/callback", s.callback)
	return r
}

// GET /api/v1/me/google/status
func (s *Syncer) getStatus(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	conn, ok := s.GetConnection(r.Context(), claims.UserID)
	writeJSON(w, http.StatusOK, map[string]any{
		"connected":    ok,
		"google_email": conn.GoogleEmail,
		"calendar_id":  conn.CalendarID,
	})
}

// GET /api/v1/me/google/connect → returns { auth_url }
func (s *Syncer) getConnectURL(w http.ResponseWriter, r *http.Request) {
	if !s.Enabled() {
		http.Error(w, "Google Calendar not configured", http.StatusServiceUnavailable)
		return
	}
	claims := middleware.ClaimsFromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{
		"auth_url": s.AuthURL(claims.UserID),
	})
}

// GET /api/v1/integrations/google/callback  (public — Google redirects here)
func (s *Syncer) callback(w http.ResponseWriter, r *http.Request) {
	settingsURL := strings.TrimRight(s.appURL, "/") + "/settings"

	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		http.Redirect(w, r, settingsURL+"?google=error", http.StatusFound)
		return
	}

	_, err := s.ExchangeCallback(r.Context(), state, code)
	if err != nil {
		slog.Default().Warn("gcal: callback exchange failed", "err", err)
		http.Redirect(w, r, settingsURL+"?google=error", http.StatusFound)
		return
	}

	http.Redirect(w, r, settingsURL+"?google=connected", http.StatusFound)
}

// DELETE /api/v1/me/google
func (s *Syncer) disconnect(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if err := s.DeleteConnection(r.Context(), claims.UserID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func decodeJSON(r io.Reader, v any) error {
	return json.NewDecoder(r).Decode(v)
}
