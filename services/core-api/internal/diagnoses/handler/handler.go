package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/diagnoses"
	diagrepo "sghcp/core-api/internal/diagnoses/repository"
	clinperm "sghcp/core-api/internal/shared/clinicalperm"
	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	repo  *diagrepo.Repository
	db    *pgxpool.Pool
	audit *audit.Writer
}

func New(db *pgxpool.Pool) *Handler {
	return &Handler{repo: diagrepo.New(db), db: db, audit: audit.New(db)}
}

// CatalogRoutes — mounted at /api/v1/icd10 (reference data, read permission).
func (h *Handler) CatalogRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/", h.search)
	return r
}

// PatientRoutes — mounted at /api/v1/patients/{patient_id}/diagnoses.
func (h *Handler) PatientRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("clinical_records:create")).Post("/", h.create)
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/", h.list)
	return r
}

// Routes — mounted at /api/v1/diagnoses.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("clinical_records:update")).Patch("/{id}", h.updateStatus)
	return r
}

// GET /api/v1/icd10?q=
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		return
	}
	items, err := h.repo.SearchCodes(r.Context(), q, 20)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if items == nil {
		items = []*diagnoses.ICD10Code{}
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /api/v1/patients/{patient_id}/diagnoses
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	var body struct {
		ICD10Code        string `json:"icd10_code"`
		DiagnosisType    string `json:"diagnosis_type"`
		DiagnosedAt      string `json:"diagnosed_at"` // "2006-01-02", optional
		ClinicalRecordID string `json:"clinical_record_id"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.ICD10Code == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "icd10_code is required")
		return
	}
	dxType := diagnoses.DiagnosisType(body.DiagnosisType)
	if body.DiagnosisType == "" {
		dxType = diagnoses.TypePrincipal
	}
	if !diagnoses.ValidType(dxType) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "diagnosis_type must be PRINCIPAL or RELATED")
		return
	}
	diagnosedAt := time.Now()
	if body.DiagnosedAt != "" {
		d, err := time.Parse("2006-01-02", body.DiagnosedAt)
		if err != nil {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "diagnosed_at must be YYYY-MM-DD")
			return
		}
		diagnosedAt = d
	}

	id, err := h.repo.Create(r.Context(), diagnoses.CreateParams{
		OrganizationID:   claims.OrganizationID,
		PatientID:        patientID,
		StaffID:          claims.UserID,
		ClinicalRecordID: body.ClinicalRecordID,
		ICD10Code:        body.ICD10Code,
		DiagnosisType:    dxType,
		DiagnosedAt:      diagnosedAt,
	})
	if errors.Is(err, diagnoses.ErrUnknownCode) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "unknown ICD-10 code")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Record(r, "DIAGNOSIS_CREATE", "diagnosis", id)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// isAdminOnly returns true when the caller holds CLINIC_ADMIN but NOT PROFESSIONAL.
func isAdminOnly(roles []string) bool {
	hasAdmin, hasPro := false, false
	for _, r := range roles {
		if r == "CLINIC_ADMIN" {
			hasAdmin = true
		}
		if r == "PROFESSIONAL" || r == "INTERN" {
			hasPro = true
		}
	}
	return hasAdmin && !hasPro
}

// GET /api/v1/patients/{patient_id}/diagnoses
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	reason := r.Header.Get("X-Access-Reason")
	if isAdminOnly(claims.Roles) && reason == "" {
		httputil.WriteError(w, http.StatusForbidden, "BREAK_GLASS_REASON_REQUIRED")
		return
	}

	if !clinperm.IsSysAdmin(claims.Roles) && !isAdminOnly(claims.Roles) && clinperm.HasClinicalRole(claims.Roles) {
		assigned, aErr := clinperm.IsAssignedToPatient(r.Context(), h.db, claims.OrganizationID, claims.UserID, patientID)
		if aErr != nil || !assigned {
			httputil.WriteError(w, http.StatusForbidden, "NO_PATIENT_ACCESS")
			return
		}
	}

	items, err := h.repo.ListByPatient(r.Context(), claims.OrganizationID, patientID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if items == nil {
		items = []*diagnoses.Diagnosis{}
	}
	h.audit.RecordWithReason(r, "DIAGNOSIS_LIST", "patient", patientID, reason)
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// PATCH /api/v1/diagnoses/{id}
func (h *Handler) updateStatus(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	diagnosisID := chi.URLParam(r, "id")

	var body struct {
		Status string `json:"status"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	status := diagnoses.Status(body.Status)
	if !diagnoses.ValidStatus(status) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "status must be ACTIVE, RESOLVED or RULED_OUT")
		return
	}

	if err := h.repo.UpdateStatus(r.Context(), claims.OrganizationID, diagnosisID, status); err != nil {
		if errors.Is(err, diagnoses.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "diagnosis not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Record(r, "DIAGNOSIS_UPDATE", "diagnosis", diagnosisID)
	w.WriteHeader(http.StatusNoContent)
}
