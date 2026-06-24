package gcal

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/shared/middleware"
)

// Routes returns the chi router for Google Calendar integration endpoints.
// connect/status/disconnect require JWT; callback is public (Google redirects here).
func (s *Syncer) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/status", s.getStatus)
	r.Get("/connect", s.getConnectURL)
	r.Post("/sync", s.syncExisting)
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

// POST /api/v1/me/google/sync — pushes all existing SCHEDULED appointments that
// haven't been synced yet to the professional's Google Calendar. Returns 202
// immediately and runs the sync in the background.
func (s *Syncer) syncExisting(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	type apptRow struct {
		id       string
		modality string
		at       time.Time
		dur      int
	}

	rows, err := dbctx.From(r.Context(), s.pool).Query(r.Context(), `
		SELECT a.id, a.modality, a.scheduled_at, a.duration_min
		FROM appointments a
		WHERE a.staff_id = $1
		  AND a.status = 'SCHEDULED'
		  AND NOT EXISTS (
		      SELECT 1 FROM appointment_gcal_events e WHERE e.appointment_id = a.id
		  )
	`, claims.UserID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	var pending []apptRow
	for rows.Next() {
		var a apptRow
		if err := rows.Scan(&a.id, &a.modality, &a.at, &a.dur); err == nil {
			pending = append(pending, a)
		}
	}
	rows.Close()

	staffID := claims.UserID
	go func() {
		for _, a := range pending {
			s.PushCreate(context.Background(), a.id, staffID, a.modality, a.at, a.dur)
		}
		s.logger.Info("gcal: backfill queued", "staff_id", staffID, "count", len(pending))
	}()

	writeJSON(w, http.StatusAccepted, map[string]any{
		"queued": len(pending),
	})
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
