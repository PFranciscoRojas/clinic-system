package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// PatientRoutes returns routes nested under /api/v1/patients/{patient_id}/treatment-plans.
// Permission codes are the ones seeded by migration 000001.
func (h *Handler) PatientRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("treatment_plans:create")).Post("/", h.createPlan)
	r.With(middleware.RequirePermission("treatment_plans:read")).Get("/", h.listPlans)
	return r
}

// Routes returns routes for /api/v1/treatment-plans/{id}.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("treatment_plans:read")).Get("/{id}", h.getPlan)
	r.With(middleware.RequirePermission("treatment_plans:update")).Patch("/{id}", h.updatePlan)
	r.With(middleware.RequirePermission("treatment_plans:update")).Post("/{id}/goals", h.addGoal)
	r.With(middleware.RequirePermission("treatment_plans:update")).Patch("/{id}/goals/{goal_id}", h.updateGoal)
	r.With(middleware.RequirePermission("treatment_plans:update")).Delete("/{id}/goals/{goal_id}", h.deleteGoal)
	return r
}
