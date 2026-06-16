package notify

import "context"

// Branding is the per-tenant identity stamped onto patient-facing emails
// (booking lifecycle, consent links). It is resolved from the organization's
// name + settings at send time, so every clinic's patients see their own
// psychologist — not a hardcoded one. Account/system emails (password reset,
// admin notifications) stay product-branded and do not use this.
type Branding struct {
	PublicName  string // short name for greetings/labels, e.g. "Marcela"
	DisplayName string // header/footer line, e.g. "Marcela Chapués · Psicóloga Clínica"
	ReplyTo     string // optional contact email; the contact line is omitted if empty
	Website     string // optional public site; the line is omitted if empty
	Location    string // optional, e.g. "Bogotá, Colombia"
	BrandColor  string // hex accent, validated; defaults to the product green
}

// DefaultBrandColor is the product's fallback accent when a tenant sets none.
const DefaultBrandColor = "#5e8265"

// DefaultBranding is the neutral fallback used when an organization cannot be
// resolved (missing row, nil resolver). Real tenants always override at least
// the name fields from organizations.name.
func DefaultBranding() Branding {
	return Branding{
		PublicName:  "Tu profesional",
		DisplayName: "Consulta Psicológica",
		BrandColor:  DefaultBrandColor,
	}
}

// BrandingResolver loads a tenant's branding by organization id. Implemented by
// the orgs package over the database; injected into ResendNotifier so the
// notify package stays free of any database dependency.
type BrandingResolver func(ctx context.Context, orgID string) Branding
