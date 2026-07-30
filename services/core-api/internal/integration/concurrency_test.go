package integration

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Torture tests: the bugs a unit test never sees because it runs one thing at a
// time. Everything here runs against the real Postgres from the integration
// harness, because the guarantees being tested are the database's — a mock
// would just confirm the mock.

// TestConcurrentBookingHoldsOnlyOneWins is the headline case. Two patients on
// the public booking page click "pay" on the last free slot at the same
// instant. Both requests read availability, both see the slot free, and both
// try to hold it. Exactly one may win, or the clinic sells the same hour twice
// and has to call someone to apologise.
//
// The guarantee lives in uq_bookings_active_slot (migration 000060), a partial
// unique index on (staff_id, scheduled_at) WHERE status = 'PENDING_PAYMENT'.
// The application's ON CONFLICT DO NOTHING is what turns the race into a clean
// 409 instead of a 500.
func TestConcurrentBookingHoldsOnlyOneWins(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "race-booking-hold")
	slot := time.Now().Add(72 * time.Hour).Truncate(time.Hour)

	const racers = 24
	var (
		mu      sync.Mutex
		winners []string
		start   = make(chan struct{})
		wg      sync.WaitGroup
	)

	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start // release everyone at once

			var id string
			err := adminPool.QueryRow(ctx, `
				INSERT INTO bookings (
				    organization_id, staff_id, scheduled_at, modality,
				    guest_name, email, phone, amount,
				    hold_expires_at, policy_accepted_at
				) VALUES ($1, $2, $3, 'VIRTUAL', $4, $5, '3000000000', 80000,
				          NOW() + interval '15 minutes', NOW())
				ON CONFLICT (staff_id, scheduled_at) WHERE status = 'PENDING_PAYMENT' DO NOTHING
				RETURNING id`,
				tn.OrgID, tn.UserID, slot,
				fmt.Sprintf("Paciente %d", i), fmt.Sprintf("p%d@race.test", i),
			).Scan(&id)
			if err == nil {
				mu.Lock()
				winners = append(winners, id)
				mu.Unlock()
			}
		}(i)
	}

	close(start)
	wg.Wait()

	if len(winners) != 1 {
		t.Fatalf("%d of %d concurrent holds succeeded, want exactly 1 — the slot was sold more than once",
			len(winners), racers)
	}

	var held int
	if err := adminPool.QueryRow(ctx,
		`SELECT count(*) FROM bookings WHERE staff_id = $1 AND scheduled_at = $2 AND status = 'PENDING_PAYMENT'`,
		tn.UserID, slot,
	).Scan(&held); err != nil {
		t.Fatalf("count holds: %v", err)
	}
	if held != 1 {
		t.Errorf("%d live holds on the slot, want 1", held)
	}
}

// TestBookingHoldFreesTheSlotOnceResolved: the unique index is partial on
// PENDING_PAYMENT, so an abandoned hold that gets cancelled must let the next
// patient in. If the index were unconditional, one abandoned checkout would
// burn the slot forever.
func TestBookingHoldFreesTheSlotOnceResolved(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "race-hold-release")
	slot := time.Now().Add(96 * time.Hour).Truncate(time.Hour)

	insert := func(email string) (string, error) {
		var id string
		err := adminPool.QueryRow(ctx, `
			INSERT INTO bookings (
			    organization_id, staff_id, scheduled_at, modality,
			    guest_name, email, phone, amount, hold_expires_at, policy_accepted_at
			) VALUES ($1, $2, $3, 'VIRTUAL', 'Paciente', $4, '3000000000', 80000,
			          NOW() + interval '15 minutes', NOW())
			ON CONFLICT (staff_id, scheduled_at) WHERE status = 'PENDING_PAYMENT' DO NOTHING
			RETURNING id`,
			tn.OrgID, tn.UserID, slot, email,
		).Scan(&id)
		return id, err
	}

	first, err := insert("primero@race.test")
	if err != nil {
		t.Fatalf("first hold: %v", err)
	}
	if _, err := insert("segundo@race.test"); err == nil {
		t.Fatal("a second hold was accepted while the first was still live")
	}

	if _, err := adminPool.Exec(ctx,
		`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`, first); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	if _, err := insert("tercero@race.test"); err != nil {
		t.Fatalf("the slot stayed blocked after the hold was cancelled: %v", err)
	}
}

