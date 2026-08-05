package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/consents"
	"sghcp/core-api/internal/shared/dbctx"
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
	tokenHash := consents.HashToken(chi.URLParam(r, "token"))
	org, err := h.consentTokenOrg(r.Context(), tokenHash)
	if err != nil || org == "" {
		httputil.WriteError(w, http.StatusNotFound, "invalid link")
		return
	}
	// Public route: pin the token's org RLS scope for every read below
	// (consent_sign_tokens, consent_templates and patients are all under RLS).
	scopeErr := dbctx.WithOrgScope(r.Context(), h.pool, org, func(ctx context.Context) error {
		tok, err := h.repo.GetSignToken(ctx, tokenHash)
		if err != nil {
			httputil.WriteError(w, http.StatusNotFound, "invalid link")
			return nil
		}
		if err := tok.Usable(time.Now()); err != nil {
			httputil.WriteError(w, http.StatusGone, publicTokenErr(err))
			return nil
		}
		// Template pinned at link creation time, not "current active": the
		// patient must sign exactly what was sent.
		tpl, err := h.repo.GetTemplateByID(ctx, tok.TemplateID)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return nil
		}
		_, firstName, err := h.patientContact(ctx, tok.OrganizationID, tok.PatientID)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return nil
		}
		// Tenant identity for the public sign page header; best-effort — the
		// page renders without it (organizations is the tenant root, no RLS).
		var orgName string
		_ = h.pool.QueryRow(r.Context(),
			`SELECT name FROM organizations WHERE id = $1`, tok.OrganizationID,
		).Scan(&orgName)
		httputil.WriteJSON(w, http.StatusOK, map[string]any{
			"patient_first_name": firstName,
			"consent_type":       tok.ConsentType,
			"title":              tpl.Title,
			"body":               tpl.Body,
			"expires_at":         tok.ExpiresAt.Format(time.RFC3339),
			"org_name":           orgName,
		})
		return nil
	})
	if scopeErr != nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "database unavailable")
	}
}

// POST /api/v1/public/consents/sign/{token}
func (h *Handler) publicPostSign(w http.ResponseWriter, r *http.Request) {
	tokenHash := consents.HashToken(chi.URLParam(r, "token"))
	org, err := h.consentTokenOrg(r.Context(), tokenHash)
	if err != nil || org == "" {
		httputil.WriteError(w, http.StatusNotFound, "invalid link")
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

	// Public route: pin the token's org RLS scope for the token/template reads
	// and the consent write (consents, consent_sign_tokens, patients are RLS).
	var consentID string
	scopeErr := dbctx.WithOrgScope(r.Context(), h.pool, org, func(ctx context.Context) error {
		tok, err := h.repo.GetSignToken(ctx, tokenHash)
		if err != nil {
			httputil.WriteError(w, http.StatusNotFound, "invalid link")
			return nil
		}
		if err := tok.Usable(time.Now()); err != nil {
			httputil.WriteError(w, http.StatusGone, publicTokenErr(err))
			return nil
		}
		tpl, err := h.repo.GetTemplateByID(ctx, tok.TemplateID)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return nil
		}
		// Staff attribution goes to whoever generated the link.
		id, err := h.createSigned(ctx, tok.OrganizationID, tok.PatientID, tok.CreatedBy,
			tpl, body.SignaturePNG, consents.ChannelRemoteLink, httputil.ClientIP(r), r.UserAgent())
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return nil
		}
		if err := h.repo.MarkTokenUsed(ctx, tok.ID); err != nil {
			// Consent stored; an unusable token is a logged inconsistency, not a user error.
			slog.Default().Error("consents: mark token used failed", "err", err, "token_id", tok.ID)
		}
		consentID = id
		return nil
	})
	if scopeErr != nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	if consentID == "" {
		return // a specific error response was already written inside the scope
	}

	h.audit.Record(r, "CONSENT_SIGN_REMOTE", "consent", consentID)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": consentID})
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
