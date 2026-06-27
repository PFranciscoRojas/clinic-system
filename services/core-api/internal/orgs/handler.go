package orgs

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// Handler exposes org-level configuration the admin manages from Settings.
type Handler struct {
	repo *Repository
	km   *crypto.KeyManager // seals the per-tenant WhatsApp access token
}

func NewHandler(repo *Repository, km *crypto.KeyManager) *Handler {
	return &Handler{repo: repo, km: km}
}

// Routes mounts under /api/v1/org (JWT required by the parent group).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("organization:configure")).Get("/notifications", h.getNotifications)
	r.With(middleware.RequirePermission("organization:configure")).Put("/notifications", h.putNotifications)
	r.With(middleware.RequirePermission("organization:configure")).Get("/whatsapp", h.getWhatsApp)
	r.With(middleware.RequirePermission("organization:configure")).Put("/whatsapp", h.putWhatsApp)
	r.With(middleware.RequirePermission("organization:configure")).Get("/payment", h.getPayment)
	r.With(middleware.RequirePermission("organization:configure")).Put("/payment", h.putPayment)
	return r
}

func (h *Handler) getNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	s, err := h.repo.GetNotifications(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo leer la configuración")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) putNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var s NotificationSettings
	if err := httputil.DecodeJSON(r, &s); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.repo.SetNotifications(r.Context(), claims.OrganizationID, s); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo guardar")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) getWhatsApp(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	c, err := h.repo.GetWhatsApp(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo leer la configuración")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, c)
}

func (h *Handler) getPayment(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	c, err := h.repo.GetPaymentConfig(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo leer la configuración")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, c)
}

type paymentRequest struct {
	PaymentConfig
	AccessToken   string `json:"access_token"`
	WebhookSecret string `json:"webhook_secret"`
}

func (h *Handler) putPayment(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var req paymentRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SessionPrice <= 0 {
		req.SessionPrice = 180000
	}

	var tokenEnc []byte
	var keySource string
	if req.AccessToken != "" {
		enc, ks, err := h.km.SealSecret([]byte(req.AccessToken))
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "no se pudo cifrar el token")
			return
		}
		tokenEnc, keySource = enc, ks
	}

	var webhookSecretEnc []byte
	var webhookKeySource string
	if req.WebhookSecret != "" {
		enc, ks, err := h.km.SealSecret([]byte(req.WebhookSecret))
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "no se pudo cifrar el webhook secret")
			return
		}
		webhookSecretEnc, webhookKeySource = enc, ks
	}

	if err := h.repo.SetPaymentConfig(r.Context(), claims.OrganizationID, req.PaymentConfig, tokenEnc, keySource, webhookSecretEnc, webhookKeySource); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo guardar")
		return
	}
	out, err := h.repo.GetPaymentConfig(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteJSON(w, http.StatusOK, req.PaymentConfig)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, out)
}

// whatsAppRequest is the PUT body: like WhatsAppConfig but with a write-only
// AccessToken instead of the TokenSet flag. An empty AccessToken keeps the
// stored one untouched.
type whatsAppRequest struct {
	WhatsAppConfig
	AccessToken string `json:"access_token"`
}

func (h *Handler) putWhatsApp(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	var req whatsAppRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Lang == "" {
		req.Lang = "es"
	}

	var tokenEnc []byte
	var keySource string
	if req.AccessToken != "" {
		enc, ks, err := h.km.SealSecret([]byte(req.AccessToken))
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "no se pudo cifrar el token")
			return
		}
		tokenEnc, keySource = enc, ks
	}

	if err := h.repo.SetWhatsApp(r.Context(), claims.OrganizationID, req.WhatsAppConfig, tokenEnc, keySource); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "no se pudo guardar")
		return
	}
	// Echo back the stored shape (without the token), reflecting whether one exists.
	out, err := h.repo.GetWhatsApp(r.Context(), claims.OrganizationID)
	if err != nil {
		httputil.WriteJSON(w, http.StatusOK, req.WhatsAppConfig)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, out)
}
