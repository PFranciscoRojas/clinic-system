// Package orgs provides read access to organization-level configuration that
// lives outside the per-bounded-context repositories — currently the tenant
// branding stored in organizations.settings, used to stamp patient-facing
// emails with each clinic's identity.
package orgs

import (
	"context"
	"encoding/json"
	"regexp"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/notify"
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
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE((settings->'notifications'->>'reminder_24h')::bool, true),
		       COALESCE((settings->'notifications'->>'reminder_2h')::bool, false)
		FROM organizations WHERE id = $1`, orgID).Scan(&s.Reminder24h, &s.Reminder2h)
	return s, err
}

// SetNotifications merges the reminder prefs into settings.notifications without
// disturbing other settings keys (branding, payments, …).
func (r *Repository) SetNotifications(ctx context.Context, orgID string, s NotificationSettings) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE organizations
		SET settings = COALESCE(settings,'{}'::jsonb)
		    || jsonb_build_object('notifications',
		         COALESCE(settings->'notifications','{}'::jsonb)
		         || jsonb_build_object('reminder_24h', $2::bool, 'reminder_2h', $3::bool)),
		    updated_at = NOW()
		WHERE id = $1`, orgID, s.Reminder24h, s.Reminder2h)
	return err
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
