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

// POST /api/v1/patients/{patient_id}/treatment-plans
func (h *Handler) createPlan(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	var body struct {
		Title     string `json:"title"`
		StartDate string `json:"start_date"`
		Goals     []struct {
			Description string `json:"description"`
			TargetDate  string `json:"target_date"`
		} `json:"goals"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	startDate, err := parseDate(body.StartDate)
	if err != nil || startDate == nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "start_date is required (YYYY-MM-DD)")
		return
	}

	in := tpsvc.CreatePlanInput{
		OrganizationID: claims.OrganizationID,
		PatientID:      patientID,
		StaffID:        claims.UserID,
		Title:          body.Title,
		StartDate:      *startDate,
	}
	for _, g := range body.Goals {
		target, err := parseDate(g.TargetDate)
		if err != nil {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid goal target_date (YYYY-MM-DD)")
			return
		}
		in.Goals = append(in.Goals, tpsvc.GoalInput{Description: g.Description, TargetDate: target})
	}

	planID, err := h.svc.CreatePlan(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "TREATMENT_PLAN_CREATE", "treatment_plan", planID)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": planID})
}

// GET /api/v1/patients/{patient_id}/treatment-plans
func (h *Handler) listPlans(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	plans, err := h.svc.ListByPatient(r.Context(), claims.OrganizationID, patientID)
	if err != nil {
		writeErr(w, err)
		return
	}

	items := make([]map[string]any, 0, len(plans))
	for _, p := range plans {
		items = append(items, planResponse(p))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/treatment-plans/{id}
func (h *Handler) getPlan(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	planID := chi.URLParam(r, "id")

	plan, err := h.svc.GetPlan(r.Context(), claims.OrganizationID, planID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, planResponse(plan))
}

// PATCH /api/v1/treatment-plans/{id}
func (h *Handler) updatePlan(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	planID := chi.URLParam(r, "id")

	var body struct {
		Title  *string `json:"title"`
		Status *string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	in := tpsvc.UpdatePlanInput{
		OrganizationID: claims.OrganizationID,
		PlanID:         planID,
		Title:          body.Title,
	}
	if body.Status != nil {
		st := treatmentplans.PlanStatus(*body.Status)
		in.Status = &st
	}

	if err := h.svc.UpdatePlan(r.Context(), in); err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "TREATMENT_PLAN_UPDATE", "treatment_plan", planID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"updated_at": time.Now().Format(time.RFC3339)})
}
