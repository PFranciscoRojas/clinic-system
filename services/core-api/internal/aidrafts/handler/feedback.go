package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// recordFeedback computes and persists the edit metrics for an approved draft.
// Best-effort: the clinical record already exists, so a feedback failure must
// never surface to the professional.
func (h *Handler) recordFeedback(ctx context.Context, fb aidrafts.DraftFeedback) {
	if err := h.svc.SaveFeedback(ctx, fb); err != nil {
		slog.Error("save draft_feedback", "draft_id", fb.DraftID, "err", err)
	}
}

// GET /api/v1/ai-drafts/feedback/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
// Tenant-scoped aggregates of how much professionals edit AI drafts.
func (h *Handler) feedbackStats(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var rng aidrafts.StatsRange
	if v := r.URL.Query().Get("from"); v != "" {
		d, err := time.Parse("2006-01-02", v)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "from must be YYYY-MM-DD")
			return
		}
		rng.From = d
	}
	if v := r.URL.Query().Get("to"); v != "" {
		d, err := time.Parse("2006-01-02", v)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "to must be YYYY-MM-DD")
			return
		}
		rng.To = d.Add(24 * time.Hour) // inclusive end date
	}

	stats, err := h.svc.FeedbackStats(r.Context(), claims.OrganizationID, rng)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error al calcular estadísticas de borradores IA")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, stats)
}
