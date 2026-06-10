package handler

import (
	"encoding/base64"
	"net/http"
	"strings"

	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

const (
	signaturePrefix  = "data:image/png;base64,"
	maxSignatureSize = 500 << 10 // 500 KB decoded
)

// PUT /api/v1/me/professional-profile/signature
// Body: {"signature_png": "data:image/png;base64,..."}
// The image is sealed with its own DEK — a handwritten signature stamp is
// forgery-sensitive material.
func (h *Handler) putSignature(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		SignaturePNG string `json:"signature_png"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !strings.HasPrefix(body.SignaturePNG, signaturePrefix) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "signature_png must be a PNG data URL")
		return
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(body.SignaturePNG, signaturePrefix))
	if err != nil || len(raw) == 0 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid base64 payload")
		return
	}
	if len(raw) > maxSignatureSize {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "signature image exceeds 500KB")
		return
	}

	plainDEK, encDEK, keySource, err := h.km.GenerateDEK()
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not generate key")
		return
	}
	var dekID string
	if err := h.db.QueryRow(r.Context(), `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM') RETURNING id
	`, encDEK, keySource).Scan(&dekID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not store key")
		return
	}

	sealed, err := crypto.Seal(plainDEK, raw)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not encrypt signature")
		return
	}

	tag, err := h.db.Exec(r.Context(), `
		UPDATE professional_profiles
		SET signature_enc = $2, signature_dek_id = $3, updated_at = NOW()
		WHERE user_id = $1
	`, claims.UserID, sealed, dekID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not save signature")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "create your professional profile first")
		return
	}

	h.audit.Record(r, "PROFESSIONAL_SIGNATURE_UPLOAD", "professional_profile", claims.UserID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// DELETE /api/v1/me/professional-profile/signature
func (h *Handler) deleteSignature(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	if _, err := h.db.Exec(r.Context(), `
		UPDATE professional_profiles
		SET signature_enc = NULL, signature_dek_id = NULL, updated_at = NOW()
		WHERE user_id = $1
	`, claims.UserID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not remove signature")
		return
	}

	h.audit.Record(r, "PROFESSIONAL_SIGNATURE_DELETE", "professional_profile", claims.UserID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// loadSignature decrypts a profile's signature stamp; returns nil when absent.
func loadSignature(r *http.Request, h *Handler, userID string) []byte {
	var sealed []byte
	var dekID *string
	if err := h.db.QueryRow(r.Context(), `
		SELECT signature_enc, signature_dek_id::text FROM professional_profiles WHERE user_id = $1
	`, userID).Scan(&sealed, &dekID); err != nil || len(sealed) == 0 || dekID == nil {
		return nil
	}

	var encDEK []byte
	var keySource string
	if err := h.db.QueryRow(r.Context(),
		`SELECT encrypted_dek, key_source FROM encryption_keys WHERE id = $1`, *dekID,
	).Scan(&encDEK, &keySource); err != nil {
		return nil
	}
	dek, err := h.km.DecryptDEK(keySource, encDEK)
	if err != nil {
		return nil
	}
	raw, err := crypto.Open(dek, sealed)
	if err != nil {
		return nil
	}
	return raw
}
