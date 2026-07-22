// Package trial sends the tenant-owner lifecycle emails of the free trial
// (day-3 activation nudge, "ends soon" warning, "ended" notice), driven by a
// background sweep. The trial_emails_sent table guarantees each email fires at
// most once per organization, mirroring the appointment-reminder engine.
package trial

import (
	"context"
	"log/slog"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/notify"
)

const sweepInterval = 4 * time.Hour

// Windows are wide bands rather than single instants so a missed sweep or a
// brief outage doesn't drop an email; the sent-table keeps it at most once.
// Both nudge and ended are bounded below so that deploying this engine onto a
// database with old trialing orgs doesn't blast them retroactively.
const (
	kindNudge  = "nudge_day3"
	kindEnding = "ending_3d"
	kindEnded  = "ended"
)

type Engine struct {
	pool            *pgxpool.Pool
	notifier        notify.Notifier
	appBaseURL      string
	supportWhatsApp string
	logger          *slog.Logger
}

func New(pool *pgxpool.Pool, notifier notify.Notifier, appBaseURL, supportWhatsApp string, logger *slog.Logger) *Engine {
	return &Engine{pool: pool, notifier: notifier, appBaseURL: appBaseURL, supportWhatsApp: supportWhatsApp, logger: logger}
}

// Run sweeps on a ticker until ctx is cancelled. One goroutine inside core-api.
func (e *Engine) Run(ctx context.Context) {
	e.logger.Info("trial engine started", "interval", sweepInterval)
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	e.sweep(ctx) // run once at startup so a restart doesn't wait a full interval
	for {
		select {
		case <-ctx.Done():
			e.logger.Info("trial engine stopped")
			return
		case <-ticker.C:
			e.sweep(ctx)
		}
	}
}

func (e *Engine) sweep(ctx context.Context) {
	rows, err := e.pool.Query(ctx, `
		SELECT id, created_at, trial_ends_at
		FROM organizations
		WHERE is_active AND NOT is_internal
		  AND subscription_status = 'trialing'
		  AND trial_ends_at IS NOT NULL`)
	if err != nil {
		e.logger.Error("trial: list orgs", "err", err)
		return
	}
	type org struct {
		id        string
		createdAt time.Time
		trialEnds time.Time
	}
	var orgs []org
	for rows.Next() {
		var o org
		if rows.Scan(&o.id, &o.createdAt, &o.trialEnds) == nil {
			orgs = append(orgs, o)
		}
	}
	rows.Close()

	now := time.Now()
	for _, o := range orgs {
		age := now.Sub(o.createdAt)
		untilEnd := o.trialEnds.Sub(now)
		switch {
		// Ended within the last 48h (older lapses predate the engine — skip).
		case untilEnd <= 0 && untilEnd > -48*time.Hour:
			e.dispatch(ctx, o.id, kindEnded, 0)
		// Ends within the next 3 days.
		case untilEnd > 0 && untilEnd <= 72*time.Hour:
			e.dispatch(ctx, o.id, kindEnding, daysLeft(untilEnd))
		// 3-5 days into the trial with plenty of runway left: activation nudge.
		case age >= 72*time.Hour && age <= 120*time.Hour && untilEnd > 72*time.Hour:
			e.dispatch(ctx, o.id, kindNudge, daysLeft(untilEnd))
		}
	}
}

// dispatch claims the (org, kind) slot and, if this sweep won the insert,
// emails the org's owner. The owner is the earliest active verified user.
func (e *Engine) dispatch(ctx context.Context, orgID, kind string, days int) {
	tag, err := e.pool.Exec(ctx, `
		INSERT INTO trial_emails_sent (organization_id, kind) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, orgID, kind)
	if err != nil || tag.RowsAffected() == 0 {
		return
	}

	email, name, err := e.ownerContact(ctx, orgID)
	if err != nil || email == "" {
		e.logger.Warn("trial: no owner contact", "org", orgID, "kind", kind, "err", err)
		return
	}

	d := notify.TrialLifecycleDetails{
		Name:            name,
		DaysLeft:        days,
		LoginURL:        e.appBaseURL + "/login",
		BillingURL:      e.appBaseURL + "/settings",
		SupportWhatsApp: e.supportWhatsApp,
	}
	switch kind {
	case kindNudge:
		e.notifier.TrialNudge(ctx, email, d)
	default:
		e.notifier.TrialEnding(ctx, email, d)
	}
	e.logger.Info("trial: email sent", "org", orgID, "kind", kind)
}

// ownerContact reads the org's owner under its RLS scope (users is a tenant
// table, so the GUC must be set on the pinned connection).
func (e *Engine) ownerContact(ctx context.Context, orgID string) (email, name string, err error) {
	conn, err := e.pool.Acquire(ctx)
	if err != nil {
		return "", "", err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return "", "", err
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	var displayName *string
	err = conn.QueryRow(ctx, `
		SELECT email, display_name FROM users
		WHERE organization_id = $1 AND is_active AND email_verified_at IS NOT NULL
		ORDER BY created_at LIMIT 1`, orgID).Scan(&email, &displayName)
	if err != nil {
		return "", "", err
	}
	name = email
	if displayName != nil && *displayName != "" {
		name = *displayName
	}
	return email, name, nil
}

// daysLeft rounds the remaining time up to whole days, matching the trial
// banner's arithmetic so the email and the UI never disagree.
func daysLeft(until time.Duration) int {
	d := int(math.Ceil(until.Hours() / 24))
	if d < 0 {
		return 0
	}
	return d
}