// TestConcurrentAppointmentsAreNotGuarded documents a gap rather than a
// guarantee, so that it is visible instead of assumed.
//
// `bookings` is protected by a unique index. `appointments` is not: its
// idx_appt_daily index on (staff_id, scheduled_at) is deliberately NOT unique,
// the repository's CTE only checks for a conflicting *booking hold*, and the
// service layer adds no check of its own. So two staff members creating an
// appointment for the same professional and instant from the internal agenda
// both succeed.
//
// That may well be intended — a supervisor sitting in, a group session, a
// deliberate overbook. It is not obviously a bug, which is exactly why it
// should not be silently "fixed" from a test. Production currently has zero
// double-booked slots.
//
// If a uniqueness rule is ever added, this test fails and says so.
func TestConcurrentAppointmentsAreNotGuarded(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "race-appointment")
	slot := time.Now().Add(120 * time.Hour).Truncate(time.Hour)

	insert := func() error {
		_, err := adminPool.Exec(ctx, `
			INSERT INTO appointments (organization_id, patient_id, staff_id, scheduled_at, duration_min, modality)
			VALUES ($1, $2, $3, $4, 50, 'VIRTUAL')`,
			tn.OrgID, tn.PatientID, tn.UserID, slot)
		return err
	}

	if err := insert(); err != nil {
		t.Fatalf("first appointment: %v", err)
	}
	err := insert()

	if err != nil {
		t.Fatalf("a second appointment on the same slot was rejected (%v).\n"+
			"That is arguably the better behaviour, but it is a change: update this "+
			"test, and check that legitimate overbooking (supervision, group sessions) "+
			"still works.", err)
	}

	var n int
	if err := adminPool.QueryRow(ctx,
		`SELECT count(*) FROM appointments WHERE staff_id = $1 AND scheduled_at = $2`,
		tn.UserID, slot,
	).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Errorf("%d appointments on the slot, want 2 — this test documents that "+
			"the internal agenda permits it", n)
	}
}

// TestAppointmentCreationLosesToALiveHold covers the one conflict the
// repository CTE *does* check: an appointment must not be created on top of a
// slot a patient is mid-checkout for.
func TestAppointmentCreationLosesToALiveHold(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "race-hold-vs-appt")
	slot := time.Now().Add(144 * time.Hour).Truncate(time.Hour)

	if _, err := adminPool.Exec(ctx, `
		INSERT INTO bookings (
		    organization_id, staff_id, scheduled_at, modality,
		    guest_name, email, phone, amount, hold_expires_at, policy_accepted_at
		) VALUES ($1, $2, $3, 'VIRTUAL', 'En pago', 'pago@race.test', '3000000000', 80000,
		          NOW() + interval '15 minutes', NOW())`,
		tn.OrgID, tn.UserID, slot,
	); err != nil {
		t.Fatalf("seed hold: %v", err)
	}

	// The same CTE the repository runs: the INSERT is skipped when a live hold
	// overlaps, so the check and the write are one statement and cannot race.
	var id string
	err := adminPool.QueryRow(ctx, `
		WITH hold_conflict AS (
			SELECT 1 FROM bookings
			WHERE staff_id = $3
			  AND status = 'PENDING_PAYMENT'
			  AND hold_expires_at > NOW()
			  AND scheduled_at < $4::timestamptz + (50 * interval '1 minute')
			  AND scheduled_at + (duration_min * interval '1 minute') > $4::timestamptz
			LIMIT 1
		),
		ins AS (
			INSERT INTO appointments (organization_id, patient_id, staff_id, scheduled_at, duration_min, modality)
			SELECT $1, $2, $3, $4::timestamptz, 50, 'VIRTUAL'
			WHERE NOT EXISTS (SELECT 1 FROM hold_conflict)
			RETURNING id
		)
		SELECT id FROM ins`,
		tn.OrgID, tn.PatientID, tn.UserID, slot,
	).Scan(&id)

	if err == nil {
		t.Fatal("an appointment was created on a slot with a live payment hold")
	}
	if !strings.Contains(err.Error(), "no rows") {
		t.Errorf("rejected for the wrong reason: %v", err)
	}
}

