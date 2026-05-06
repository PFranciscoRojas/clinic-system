package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/patients"
	patientsdto "sghcp/core-api/internal/patients/dto"
	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/patients/{id}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	p, err := h.svc.Get(r.Context(), claims.OrganizationID, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, patientsdto.ToResponse(p))
}

// GET /api/v1/patients                      → paginated list (all active)
// GET /api/v1/patients?last_name=García     → search by exact paternal last name
// GET /api/v1/patients?document=1234567890  → search by exact document number
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	lastName := q.Get("last_name")
	document := q.Get("document")

	var (
		list []*patients.Patient
		err  error
	)

	if lastName == "" && document == "" {
		list, err = h.svc.List(r.Context(), patientssvc.ListInput{
			OrganizationID: claims.OrganizationID,
			Limit:          limit,
			Offset:         offset,
		})
	} else {
		list, err = h.svc.Search(r.Context(), patientssvc.SearchInput{
			OrganizationID:   claims.OrganizationID,
			PaternalLastName: lastName,
			DocumentNumber:   document,
			Limit:            limit,
			Offset:           offset,
		})
	}

	if err != nil {
		writeErr(w, err)
		return
	}

	resp := make([]patientsdto.PatientResponse, 0, len(list))
	for _, p := range list {
		resp = append(resp, patientsdto.ToResponse(p))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"patients": resp})
}
