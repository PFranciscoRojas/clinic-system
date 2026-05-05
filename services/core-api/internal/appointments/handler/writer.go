package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	apptsdto "sghcp/core-api/internal/appointments/dto"
	apptssvc "sghcp/core-api/internal/appointments/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// POST /api/v1/appointments
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body apptsdto.CreateRequest
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	scheduledAt, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "scheduled_at must be RFC3339")
		return
	}

	id, err := h.svc.Create(r.Context(), apptssvc.CreateInput{
		OrganizationID: claims.OrganizationID,
		PatientID:      body.PatientID,
		StaffID:        body.StaffID,
		ScheduledAt:    scheduledAt,
		DurationMin:    body.DurationMin,
		Modality:       body.Modality,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DELETE /api/v1/appointments/{id}
func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	appointmentID := chi.URLParam(r, "id")

	var body apptsdto.CancelRequest
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := h.svc.Cancel(r.Context(), apptssvc.CancelInput{
		OrganizationID: claims.OrganizationID,
		AppointmentID:  appointmentID,
		RequestedBy:    claims.UserID,
		Reason:         body.Reason,
	}); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
