package outbox

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	streamName  = "domain-events"
	batchSize   = 100
	pollInterval = 5 * time.Second
)

// Publisher polls domain_events WHERE published = FALSE and publishes each batch
// to Redis Streams. It then marks the events as published.
//
// This runs as a goroutine inside core-api — no separate process needed in Bootstrap.
// Recovery guarantee: if Redis is unavailable, events remain published=FALSE in
// PostgreSQL and will be re-published on the next poll cycle after Redis recovers.
type Publisher struct {
	pool   *pgxpool.Pool
	redis  *redis.Client
	logger *slog.Logger
}

func NewPublisher(pool *pgxpool.Pool, rdb *redis.Client, logger *slog.Logger) *Publisher {
	return &Publisher{pool: pool, redis: rdb, logger: logger}
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (p *Publisher) Run(ctx context.Context) {
	p.logger.Info("outbox publisher started", "stream", streamName, "poll_interval", pollInterval)
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("outbox publisher stopped")
			return
		case <-ticker.C:
			if err := p.publishBatch(ctx); err != nil {
				p.logger.Error("outbox publish batch failed", "err", err)
			}
		}
	}
}

type event struct {
	ID            string          `db:"id"`
	AggregateType string          `db:"aggregate_type"`
	AggregateID   string          `db:"aggregate_id"`
	EventType     string          `db:"event_type"`
	Payload       json.RawMessage `db:"payload"`
	OccurredAt    time.Time       `db:"occurred_at"`
}

func (p *Publisher) publishBatch(ctx context.Context) error {
	rows, err := p.pool.Query(ctx, `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, occurred_at
		FROM domain_events
		WHERE published = FALSE
		ORDER BY occurred_at
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`, batchSize)
	if err != nil {
		return err
	}
	defer rows.Close()

	var events []event
	var ids []string

	for rows.Next() {
		var e event
		if err := rows.Scan(&e.ID, &e.AggregateType, &e.AggregateID, &e.EventType, &e.Payload, &e.OccurredAt); err != nil {
			return err
		}
		events = append(events, e)
		ids = append(ids, e.ID)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(events) == 0 {
		return nil
	}

	// Publish to Redis Streams
	pipe := p.redis.Pipeline()
	for _, e := range events {
		pipe.XAdd(ctx, &redis.XAddArgs{
			Stream: streamName,
			ID:     "*", // auto-generate stream ID
			Values: map[string]any{
				"event_id":       e.ID,
				"aggregate_type": e.AggregateType,
				"aggregate_id":   e.AggregateID,
				"event_type":     e.EventType,
				"payload":        string(e.Payload),
				"occurred_at":    e.OccurredAt.Format(time.RFC3339),
			},
		})
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}

	// Mark as published — only after successful Redis write
	_, err = p.pool.Exec(ctx, `
		UPDATE domain_events
		SET published = TRUE, published_at = NOW()
		WHERE id = ANY($1::uuid[])
	`, ids)
	if err != nil {
		return err
	}

	p.logger.Info("outbox batch published", "count", len(events))
	return nil
}
