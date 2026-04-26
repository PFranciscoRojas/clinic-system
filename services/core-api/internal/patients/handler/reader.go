package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/patients"
	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/patients/{id}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "id")

	p, err := h.svc.Get(r.Context(), claims.OrganizationID, patientID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, toResponse(p))
}

// GET /api/v1/patients?last_name=Garcia&limit=20&offset=0
// GET /api/v1/patients?document=1234567890
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	in := patientssvc.SearchInput{
		OrganizationID:   claims.OrganizationID,
		PaternalLastName: q.Get("last_name"),
		DocumentNumber:   q.Get("document"),
		Limit:            limit,
		Offset:           offset,
	}

	results, err := h.svc.Search(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}

	resp := make([]patientResponse, 0, len(results))
	for _, p := range results {
		resp = append(resp, toResponse(p))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"patients": resp})
}

type patientResponse struct {
	ID               string `json:"id"`
	DocumentTypeCode string `json:"document_type_code"`
	FirstName        string `json:"first_name"`
	MiddleName       string `json:"middle_name,omitempty"`
	PaternalLastName string `json:"paternal_last_name"`
	MaternalLastName string `json:"maternal_last_name,omitempty"`
	DocumentNumber   string `json:"document_number"`
	Phone            string `json:"phone,omitempty"`
	Email            string `json:"email,omitempty"`
	Address          string `json:"address,omitempty"`
	BirthDate        string `json:"birth_date"`
	Gender           string `json:"gender,omitempty"`
	IsActive         bool   `json:"is_active"`
}

func toResponse(p *patients.Patient) patientResponse {
	return patientResponse{
		ID:               p.ID,
		DocumentTypeCode: p.DocumentTypeCode,
		FirstName:        p.FirstName,
		MiddleName:       p.MiddleName,
		PaternalLastName: p.PaternalLastName,
		MaternalLastName: p.MaternalLastName,
		DocumentNumber:   p.DocumentNumber,
		Phone:            p.Phone,
		Email:            p.Email,
		Address:          p.Address,
		BirthDate:        p.BirthDate.Format("2006-01-02"),
		Gender:           p.Gender,
		IsActive:         p.IsActive,
	}
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, patients.ErrNotFound):
		httputil.WriteError(w, http.StatusNotFound, "patient not found")
	case errors.Is(err, patients.ErrForbidden):
		httputil.WriteError(w, http.StatusForbidden, "access denied")
	case errors.Is(err, patients.ErrInvalidInput):
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid input")
	default:
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
	}
}
