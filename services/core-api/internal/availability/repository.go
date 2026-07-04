// Package availability computes the free appointment slots a clinic offers,
// for the public booking page. It is the server-side, authoritative mirror of
// the clinic app's client-side slot logic (services/frontend/src/lib/schedule.ts).
package availability

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("organization or professional not found")

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Professional is the practitioner a public booking is scheduled with,
// plus their working-hours config (raw JSON, parsed by the service).
type Professional struct {
	OrgID        string
	StaffID      string
	WorkingHours json.RawMessage
}

// ResolveBySlug finds the active org by slug and one of its PROFESSIONAL users
// with a profile. When staffID is non-empty the lookup is pinned to that
// specific professional (validating it belongs to the org and holds the role);
// when empty, the org's earliest professional is used so single-practitioner
// orgs keep working without a picker. organizations/professional_profiles
// carry no RLS, so a plain read is fine. Returns ErrNotFound when there's no
// such org or professional.
func (r *Repository) ResolveBySlug(ctx context.Context, slug, staffID string) (*Professional, error) {
	var p Professional
	var wh []byte
	// Resolve the org's PROFESSIONAL user by role; the profile (and its working
	// hours) is optional — a fresh signup has no profile yet, in which case the
	// service falls back to a default schedule so booking works immediately.
	err := r.pool.QueryRow(ctx, `
		SELECT o.id, u.id, COALESCE(pp.working_hours, '{}'::jsonb)
		FROM organizations o
		JOIN user_roles ur ON ur.organization_id = o.id
		JOIN roles r ON r.id = ur.role_id AND r.name = 'PROFESSIONAL'
		JOIN users u ON u.id = ur.user_id AND u.is_active
		LEFT JOIN professional_profiles pp ON pp.user_id = u.id
		WHERE o.slug = $1 AND o.is_active
		  AND ($2 = '' OR u.id::text = $2)
		ORDER BY u.created_at ASC
		LIMIT 1
	`, slug, staffID).Scan(&p.OrgID, &p.StaffID, &wh)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("resolve professional: %w", err)
	}
	p.WorkingHours = wh
	return &p, nil
}

// PublicProfessional is the public-facing identity of one professional on the
// booking page: id plus display name only — never email or license data.
type PublicProfessional struct {
	StaffID string `json:"staff_id"`
	Name    string `json:"name"`
}

// ListProfessionalsBySlug returns the org's active PROFESSIONAL users so the
// public booking page can offer a picker when the clinic has more than one.
// The name comes from the professional profile, falling back to the account's
// display name (a fresh signup has no profile yet).
func (r *Repository) ListProfessionalsBySlug(ctx context.Context, slug string) ([]PublicProfessional, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.id,
		       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pp.first_name, pp.paternal_last_name)), ''),
		                NULLIF(u.display_name, ''),
		                'Profesional')
		FROM organizations o
		JOIN user_roles ur ON ur.organization_id = o.id
		JOIN roles r ON r.id = ur.role_id AND r.name = 'PROFESSIONAL'
		JOIN users u ON u.id = ur.user_id AND u.is_active
		LEFT JOIN professional_profiles pp ON pp.user_id = u.id
		WHERE o.slug = $1 AND o.is_active
		ORDER BY u.created_at ASC
	`, slug)
	if err != nil {
		return nil, fmt.Errorf("list professionals: %w", err)
	}
	defer rows.Close()
	var out []PublicProfessional
	for rows.Next() {
		var p PublicProfessional
		if err := rows.Scan(&p.StaffID, &p.Name); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ResolveByOrgAndStaff loads the professional's working-hours config from the
// org and staff IDs available in JWT claims — bypasses the slug lookup used by
// the public booking endpoint.
func (r *Repository) ResolveByOrgAndStaff(ctx context.Context, orgID, staffID string) (*Professional, error) {
	p := &Professional{OrgID: orgID, StaffID: staffID}
	var wh []byte
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(working_hours, '{}'::jsonb) FROM professional_profiles WHERE user_id = $1`,
		staffID,
	).Scan(&wh)
	if errors.Is(err, pgx.ErrNoRows) {
		wh = []byte("{}")
	} else if err != nil {
		return nil, fmt.Errorf("load working hours: %w", err)
	}
	p.WorkingHours = wh
	return p, nil
}

// OrgPublicInfo is the public-facing identity a booking page shows.
type OrgPublicInfo struct {
	PublicName string `json:"public_name"`
	BrandColor string `json:"brand_color"`
	Website    string `json:"website"`
}

// PublicInfo returns the clinic's public name and brand color (from
// settings.branding, falling back to the org name). organizations has no RLS.
func (r *Repository) PublicInfo(ctx context.Context, slug string) (*OrgPublicInfo, error) {
	var name string
	var publicName, brandColor, website *string
	err := r.pool.QueryRow(ctx, `
		SELECT name,
		       settings->'branding'->>'public_name',
		       settings->'branding'->>'brand_color',
		       settings->'branding'->>'website'
		FROM organizations WHERE slug = $1 AND is_active
	`, slug).Scan(&name, &publicName, &brandColor, &website)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("org public info: %w", err)
	}
	info := &OrgPublicInfo{PublicName: name}
	if publicName != nil && *publicName != "" {
		info.PublicName = *publicName
	}
	if brandColor != nil {
		info.BrandColor = *brandColor
	}
	if website != nil {
		info.Website = *website
	}
	return info, nil
}

// Busy is an occupied window (an existing appointment).
type Busy struct {
	Start       time.Time
	DurationMin int
}

// BusyAppointments returns the staff's live appointments in [from, to). The
// appointments table is RLS-protected, so we pin a connection and set the
// org GUC for this read (the public endpoint has no JWT/TenantScope).
func (r *Repository) BusyAppointments(ctx context.Context, orgID, staffID string, from, to time.Time) ([]Busy, error) {
	conn, err := r.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return nil, fmt.Errorf("set org guc: %w", err)
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	rows, err := conn.Query(ctx, `
		SELECT scheduled_at, duration_min
		FROM appointments
		WHERE staff_id = $1
		  AND status NOT IN ('CANCELLED', 'RESCHEDULED', 'NO_SHOW')
		  AND scheduled_at >= $2 AND scheduled_at < $3
	`, staffID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query appointments: %w", err)
	}
	defer rows.Close()

	var out []Busy
	for rows.Next() {
		var b Busy
		if err := rows.Scan(&b.Start, &b.DurationMin); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// BusyHolds returns the staff's unexpired paid-booking holds in [from, to).
// bookings is RLS-protected (000032), so — like BusyAppointments — we pin a
// connection and set the org GUC for this read (the public endpoint has no
// JWT/TenantScope). Without this the holds are silently filtered out and held
// slots wrongly show as free (critical with deferred holds that last days).
func (r *Repository) BusyHolds(ctx context.Context, orgID, staffID string, from, to time.Time) ([]Busy, error) {
	conn, err := r.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return nil, fmt.Errorf("set org guc: %w", err)
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	rows, err := conn.Query(ctx, `
		SELECT scheduled_at, duration_min
		FROM bookings
		WHERE staff_id = $1 AND status = 'PENDING_PAYMENT' AND hold_expires_at > NOW()
		  AND scheduled_at >= $2 AND scheduled_at < $3
	`, staffID, from, to)
	if err != nil {
		return nil, fmt.Errorf("query holds: %w", err)
	}
	defer rows.Close()
	var out []Busy
	for rows.Next() {
		var b Busy
		if err := rows.Scan(&b.Start, &b.DurationMin); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
