package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/consents"
	"sghcp/core-api/internal/shared/httputil"
)

// PublicRoutes serves the remote-signature flow. No JWT — the single-use token
// is the credential. Mounted behind the per-IP rate limiter.
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/sign/{token}", h.publicGetSign)
	r.Post("/sign/{token}", h.publicPostSign)
	return r
}

// GET /api/v1/public/consents/sign/{token}
func (h *Handler) publicGetSign(w http.ResponseWriter, r *http.Request) {
	tok, err := h.repo.GetSignToken(r.Context(), consents.HashToken(chi.URLParam(r, "token")))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "invalid link")
		return
	}
	if err := tok.Usable(time.Now()); err != nil {
		httputil.WriteError(w, http.StatusGone, publicTokenErr(err))
		return
	}
	// Template pinned at link creation time, not "current active": the patient
	// must sign exactly what was sent.
	tpl, err := h.repo.GetTemplateByID(r.Context(), tok.TemplateID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	_, firstName, err := h.patientContact(r.Context(), tok.OrganizationID, tok.PatientID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"patient_first_name": firstName,
		"consent_type":       tok.ConsentType,
		"title":              tpl.Title,
		"body":               tpl.Body,
		"expires_at":         tok.ExpiresAt.Format(time.RFC3339),
	})
}

// POST /api/v1/public/consents/sign/{token}
func (h *Handler) publicPostSign(w http.ResponseWriter, r *http.Request) {
	tok, err := h.repo.GetSignToken(r.Context(), consents.HashToken(chi.URLParam(r, "token")))
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "invalid link")
		return
	}
	if err := tok.Usable(time.Now()); err != nil {
		httputil.WriteError(w, http.StatusGone, publicTokenErr(err))
		return
	}

	var body struct {
		Accepted     bool   `json:"accepted"`
		SignaturePNG string `json:"signature_png"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := consents.ValidateSignature(body.Accepted, body.SignaturePNG); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	tpl, err := h.repo.GetTemplateByID(r.Context(), tok.TemplateID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Staff attribution goes to whoever generated the link.
	id, err := h.createSigned(r.Context(), tok.OrganizationID, tok.PatientID, tok.CreatedBy,
		tpl, body.SignaturePNG, consents.ChannelRemoteLink, r.RemoteAddr, r.UserAgent())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := h.repo.MarkTokenUsed(r.Context(), tok.ID); err != nil {
		// Consent stored; an unusable token is a logged inconsistency, not a user error.
		slog.Default().Error("consents: mark token used failed", "err", err, "token_id", tok.ID)
	}

	h.audit.Record(r, "CONSENT_SIGN_REMOTE", "consent", id)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func publicTokenErr(err error) string {
	switch err {
	case consents.ErrTokenUsed:
		return "this document was already signed"
	case consents.ErrTokenExpired:
		return "this link expired"
	default:
		return "invalid link"
	}
}
