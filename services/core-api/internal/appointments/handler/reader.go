package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/appointments"
	apptsdto "sghcp/core-api/internal/appointments/dto"
	apptssvc "sghcp/core-api/internal/appointments/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/appointments/pending-notes — the caller's own COMPLETED
// sessions (last 30 days) that still have no finalized clinical record.
func (h *Handler) pendingNotes(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	items, err := h.svc.PendingNotes(r.Context(), claims.OrganizationID, claims.UserID)
	if err != nil {
		writeErr(w, err)
		return
	}
	if items == nil {
		items = []appointments.PendingNote{}
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/appointments/{id}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	a, err := h.svc.Get(r.Context(), claims.OrganizationID, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, apptsdto.ToResponse(a))
}

// GET /api/v1/appointments?patient_id=&staff_id=&status=&date_from=&date_to=&limit=&offset=
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	in := apptssvc.ListInput{
		OrganizationID: claims.OrganizationID,
		PatientID:      q.Get("patient_id"),
		StaffID:        q.Get("staff_id"),
		Status:         q.Get("status"),
		Limit:          limit,
		Offset:         offset,
	}

	if df := q.Get("date_from"); df != "" {
		t, err := time.Parse(time.RFC3339, df)
		if err != nil {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "date_from must be RFC3339")
			return
		}
		in.DateFrom = t
	}
	if dt := q.Get("date_to"); dt != "" {
		t, err := time.Parse(time.RFC3339, dt)
		if err != nil {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "date_to must be RFC3339")
			return
		}
		in.DateTo = t
	}

	results, err := h.svc.List(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}

	resp := make([]apptsdto.AppointmentResponse, 0, len(results))
	for _, a := range results {
		resp = append(resp, apptsdto.ToResponse(a))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"appointments": resp})
}
