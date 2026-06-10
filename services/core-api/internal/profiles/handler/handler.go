package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/profiles"
	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	db    *pgxpool.Pool
	audit *audit.Writer
}

func New(db *pgxpool.Pool) *Handler {
	return &Handler{db: db, audit: audit.New(db)}
}

// GET /api/v1/specialties
func (h *Handler) listSpecialties(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT id, code, name FROM specialties WHERE is_active = TRUE ORDER BY name`)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not list specialties")
		return
	}
	defer rows.Close()

	items := make([]profiles.Specialty, 0, 12)
	for rows.Next() {
		var s profiles.Specialty
		if err := rows.Scan(&s.ID, &s.Code, &s.Name); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "could not list specialties")
			return
		}
		items = append(items, s)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/me/professional-profile
func (h *Handler) getOwn(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var p profiles.Profile
	err := h.db.QueryRow(r.Context(), `
		SELECT pp.user_id, pp.specialty_id, s.name,
		       pp.first_name, COALESCE(pp.middle_name, ''),
		       pp.paternal_last_name, COALESCE(pp.maternal_last_name, ''),
		       pp.license_number, COALESCE(pp.phone, '')
		FROM professional_profiles pp
		JOIN specialties s ON s.id = pp.specialty_id
		JOIN users u ON u.id = pp.user_id
		WHERE pp.user_id = $1 AND u.organization_id = $2
	`, claims.UserID, claims.OrganizationID).Scan(
		&p.UserID, &p.SpecialtyID, &p.SpecialtyName,
		&p.FirstName, &p.MiddleName, &p.PaternalLastName, &p.MaternalLastName,
		&p.LicenseNumber, &p.Phone,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "professional profile not found")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not load profile")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, toResponse(&p))
}

// PUT /api/v1/me/professional-profile
func (h *Handler) upsertOwn(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		FirstName        string `json:"first_name"`
		MiddleName       string `json:"middle_name"`
		PaternalLastName string `json:"paternal_last_name"`
		MaternalLastName string `json:"maternal_last_name"`
		LicenseNumber    string `json:"license_number"`
		SpecialtyID      string `json:"specialty_id"`
		Phone            string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	for _, req := range []struct{ field, value string }{
		{"first_name", body.FirstName},
		{"paternal_last_name", body.PaternalLastName},
		{"license_number", body.LicenseNumber},
		{"specialty_id", body.SpecialtyID},
	} {
		if strings.TrimSpace(req.value) == "" {
			httputil.WriteError(w, http.StatusUnprocessableEntity, req.field+" is required")
			return
		}
	}

	_, err := h.db.Exec(r.Context(), `
		INSERT INTO professional_profiles
			(user_id, specialty_id, first_name, middle_name,
			 paternal_last_name, maternal_last_name, license_number, phone)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, NULLIF($6, ''), $7, NULLIF($8, ''))
		ON CONFLICT (user_id) DO UPDATE SET
			specialty_id       = EXCLUDED.specialty_id,
			first_name         = EXCLUDED.first_name,
			middle_name        = EXCLUDED.middle_name,
			paternal_last_name = EXCLUDED.paternal_last_name,
			maternal_last_name = EXCLUDED.maternal_last_name,
			license_number     = EXCLUDED.license_number,
			phone              = EXCLUDED.phone,
			updated_at         = NOW()
	`, claims.UserID, body.SpecialtyID,
		strings.TrimSpace(body.FirstName), strings.TrimSpace(body.MiddleName),
		strings.TrimSpace(body.PaternalLastName), strings.TrimSpace(body.MaternalLastName),
		strings.TrimSpace(body.LicenseNumber), strings.TrimSpace(body.Phone))
	if err != nil {
		// FK violation on specialty_id or duplicate license_number
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid specialty or duplicate license number")
		return
	}

	h.audit.Record(r, "PROFESSIONAL_PROFILE_UPSERT", "professional_profile", claims.UserID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

func toResponse(p *profiles.Profile) map[string]any {
	return map[string]any{
		"user_id":            p.UserID,
		"specialty_id":       p.SpecialtyID,
		"specialty_name":     p.SpecialtyName,
		"first_name":         p.FirstName,
		"middle_name":        p.MiddleName,
		"paternal_last_name": p.PaternalLastName,
		"maternal_last_name": p.MaternalLastName,
		"license_number":     p.LicenseNumber,
		"phone":              p.Phone,
	}
}
