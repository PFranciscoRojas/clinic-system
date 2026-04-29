package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// POST /api/v1/patients
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		DocumentTypeCode string `json:"document_type_code"`
		FirstName        string `json:"first_name"`
		MiddleName       string `json:"middle_name"`
		PaternalLastName string `json:"paternal_last_name"`
		MaternalLastName string `json:"maternal_last_name"`
		DocumentNumber   string `json:"document_number"`
		Phone            string `json:"phone"`
		Email            string `json:"email"`
		Address          string `json:"address"`
		BirthDate        string `json:"birth_date"` // "2006-01-02"
		Gender           string `json:"gender"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	birthDate, err := time.Parse("2006-01-02", body.BirthDate)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "birth_date must be YYYY-MM-DD")
		return
	}

	id, err := h.svc.Create(r.Context(), patientssvc.CreateInput{
		OrganizationID:   claims.OrganizationID,
		DocumentTypeCode: body.DocumentTypeCode,
		FirstName:        body.FirstName,
		MiddleName:       body.MiddleName,
		PaternalLastName: body.PaternalLastName,
		MaternalLastName: body.MaternalLastName,
		DocumentNumber:   body.DocumentNumber,
		Phone:            body.Phone,
		Email:            body.Email,
		Address:          body.Address,
		BirthDate:        birthDate,
		Gender:           body.Gender,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// PUT /api/v1/patients/{id}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "id")

	var body struct {
		FirstName        string `json:"first_name"`
		MiddleName       string `json:"middle_name"`
		PaternalLastName string `json:"paternal_last_name"`
		MaternalLastName string `json:"maternal_last_name"`
		Phone            string `json:"phone"`
		Email            string `json:"email"`
		Address          string `json:"address"`
		BirthDate        string `json:"birth_date"`
		Gender           string `json:"gender"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	birthDate, err := time.Parse("2006-01-02", body.BirthDate)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "birth_date must be YYYY-MM-DD")
		return
	}

	if err := h.svc.Update(r.Context(), patientssvc.UpdateInput{
		OrganizationID:   claims.OrganizationID,
		PatientID:        patientID,
		FirstName:        body.FirstName,
		MiddleName:       body.MiddleName,
		PaternalLastName: body.PaternalLastName,
		MaternalLastName: body.MaternalLastName,
		Phone:            body.Phone,
		Email:            body.Email,
		Address:          body.Address,
		BirthDate:        birthDate,
		Gender:           body.Gender,
	}); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/patients/{id}
func (h *Handler) deactivate(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "id")

	if err := h.svc.Deactivate(r.Context(), claims.OrganizationID, patientID); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