// TestRLSHoldsUnderConcurrency is the multi-tenant nightmare scenario: two
// organizations hammering the same connection pool at once. Connections are
// recycled between requests, so if the app.current_org GUC were ever set on a
// connection that another tenant then picked up, one clinic would read
// another's patients — and it would only happen under load, which is exactly
// when nobody is looking.
func TestRLSHoldsUnderConcurrency(t *testing.T) {
	skipIfShort(t)

	a := seedTenant(t, "race-rls-a")
	b := seedTenant(t, "race-rls-b")

	// Each tenant does the same thing the TenantScope middleware does: acquire
	// a connection, set the GUC, query, reset, release.
	countAs := func(orgID string) (int, error) {
		ctx := context.Background()
		conn, err := appPool.Acquire(ctx)
		if err != nil {
			return 0, err
		}
		defer func() {
			_, _ = conn.Exec(context.Background(), `SELECT set_config('app.current_org', '', false)`)
			conn.Release()
		}()
		if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
			return 0, err
		}
		var n int
		err = conn.QueryRow(ctx, `SELECT count(*) FROM patients WHERE organization_id = $1`, orgID).Scan(&n)
		return n, err
	}

	const rounds = 60
	var (
		wg   sync.WaitGroup
		mu   sync.Mutex
		bad  []string
		orgs = map[string]string{"A": a.OrgID, "B": b.OrgID}
	)

	for name, orgID := range orgs {
		for i := 0; i < rounds; i++ {
			wg.Add(1)
			go func(name, orgID string) {
				defer wg.Done()
				n, err := countAs(orgID)
				if err != nil {
					mu.Lock()
					bad = append(bad, fmt.Sprintf("tenant %s: %v", name, err))
					mu.Unlock()
					return
				}
				// Each seeded tenant has exactly one patient. Anything else means
				// the scope was wrong for this query.
				if n != 1 {
					mu.Lock()
					bad = append(bad, fmt.Sprintf("tenant %s saw %d patients, want 1", name, n))
					mu.Unlock()
				}
			}(name, orgID)
		}
	}
	wg.Wait()

	if len(bad) > 0 {
		t.Fatalf("%d of %d scoped reads went wrong under concurrency:\n%s",
			len(bad), rounds*2, strings.Join(bad[:min(len(bad), 10)], "\n"))
	}
}

// TestNoConnectionReturnsToThePoolScoped is the other half: after all that
// traffic, every connection in the pool must be back to an empty scope. A
// connection that kept a GUC would hand the next request the previous tenant's
// view — under FORCE RLS that reads as data, not as an error.
func TestNoConnectionReturnsToThePoolScoped(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	tn := seedTenant(t, "race-guc-drain")

	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, err := appPool.Acquire(ctx)
			if err != nil {
				return
			}
			_, _ = conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, tn.OrgID)
			var n int
			_ = conn.QueryRow(ctx, `SELECT count(*) FROM patients`).Scan(&n)
			_, _ = conn.Exec(context.Background(), `SELECT set_config('app.current_org', '', false)`)
			conn.Release()
		}()
	}
	wg.Wait()

	// Drain the pool so every connection is inspected, rather than racing for
	// whichever one happens to come back first.
	maxConns := int(appPool.Config().MaxConns)
	held := make([]*pgxpool.Conn, 0, maxConns)
	defer func() {
		for _, c := range held {
			c.Release()
		}
	}()

	for i := 0; i < maxConns; i++ {
		conn, err := appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire %d: %v", i, err)
		}
		held = append(held, conn)

		var org string
		if err := conn.QueryRow(ctx,
			`SELECT COALESCE(current_setting('app.current_org', true), '')`).Scan(&org); err != nil {
			t.Fatalf("read GUC on connection %d: %v", i, err)
		}
		if org != "" {
			t.Fatalf("connection %d came back scoped to %q", i, org)
		}
	}
}
