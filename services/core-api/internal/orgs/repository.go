// Package orgs provides read access to organization-level configuration that
// lives outside the per-bounded-context repositories — currently the tenant
// branding stored in organizations.settings, used to stamp patient-facing
// emails with each clinic's identity.
package orgs

import (
	"context"
	"encoding/json"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/dbctx"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// NotificationSettings holds a tenant's patient-reminder preferences (email).
// WhatsApp/SMS and internal alerts are a later wave and not represented here.
type NotificationSettings struct {
	Reminder24h bool `json:"reminder_24h"`
	Reminder2h  bool `json:"reminder_2h"`
}

// GetNotifications reads settings.notifications, defaulting to 24h-on/2h-off
// when the org hasn't configured anything yet.
func (r *Repository) GetNotifications(ctx context.Context, orgID string) (NotificationSettings, error) {
	s := NotificationSettings{Reminder24h: true, Reminder2h: false}
	err := dbctx.From(ctx, r.pool).QueryRow(ctx, `
		SELECT COALESCE((settings->'notifications'->>'reminder_24h')::bool, true),
		       COALESCE((settings->'notifications'->>'reminder_2h')::bool, false)
		FROM organizations WHERE id = $1`, orgID).Scan(&s.Reminder24h, &s.Reminder2h)
	return s, err
}

// SetNotifications merges the reminder prefs into settings.notifications without
// disturbing other settings keys (branding, payments, …).
func (r *Repository) SetNotifications(ctx context.Context, orgID string, s NotificationSettings) error {
	_, err := dbctx.From(ctx, r.pool).Exec(ctx, `
		UPDATE organizations
		SET settings = COALESCE(settings,'{}'::jsonb)
		    || jsonb_build_object('notifications',
		         COALESCE(settings->'notifications','{}'::jsonb)
		         || jsonb_build_object('reminder_24h', $2::bool, 'reminder_2h', $3::bool)),
		    updated_at = NOW()
		WHERE id = $1`, orgID, s.Reminder24h, s.Reminder2h)
	return err
}

// WhatsAppConfig mirrors org_whatsapp_config minus the secret token. TokenSet
// tells the UI whether a token is already stored (it's never sent back).
type WhatsAppConfig struct {
	Enabled        bool   `json:"enabled"`
	PhoneNumberID  string `json:"phone_number_id"`
	WABAID         string `json:"waba_id"`
	TplReminder24h string `json:"tpl_reminder_24h"`
	TplReminder2h  string `json:"tpl_reminder_2h"`
	TplBooking     string `json:"tpl_booking"`
	Lang           string `json:"lang"`
	TokenSet       bool   `json:"token_set"`
}

// GetWhatsApp reads the org's WhatsApp config without exposing the token.
// A missing row yields a zero-value (disabled) config.
func (r *Repository) GetWhatsApp(ctx context.Context, orgID string) (WhatsAppConfig, error) {
	c := WhatsAppConfig{Lang: "es"}
	err := dbctx.From(ctx, r.pool).QueryRow(ctx, `
		SELECT enabled, COALESCE(phone_number_id,''), COALESCE(waba_id,''),
		       COALESCE(tpl_reminder_24h,''), COALESCE(tpl_reminder_2h,''),
		       COALESCE(tpl_booking,''), COALESCE(lang,'es'),
		       access_token_enc IS NOT NULL
		FROM org_whatsapp_config WHERE organization_id = $1`, orgID).
		Scan(&c.Enabled, &c.PhoneNumberID, &c.WABAID, &c.TplReminder24h,
			&c.TplReminder2h, &c.TplBooking, &c.Lang, &c.TokenSet)
	if err == pgx.ErrNoRows {
		return WhatsAppConfig{Lang: "es"}, nil
	}
	return c, err
}

// SetWhatsApp upserts the org's config. When tokenEnc is nil the existing token
// is preserved (write-only field); otherwise it replaces it.
func (r *Repository) SetWhatsApp(ctx context.Context, orgID string, c WhatsAppConfig, tokenEnc []byte, keySource string) error {
	_, err := dbctx.From(ctx, r.pool).Exec(ctx, `
		INSERT INTO org_whatsapp_config
		    (organization_id, enabled, phone_number_id, waba_id,
		     access_token_enc, key_source,
		     tpl_reminder_24h, tpl_reminder_2h, tpl_booking, lang)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (organization_id) DO UPDATE SET
		    enabled          = EXCLUDED.enabled,
		    phone_number_id  = EXCLUDED.phone_number_id,
		    waba_id          = EXCLUDED.waba_id,
		    access_token_enc = COALESCE(EXCLUDED.access_token_enc, org_whatsapp_config.access_token_enc),
		    key_source       = COALESCE(EXCLUDED.key_source, org_whatsapp_config.key_source),
		    tpl_reminder_24h = EXCLUDED.tpl_reminder_24h,
		    tpl_reminder_2h  = EXCLUDED.tpl_reminder_2h,
		    tpl_booking      = EXCLUDED.tpl_booking,
		    lang             = EXCLUDED.lang,
		    updated_at       = NOW()`,
		orgID, c.Enabled, nullIfEmpty(c.PhoneNumberID), nullIfEmpty(c.WABAID),
		tokenEnc, nullIfEmpty(keySource),
		nullIfEmpty(c.TplReminder24h), nullIfEmpty(c.TplReminder2h),
		nullIfEmpty(c.TplBooking), c.Lang)
	return err
}

// PaymentConfig holds the per-tenant booking payment settings.
// SessionPrice is in whole COP (no decimals, no floats — stored as INTEGER).
// TokenSet tells the UI whether an MP access token is already stored.
type PaymentConfig struct {
	Enabled          bool   `json:"enabled"`
	SessionPrice     int    `json:"session_price"`
	TokenSet         bool   `json:"token_set"`
	TokenMode        string `json:"token_mode"` // "live" | "test" | ""
	WebhookSecretSet bool   `json:"webhook_secret_set"`
}

// GetPaymentConfig reads the org's booking payment config without exposing the token.
// Returns a zero-value (disabled, default price) when no row exists.
func (r *Repository) GetPaymentConfig(ctx context.Context, orgID string) (PaymentConfig, error) {
	c := PaymentConfig{SessionPrice: 180000}
	var mode *string
	err := dbctx.From(ctx, r.pool).QueryRow(ctx, `
		SELECT enabled, session_price,
		       mp_access_token_enc IS NOT NULL,
		       mp_token_mode,
		       mp_webhook_secret_enc IS NOT NULL
		FROM org_payment_config WHERE organization_id = $1`, orgID).
		Scan(&c.Enabled, &c.SessionPrice, &c.TokenSet, &mode, &c.WebhookSecretSet)
	if err == pgx.ErrNoRows {
		return c, nil
	}
	if mode != nil {
		c.TokenMode = *mode
	}
	return c, err
}

// SetPaymentConfig upserts the org's booking payment config.
// Nil slices (tokenEnc, webhookSecretEnc) preserve the existing stored value.
// tokenMode is only updated when a new token is provided ("" = keep existing).
func (r *Repository) SetPaymentConfig(ctx context.Context, orgID string, c PaymentConfig, tokenEnc []byte, keySource, tokenMode string, webhookSecretEnc []byte, webhookKeySource string) error {
	_, err := dbctx.From(ctx, r.pool).Exec(ctx, `
		INSERT INTO org_payment_config
		    (organization_id, enabled, session_price, mp_access_token_enc, key_source,
		     mp_token_mode, mp_webhook_secret_enc, mp_webhook_secret_key_src)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (organization_id) DO UPDATE SET
		    enabled                    = EXCLUDED.enabled,
		    session_price              = EXCLUDED.session_price,
		    mp_access_token_enc        = COALESCE(EXCLUDED.mp_access_token_enc, org_payment_config.mp_access_token_enc),
		    key_source                 = COALESCE(EXCLUDED.key_source, org_payment_config.key_source),
		    mp_token_mode              = COALESCE(EXCLUDED.mp_token_mode, org_payment_config.mp_token_mode),
		    mp_webhook_secret_enc      = COALESCE(EXCLUDED.mp_webhook_secret_enc, org_payment_config.mp_webhook_secret_enc),
		    mp_webhook_secret_key_src  = COALESCE(EXCLUDED.mp_webhook_secret_key_src, org_payment_config.mp_webhook_secret_key_src),
		    updated_at                 = NOW()`,
		orgID, c.Enabled, c.SessionPrice, tokenEnc, nullIfEmpty(keySource),
		nullIfEmpty(tokenMode), webhookSecretEnc, nullIfEmpty(webhookKeySource))
	return err
}


func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// hexColor guards against injecting arbitrary CSS through the brand color.
var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{3,8}$`)

// brandingSettings mirrors the optional `branding` object inside
// organizations.settings. Any field left empty falls back to a sane default.
type brandingSettings struct {
	Branding struct {
		PublicName string `json:"public_name"`
		ReplyTo    string `json:"reply_to"`
		Website    string `json:"website"`
		Location   string `json:"location"`
		BrandColor string `json:"brand_color"`
	} `json:"branding"`
}

// ResolveBranding loads a tenant's email branding. The display name always
// comes from organizations.name; the optional contact/website/color come from
// settings.branding. Returns DefaultBranding if the org can't be read so an
// email is never blocked by a config lookup.
func (r *Repository) ResolveBranding(ctx context.Context, orgID string) notify.Branding {
	var name string
	var rawSettings []byte
	err := r.pool.QueryRow(ctx,
		`SELECT name, settings FROM organizations WHERE id = $1`, orgID,
	).Scan(&name, &rawSettings)
	if err != nil {
		return notify.DefaultBranding()
	}

	b := notify.DefaultBranding()
	if name != "" {
		b.DisplayName = name
		b.PublicName = name
	}

	var s brandingSettings
	if len(rawSettings) > 0 {
		_ = json.Unmarshal(rawSettings, &s)
	}
	if s.Branding.PublicName != "" {
		b.PublicName = s.Branding.PublicName
	}
	b.ReplyTo = s.Branding.ReplyTo
	b.Website = s.Branding.Website
	b.Location = s.Branding.Location
	if hexColor.MatchString(s.Branding.BrandColor) {
		b.BrandColor = s.Branding.BrandColor
	}
	return b
}
