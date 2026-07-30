package integration

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/shared/outbox"
)

// The outbox is the seam between the database and Redis Streams, and its
// documented recovery rule is "if Redis is unavailable, events stay
// published=FALSE and are re-published next cycle". That is at-least-once
// delivery, and it only stays safe if the normal path really does publish each
// event once — a publisher that re-sent every event on every poll would turn
// "at least once" into "every five seconds, forever".
//
// These run the real Publisher against the real Postgres and an in-process
// Redis, because the guarantee is in the interaction, not in either half.

func newTestPublisher(t *testing.T) (*outbox.Publisher, *miniredis.Miniredis) {
	t.Helper()

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	// Discard the publisher's own logging; the assertions are on state.
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return outbox.NewPublisher(adminPool, rdb, logger), mr
}

// seedEvent inserts one unpublished domain event and returns its id.
func seedEvent(t *testing.T, orgID, eventType string) string {
	t.Helper()
	var id string
	if err := adminPool.QueryRow(context.Background(), `
		INSERT INTO domain_events (organization_id, aggregate_type, aggregate_id, event_type, payload)
		VALUES ($1, 'patient', gen_random_uuid(), $2, '{"k":"v"}')
		RETURNING id`, orgID, eventType,
	).Scan(&id); err != nil {
		t.Fatalf("seed domain event: %v", err)
	}
	return id
}

// runOnePoll starts the publisher and stops it after one poll cycle has fired.
// The interval is unexported (5s), so the window is generous rather than tight.
func runOnePoll(t *testing.T, p *outbox.Publisher) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()

	done := make(chan struct{})
	go func() {
		p.Run(ctx)
		close(done)
	}()
	<-ctx.Done()
	<-done
}

func TestOutboxPublishesEachEventExactlyOnce(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "outbox-once")

	// Any events left over from other tests are already in the table, so the
	// assertions below are scoped to this tenant's own rows.
	ids := []string{
		seedEvent(t, tn.OrgID, "patient.created"),
		seedEvent(t, tn.OrgID, "patient.updated"),
		seedEvent(t, tn.OrgID, "patient.archived"),
	}

	p, mr := newTestPublisher(t)
	runOnePoll(t, p)

	// Every one of ours must now be marked published.
	for _, id := range ids {
		var published bool
		var publishedAt *time.Time
		if err := adminPool.QueryRow(ctx,
			`SELECT published, published_at FROM domain_events WHERE id = $1`, id,
		).Scan(&published, &publishedAt); err != nil {
			t.Fatalf("read event %s: %v", id, err)
		}
		if !published {
			t.Errorf("event %s was not marked published", id)
		}
		if publishedAt == nil {
			t.Errorf("event %s has published = TRUE but no published_at", id)
		}
	}

	countOurs := func() int {
		entries, err := mr.Stream("domain-events")
		if err != nil {
			t.Fatalf("read stream: %v", err)
		}
		var n int
		for _, e := range entries {
			for i := 0; i+1 < len(e.Values); i += 2 {
				if e.Values[i] == "event_id" {
					for _, id := range ids {
						if e.Values[i+1] == id {
							n++
						}
					}
				}
			}
		}
		return n
	}

	if got := countOurs(); got != len(ids) {
		t.Fatalf("%d of our events reached the stream, want %d", got, len(ids))
	}

	// The whole point: a second cycle must not re-send them. `published = TRUE`
	// is what takes them out of the query, so a regression here republishes
	// every historical event on every poll.
	runOnePoll(t, p)

	if got := countOurs(); got != len(ids) {
		t.Errorf("after a second poll the stream holds %d copies of our events, want %d — "+
			"the publisher is re-sending already-published events", got, len(ids))
	}
}

// TestOutboxLeavesEventsUnpublishedWhenRedisIsDown pins the documented recovery
// guarantee. The failure mode this rules out is the dangerous one: marking an
// event published when it never reached the stream, which loses it silently and
// forever.
func TestOutboxLeavesEventsUnpublishedWhenRedisIsDown(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "outbox-redis-down")
	id := seedEvent(t, tn.OrgID, "patient.created")

	p, mr := newTestPublisher(t)
	mr.Close() // Redis goes away before the first poll

	runOnePoll(t, p)

	var published bool
	if err := adminPool.QueryRow(ctx,
		`SELECT published FROM domain_events WHERE id = $1`, id,
	).Scan(&published); err != nil {
		t.Fatalf("read event: %v", err)
	}
	if published {
		t.Fatal("the event was marked published even though Redis was unreachable — " +
			"it is now lost, not retried")
	}
}

// TestOutboxRecoversAfterRedisReturns is the other half of the same guarantee:
// once Redis is back, the event that failed must go out on the next cycle
// without anyone intervening.
func TestOutboxRecoversAfterRedisReturns(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "outbox-recovery")
	id := seedEvent(t, tn.OrgID, "patient.created")

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	p := outbox.NewPublisher(adminPool, rdb, slog.New(slog.NewTextHandler(io.Discard, nil)))

	// First cycle with Redis down.
	mr.Close()
	runOnePoll(t, p)

	var published bool
	if err := adminPool.QueryRow(ctx, `SELECT published FROM domain_events WHERE id = $1`, id).Scan(&published); err != nil {
		t.Fatalf("read event: %v", err)
	}
	if published {
		t.Fatal("marked published while Redis was down")
	}

	// Bring Redis back. miniredis cannot rebind the old port, so the retry runs
	// through a fresh publisher pointed at the new one — the DB state under
	// test (published = FALSE) is what carries between the two cycles, which is
	// exactly the mechanism being verified.
	revived, err := miniredis.Run()
	if err != nil {
		t.Fatalf("restart miniredis: %v", err)
	}
	defer revived.Close()

	rdb2 := redis.NewClient(&redis.Options{Addr: revived.Addr()})
	t.Cleanup(func() { _ = rdb2.Close() })
	p2 := outbox.NewPublisher(adminPool, rdb2, slog.New(slog.NewTextHandler(io.Discard, nil)))

	runOnePoll(t, p2)

	if err := adminPool.QueryRow(ctx, `SELECT published FROM domain_events WHERE id = $1`, id).Scan(&published); err != nil {
		t.Fatalf("read event: %v", err)
	}
	if !published {
		t.Error("the event was never re-published after Redis came back")
	}
}
