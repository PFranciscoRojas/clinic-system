package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

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
// GET /api/v1/patients?q=mari perez         → name search: any name word,
//	accent-insensitive, matches while typing (prefix). last_name= behaves
//	the same (kept for compatibility).
// GET /api/v1/patients?document=1234567890  → search by exact document number
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	query := q.Get("q")
	lastName := q.Get("last_name")
	document := q.Get("document")

	var (
		list []*patients.Patient
		err  error
	)

	if query == "" && lastName == "" && document == "" {
		list, err = h.svc.List(r.Context(), patientssvc.ListInput{
			OrganizationID: claims.OrganizationID,
			Limit:          limit,
			Offset:         offset,
		})
	} else {
		list, err = h.svc.Search(r.Context(), patientssvc.SearchInput{
			OrganizationID:   claims.OrganizationID,
			Query:            query,
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

// GET /api/v1/patients/export.csv — streams a UTF-8 CSV of all active patients.
func (h *Handler) exportCSV(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	data, err := h.svc.ExportCSV(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo generar el CSV")
		return
	}
	filename := fmt.Sprintf("pacientes-%s.csv", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
