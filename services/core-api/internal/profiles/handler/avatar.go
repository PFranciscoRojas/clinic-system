package handler

import (
	"net/http"
	"strings"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

const maxAvatarChars = 350 << 10 // ~350 KB of base64 (image is downscaled client-side)

// PUT /api/v1/me/professional-profile/avatar
// Body: {"avatar_png": "data:image/...;base64,..."}
// Stored verbatim as a plain data URL — an avatar is not forgery-sensitive
// like the signature stamp, so it is not sealed with a DEK.
func (h *Handler) putAvatar(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		AvatarPNG string `json:"avatar_png"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !strings.HasPrefix(body.AvatarPNG, "data:image/") {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "avatar_png must be an image data URL")
		return
	}
	if len(body.AvatarPNG) > maxAvatarChars {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "avatar image is too large")
		return
	}

	tag, err := h.db.Exec(r.Context(), `
		UPDATE professional_profiles
		SET avatar_png = $2, updated_at = NOW()
		WHERE user_id = $1
	`, claims.UserID, body.AvatarPNG)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not save avatar")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "create your professional profile first")
		return
	}

	h.audit.Record(r, "PROFESSIONAL_AVATAR_UPLOAD", "professional_profile", claims.UserID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// DELETE /api/v1/me/professional-profile/avatar
func (h *Handler) deleteAvatar(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	if _, err := h.db.Exec(r.Context(), `
		UPDATE professional_profiles
		SET avatar_png = NULL, updated_at = NOW()
		WHERE user_id = $1
	`, claims.UserID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "could not remove avatar")
		return
	}

	h.audit.Record(r, "PROFESSIONAL_AVATAR_DELETE", "professional_profile", claims.UserID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// loadAvatar returns the stored avatar data URL, or "" when absent.
func loadAvatar(r *http.Request, h *Handler, userID string) string {
	var avatar *string
	if err := h.db.QueryRow(r.Context(),
		`SELECT avatar_png FROM professional_profiles WHERE user_id = $1`, userID,
	).Scan(&avatar); err != nil || avatar == nil {
		return ""
	}
	return *avatar
}
