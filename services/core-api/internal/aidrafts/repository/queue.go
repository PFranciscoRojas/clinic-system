package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/dbctx"
)

// QueueEstimate reads this draft's position in the shared worker queue.
//
// The call goes through ai_queue_estimate() (migration 000076) rather than a
// plain SELECT because the queue is global and RLS is not: a tenant-scoped
// count would report an empty queue while another clinic's hour of audio is
// being transcribed, and quote a wait that is off by forty minutes. The
// function returns aggregates only, so nothing about the other tenants crosses
// with it.
func (r *Repository) QueueEstimate(ctx context.Context, draftID string) (*aidrafts.QueueEstimate, error) {
	var q aidrafts.QueueEstimate
	err := dbctx.From(ctx, r.db).QueryRow(ctx,
		`SELECT jobs_ahead, bytes_ahead, unknown_ahead, own_bytes, p50_rtf
		   FROM ai_queue_estimate($1)`, draftID,
	).Scan(&q.JobsAhead, &q.BytesAhead, &q.UnknownAhead, &q.OwnBytes, &q.P50RTF)
	if errors.Is(err, pgx.ErrNoRows) {
		// The function returns no row for a draft id it cannot find. The caller
		// has already read the draft under RLS, so this means it was deleted
		// between the two queries — not an error worth failing a poll over.
		return nil, aidrafts.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("ai draft queue estimate: %w", err)
	}
	return &q, nil
}
