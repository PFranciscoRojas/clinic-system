package handler

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/consents"
	consentsrepo "sghcp/core-api/internal/consents/repository"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type repo interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p consents.CreateParams) (string, error)
	List(ctx context.Context, orgID, patientID string) ([]*consents.Consent, error)
}

type Handler struct {
	repo repo
	km   *crypto.KeyManager
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	return &Handler{repo: consentsrepo.New(db), km: km}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("consents:create")).Post("/", h.create)
	r.With(middleware.RequirePermission("consents:read")).Get("/", h.list)
	return r
}

// POST /api/v1/patients/{patient_id}/consents
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	var body struct {
		ConsentType  string `json:"consent_type"`
		SignedAt     string `json:"signed_at"` // "2006-01-02"
		ScanFileType string `json:"scan_file_type"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.ConsentType == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "consent_type is required")
		return
	}

	signedAt := time.Now()
	if body.SignedAt != "" {
		if d, err := time.Parse("2006-01-02", body.SignedAt); err == nil {
			signedAt = d
		}
	}
	fileType := body.ScanFileType
	if fileType == "" {
		fileType = "PDF"
	}

	plainDEK, encDEK, keySource, err := h.km.GenerateDEK()
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	dekID, err := h.repo.CreateEncKey(r.Context(), encDEK, keySource)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	placeholder := []byte("pending-scan")
	docEnc, err := crypto.Seal(plainDEK, placeholder)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	hash := sha256.Sum256(placeholder)
	docHash := fmt.Sprintf("%x", hash[:])

	scanEnc, err := crypto.Seal(plainDEK, []byte("pending"))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	id, err := h.repo.Create(r.Context(), consents.CreateParams{
		OrganizationID:       claims.OrganizationID,
		PatientID:            patientID,
		StaffID:              claims.UserID,
		DEKID:                dekID,
		ConsentType:          consents.ConsentType(body.ConsentType),
		DocumentEnc:          docEnc,
		DocumentTemplateHash: docHash,
		ScanPathEnc:          scanEnc,
		ScanFileType:         fileType,
		SignedAt:             signedAt,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// GET /api/v1/patients/{patient_id}/consents
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	items, err := h.repo.List(r.Context(), claims.OrganizationID, patientID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]map[string]any, 0, len(items))
	for _, c := range items {
		out = append(out, map[string]any{
			"id":            c.ID,
			"patient_id":    c.PatientID,
			"staff_id":      c.StaffID,
			"consent_type":  c.ConsentType,
			"signing_method": c.SigningMethod,
			"signed_at":     c.SignedAt.Format("2006-01-02"),
			"valid_until":   c.ValidUntil,
			"revoked_at":    c.RevokedAt,
			"created_at":    c.CreatedAt,
		})
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}
