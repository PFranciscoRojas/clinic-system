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
