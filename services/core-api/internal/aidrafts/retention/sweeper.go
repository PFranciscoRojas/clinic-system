// Package retention enforces the per-professional retention window for AI
// drafts. The window lives in professional_profiles.ai_prefs.data_retain (days,
// default 180); the professional sets it in Ajustes → Asistente IA. A draft that
// was never approved is not part of the clinical record (the approved ones are
// materialized into clinical_records), so keeping it past the window is dead PII.
//
// The sweep runs as a goroutine inside core-api, mirroring reminders.Engine: it
// lists active orgs cross-tenant, then deletes within each org's RLS scope
// (ai_drafts has FORCE RLS, so the DELETE must run under app.current_org).
package retention

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Retention is measured in months; a 6 h sweep is plenty and keeps the load
// negligible. The first sweep runs at startup so a restart doesn't wait 6 h.
const sweepInterval = 6 * time.Hour

type Sweeper struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func New(pool *pgxpool.Pool, logger *slog.Logger) *Sweeper {
	return &Sweeper{pool: pool, logger: logger}
}

// Run sweeps on a ticker until ctx is cancelled. One goroutine inside core-api.
func (s *Sweeper) Run(ctx context.Context) {
	s.logger.Info("ai-draft retention sweeper started", "interval", sweepInterval)
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	s.sweep(ctx)
	for {
		select {
		case <-ctx.Done():
			s.logger.Info("ai-draft retention sweeper stopped")
			return
		case <-ticker.C:
			s.sweep(ctx)
		}
	}
}

func (s *Sweeper) sweep(ctx context.Context) {
	rows, err := s.pool.Query(ctx, `SELECT id FROM organizations WHERE is_active`)
	if err != nil {
		s.logger.Error("retention: list orgs", "err", err)
		return
	}
	var orgIDs []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			orgIDs = append(orgIDs, id)
		}
	}
	rows.Close()

	for _, orgID := range orgIDs {
		s.sweepOrg(ctx, orgID)
	}
}

// sweepOrg deletes the org's expired, unapproved drafts under its RLS scope.
// The retention window is read per professional from ai_prefs.data_retain.
func (s *Sweeper) sweepOrg(ctx context.Context, orgID string) {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	// Approved drafts are already in clinical_records and are never touched.
	// Everything else (PENDING/PROCESSING/DRAFT_READY/REJECTED/ERROR) past the
	// owning professional's window is deleted.
	tag, err := conn.Exec(ctx, `
		DELETE FROM ai_drafts d
		USING professional_profiles pp
		WHERE d.requested_by = pp.user_id
		  AND d.status <> 'APPROVED'
		  AND d.created_at < now() - (
		      COALESCE((pp.ai_prefs->>'data_retain')::int, 180) || ' days'
		  )::interval`)
	if err != nil {
		s.logger.Error("retention: delete expired drafts", "org", orgID, "err", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		s.logger.Info("retention: deleted expired drafts", "org", orgID, "count", n)
	}
}
