package handler

import (
	"net/http"
	"strconv"

	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
)

type platformMPResponse struct {
	PlanAmount          int    `json:"plan_amount"`
	PlanReason          string `json:"plan_reason"`
	WebhookEnforce      bool   `json:"webhook_enforce"`
	AccessTokenSet      bool   `json:"access_token_set"`
	AccessTokenSource   string `json:"access_token_source"`   // "db" | "env" | "none"
	WebhookSecretSet    bool   `json:"webhook_secret_set"`
	WebhookSecretSource string `json:"webhook_secret_source"` // "db" | "env" | "none"
}

// GET /admin/platform/mp
func (h *Handler) getPlatformMP(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT key, value, value_enc FROM platform_settings WHERE key = ANY($1)`,
		[]string{"mp_plan_amount", "mp_plan_reason", "mp_webhook_enforce", "mp_access_token", "mp_webhook_secret"},
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "error reading platform settings")
		return
	}
	defer rows.Close()

	dbVals := map[string]string{}
	dbEnc := map[string][]byte{}
	for rows.Next() {
		var key string
		var val *string
		var enc []byte
		if err := rows.Scan(&key, &val, &enc); err != nil {
			continue
		}
		if val != nil {
			dbVals[key] = *val
		}
		if len(enc) > 0 {
			dbEnc[key] = enc
		}
	}

	resp := platformMPResponse{
		PlanAmount:     h.cfg.MPPlanAmount,
		PlanReason:     h.cfg.MPPlanReason,
		WebhookEnforce: h.cfg.MPWebhookEnforce,
	}

	if v, ok := dbVals["mp_plan_amount"]; ok {
		if n, err := strconv.Atoi(v); err == nil {
			resp.PlanAmount = n
		}
	}
	if v, ok := dbVals["mp_plan_reason"]; ok {
		resp.PlanReason = v
	}
	if v, ok := dbVals["mp_webhook_enforce"]; ok {
		resp.WebhookEnforce = v == "true"
	}

	// Access token
	if len(dbEnc["mp_access_token"]) > 0 {
		resp.AccessTokenSet = true
		resp.AccessTokenSource = "db"
	} else if h.cfg.MPAccessToken != "" {
		resp.AccessTokenSet = true
		resp.AccessTokenSource = "env"
	} else {
		resp.AccessTokenSource = "none"
	}

	// Webhook secret
	if len(dbEnc["mp_webhook_secret"]) > 0 {
		resp.WebhookSecretSet = true
		resp.WebhookSecretSource = "db"
	} else if h.cfg.MPWebhookSecret != "" {
		resp.WebhookSecretSet = true
		resp.WebhookSecretSource = "env"
	} else {
		resp.WebhookSecretSource = "none"
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

// PUT /admin/platform/mp — updates non-secret platform settings.
func (h *Handler) updatePlatformMP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PlanAmount     *int    `json:"plan_amount"`
		PlanReason     *string `json:"plan_reason"`
		WebhookEnforce *bool   `json:"webhook_enforce"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if body.PlanAmount != nil {
		if err := upsertSetting(r, h, "mp_plan_amount", strconv.Itoa(*body.PlanAmount)); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error saving plan_amount")
			return
		}
	}
	if body.PlanReason != nil {
		if err := upsertSetting(r, h, "mp_plan_reason", *body.PlanReason); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error saving plan_reason")
			return
		}
	}
	if body.WebhookEnforce != nil {
		val := "false"
		if *body.WebhookEnforce {
			val = "true"
		}
		if err := upsertSetting(r, h, "mp_webhook_enforce", val); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error saving webhook_enforce")
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// PUT /admin/platform/mp/tokens — encrypts and stores MP access token and/or
// webhook secret. Either field may be omitted to leave the other unchanged.
func (h *Handler) updatePlatformTokens(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccessToken   string `json:"access_token"`
		WebhookSecret string `json:"webhook_secret"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.AccessToken == "" && body.WebhookSecret == "" {
		httputil.WriteError(w, http.StatusBadRequest, "at least one token field is required")
		return
	}

	if body.AccessToken != "" {
		enc, ks, err := h.km.SealSecret([]byte(body.AccessToken))
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error encrypting access token")
			return
		}
		crypto.Zeroize([]byte(body.AccessToken))
		if err := upsertSecretSetting(r, h, "mp_access_token", enc, ks); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error saving access token")
			return
		}
	}

	if body.WebhookSecret != "" {
		enc, ks, err := h.km.SealSecret([]byte(body.WebhookSecret))
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error encrypting webhook secret")
			return
		}
		crypto.Zeroize([]byte(body.WebhookSecret))
		if err := upsertSecretSetting(r, h, "mp_webhook_secret", enc, ks); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "error saving webhook secret")
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func upsertSetting(r *http.Request, h *Handler, key, value string) error {
	_, err := h.pool.Exec(r.Context(), `
		INSERT INTO platform_settings (key, value, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
		key, value)
	return err
}

func upsertSecretSetting(r *http.Request, h *Handler, key string, enc []byte, ks string) error {
	_, err := h.pool.Exec(r.Context(), `
		INSERT INTO platform_settings (key, value_enc, key_source, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (key) DO UPDATE SET value_enc = EXCLUDED.value_enc, key_source = EXCLUDED.key_source, updated_at = NOW()`,
		key, enc, ks)
	return err
}
