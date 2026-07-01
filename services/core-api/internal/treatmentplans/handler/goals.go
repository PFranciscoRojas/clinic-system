package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
	"sghcp/core-api/internal/treatmentplans"
	tpsvc "sghcp/core-api/internal/treatmentplans/service"
)

// POST /api/v1/treatment-plans/{id}/goals
func (h *Handler) addGoal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	planID := chi.URLParam(r, "id")

	var body struct {
		Description string `json:"description"`
		TargetDate  string `json:"target_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	target, err := parseDate(body.TargetDate)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid target_date (YYYY-MM-DD)")
		return
	}

	goalID, err := h.svc.AddGoal(r.Context(), tpsvc.AddGoalInput{
		OrganizationID: claims.OrganizationID,
		PlanID:         planID,
		Description:    body.Description,
		TargetDate:     target,
	})
	if err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "TREATMENT_GOAL_ADD", "treatment_goal", goalID)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": goalID})
}

// DELETE /api/v1/treatment-plans/{id}/goals/{goal_id}
func (h *Handler) deleteGoal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	planID := chi.URLParam(r, "id")
	goalID := chi.URLParam(r, "goal_id")

	if err := h.svc.DeleteGoal(r.Context(), claims.OrganizationID, planID, goalID); err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "TREATMENT_GOAL_DELETE", "treatment_goal", goalID)
	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/v1/treatment-plans/{id}/goals/{goal_id}
func (h *Handler) updateGoal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	planID := chi.URLParam(r, "id")
	goalID := chi.URLParam(r, "goal_id")

	var body struct {
		Description   *string `json:"description"`
		ProgressNotes *string `json:"progress_notes"`
		Status        *string `json:"status"`
		TargetDate    *string `json:"target_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	in := tpsvc.UpdateGoalInput{
		OrganizationID: claims.OrganizationID,
		PlanID:         planID,
		GoalID:         goalID,
		Description:    body.Description,
		ProgressNotes:  body.ProgressNotes,
	}
	if body.Status != nil {
		st := treatmentplans.GoalStatus(*body.Status)
		in.Status = &st
	}
	if body.TargetDate != nil {
		target, err := parseDate(*body.TargetDate)
		if err != nil {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid target_date (YYYY-MM-DD)")
			return
		}
		in.TargetDate = target
	}

	if err := h.svc.UpdateGoal(r.Context(), in); err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "TREATMENT_GOAL_UPDATE", "treatment_goal", goalID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"updated_at": time.Now().Format(time.RFC3339)})
}
