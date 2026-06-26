package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/treatmentplans"
	tprepo "sghcp/core-api/internal/treatmentplans/repository"
	tpsvc "sghcp/core-api/internal/treatmentplans/service"
)

type Handler struct {
	svc   *tpsvc.Service
	db    *pgxpool.Pool
	audit *audit.Writer
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	return &Handler{svc: tpsvc.New(tprepo.New(db), km), db: db, audit: audit.New(db)}
}

var planErrors = httputil.ErrorMapper(func(err error) (int, string) {
	switch {
	case errors.Is(err, treatmentplans.ErrNotFound):
		return http.StatusNotFound, "treatment plan not found"
	case errors.Is(err, treatmentplans.ErrGoalNotFound):
		return http.StatusNotFound, "treatment goal not found"
	case errors.Is(err, treatmentplans.ErrActiveExists):
		return http.StatusConflict, "patient already has an active treatment plan"
	case errors.Is(err, treatmentplans.ErrInvalidInput):
		return http.StatusUnprocessableEntity, "invalid input"
	case errors.Is(err, treatmentplans.ErrInvalidStatus):
		return http.StatusUnprocessableEntity, "invalid status"
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, planErrors)
}

// parseDate parses a YYYY-MM-DD string; empty string yields nil.
func parseDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, treatmentplans.ErrInvalidInput
	}
	return &t, nil
}

func fmtDate(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.Format("2006-01-02")
}

func planResponse(p *treatmentplans.Plan) map[string]any {
	goals := make([]map[string]any, 0, len(p.Goals))
	for _, g := range p.Goals {
		goals = append(goals, map[string]any{
			"id":             g.ID,
			"description":    g.Description,
			"progress_notes": g.ProgressNotes,
			"status":         g.Status,
			"target_date":    fmtDate(g.TargetDate),
			"sort_order":     g.SortOrder,
			"created_at":     g.CreatedAt,
			"updated_at":     g.UpdatedAt,
		})
	}
	return map[string]any{
		"id":         p.ID,
		"patient_id": p.PatientID,
		"staff_id":   p.StaffID,
		"status":     p.Status,
		"title":      p.Title,
		"start_date": p.StartDate.Format("2006-01-02"),
		"end_date":   fmtDate(p.EndDate),
		"goals":      goals,
		"created_at": p.CreatedAt,
		"updated_at": p.UpdatedAt,
	}
}
