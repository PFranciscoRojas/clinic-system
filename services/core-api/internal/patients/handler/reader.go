package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

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

// GET /api/v1/patients?last_name=Garcia&limit=20&offset=0
// GET /api/v1/patients?document=1234567890
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	results, err := h.svc.Search(r.Context(), patientssvc.SearchInput{
		OrganizationID:   claims.OrganizationID,
		PaternalLastName: q.Get("last_name"),
		DocumentNumber:   q.Get("document"),
		Limit:            limit,
		Offset:           offset,
	})
	if err != nil {
		writeErr(w, err)
		return
	}

	resp := make([]patientsdto.PatientResponse, 0, len(results))
	for _, p := range results {
		resp = append(resp, patientsdto.ToResponse(p))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"patients": resp})
}
