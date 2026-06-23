// Package whatsapp sends patient-facing WhatsApp messages through the Meta
// WhatsApp Cloud API. Credentials are per-tenant (each clinic brings its own
// WABA + number + token), so every send first resolves the org's config under
// RLS and decrypts its access token. Proactive messages must use Meta
// pre-approved templates; the template names live in org_whatsapp_config.
//
// Every method is a safe no-op when the org has no WhatsApp configured or
// disabled it. Errors are logged, never returned to the HTTP path — callers
// fire these in goroutines, mirroring the email notifier.
package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/crypto"
)

const graphAPIBase = "https://graph.facebook.com/v21.0"

// Sender dispatches WhatsApp template messages. One instance shared process-wide.
type Sender struct {
	pool   *pgxpool.Pool
	km     *crypto.KeyManager
	logger *slog.Logger
	client *http.Client
}

func New(pool *pgxpool.Pool, km *crypto.KeyManager, logger *slog.Logger) *Sender {
	return &Sender{pool: pool, km: km, logger: logger, client: &http.Client{Timeout: 15 * time.Second}}
}

type config struct {
	enabled       bool
	phoneNumberID string
	accessToken   string
	tplReminder24 string
	tplReminder2  string
	tplBooking    string
	lang          string
}

// configFor loads and decrypts the org's WhatsApp config under its RLS scope.
// Returns ok=false (silently) when the org has no config or has it disabled.
func (s *Sender) configFor(ctx context.Context, orgID string) (config, bool) {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return config{}, false
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return config{}, false
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	var (
		c          config
		tokenEnc   []byte
		keySource  string
		tpl24, tp2 *string
		tplBooking *string
		lang       string
	)
	err = conn.QueryRow(ctx, `
		SELECT enabled, COALESCE(phone_number_id,''), access_token_enc,
		       COALESCE(key_source,''), tpl_reminder_24h, tpl_reminder_2h, tpl_booking,
		       COALESCE(lang,'es')
		FROM org_whatsapp_config WHERE organization_id = $1`,
		orgID).Scan(&c.enabled, &c.phoneNumberID, &tokenEnc, &keySource, &tpl24, &tp2, &tplBooking, &lang)
	if err != nil {
		return config{}, false // no row → not configured
	}
	if !c.enabled || c.phoneNumberID == "" || len(tokenEnc) == 0 {
		return config{}, false
	}
	token, err := s.km.OpenSecret(keySource, tokenEnc)
	if err != nil {
		s.logger.Warn("whatsapp: decrypt token failed", "org", orgID, "err", err)
		return config{}, false
	}
	c.accessToken = string(token)
	crypto.Zeroize(token)
	c.lang = lang
	if tpl24 != nil {
		c.tplReminder24 = *tpl24
	}
	if tp2 != nil {
		c.tplReminder2 = *tp2
	}
	if tplBooking != nil {
		c.tplBooking = *tplBooking
	}
	return c, true
}

// AppointmentReminder sends the 24h/2h reminder template. No-op if WhatsApp is
// off for the org or the matching template name isn't configured.
func (s *Sender) AppointmentReminder(ctx context.Context, orgID, phone, firstName, dateTime, modality string, hoursBefore int) {
	c, ok := s.configFor(ctx, orgID)
	if !ok {
		return
	}
	tpl := c.tplReminder24
	if hoursBefore <= 2 {
		tpl = c.tplReminder2
	}
	if tpl == "" {
		return
	}
	// Template body convention: {{1}} name, {{2}} date+time, {{3}} modality.
	s.send(ctx, c, phone, tpl, []string{firstName, dateTime, modality})
}

// BookingConfirmed sends the appointment-confirmation template.
func (s *Sender) BookingConfirmed(ctx context.Context, orgID, phone, firstName, dateTime, modality string) {
	c, ok := s.configFor(ctx, orgID)
	if !ok || c.tplBooking == "" {
		return
	}
	s.send(ctx, c, phone, c.tplBooking, []string{firstName, dateTime, modality})
}

// send posts one template message. Phone is normalised to E.164 (Colombia
// default); an unusable number is skipped silently.
func (s *Sender) send(ctx context.Context, c config, phone, template string, bodyParams []string) {
	to := normalizeCO(phone)
	if to == "" {
		return
	}
	params := make([]map[string]string, len(bodyParams))
	for i, p := range bodyParams {
		params[i] = map[string]string{"type": "text", "text": p}
	}
	payload, err := json.Marshal(map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "template",
		"template": map[string]any{
			"name":     template,
			"language": map[string]string{"code": c.lang},
			"components": []map[string]any{
				{"type": "body", "parameters": params},
			},
		},
	})
	if err != nil {
		return
	}
	url := fmt.Sprintf("%s/%s/messages", graphAPIBase, c.phoneNumberID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+c.accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		s.logger.Warn("whatsapp: send failed", "template", template, "err", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&e) //nolint:errcheck
		s.logger.Warn("whatsapp: send rejected", "template", template, "status", resp.StatusCode, "msg", e.Error.Message)
	}
}

// normalizeCO reduces a stored phone to Meta-ready E.164 digits (no '+').
// A bare 10-digit Colombian mobile gets the 57 country code; an already
// country-prefixed number is kept. Returns "" when there aren't enough digits.
func normalizeCO(phone string) string {
	var b strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	switch {
	case len(d) == 10: // local mobile → prefix Colombia
		return "57" + d
	case len(d) >= 11 && len(d) <= 15: // already has a country code
		return d
	default:
		return ""
	}
}
