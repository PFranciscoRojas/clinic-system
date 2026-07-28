package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/shared/middleware"
	"sghcp/core-api/internal/shared/token"
)

// The middleware unit tests (internal/shared/middleware) cover every branch that
// can be reached without a database. These cover the ones that cannot — and
// those happen to be the two that matter most: TenantScope is the single
// enforcement point for CLAUDE.md rule 2, and it is only meaningful against a
// server that actually applies RLS.

var mwJWTSecret = []byte("integration-test-secret")

func claimsFor(orgID string, roles ...string) *token.Claims {
	return &token.Claims{
		UserID:         "00000000-0000-0000-0000-000000000001",
		OrganizationID: orgID,
		Roles:          roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
}

// serveWithClaims runs the handler through the real chain — RequireAuth first,
// then the middleware under test — with a genuinely signed token, so nothing
// here depends on a test-only way to fake authentication.
func serveWithClaims(mw func(http.Handler) http.Handler, path string, claims *token.Claims, h http.Handler) *httptest.ResponseRecorder {
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(mwJWTSecret)
	if err != nil {
		panic("sign test token: " + err.Error())
	}

	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	rec := httptest.NewRecorder()

	middleware.RequireAuth(mwJWTSecret)(mw(h)).ServeHTTP(rec, req)
	return rec
}

// TestTenantScopeIsolatesTenants is the end-to-end proof of rule 2: the same
// handler, the same query, two organizations, and neither can see the other.
func TestTenantScopeIsolatesTenants(t *testing.T) {
	skipIfShort(t)

	a := seedTenant(t, "mw-scope-a")
	b := seedTenant(t, "mw-scope-b")

	countPatients := func(orgID string) (int, int) {
		var seen, code int
		h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			q := dbctx.From(r.Context(), nil)
			if q == nil {
				t.Error("TenantScope did not inject a querier")
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			if err := q.QueryRow(r.Context(), `SELECT count(*) FROM patients`).Scan(&seen); err != nil {
				t.Errorf("count patients: %v", err)
			}
			w.WriteHeader(http.StatusOK)
		})
		rec := serveWithClaims(middleware.TenantScope(appPool), "/api/v1/patients", claimsFor(orgID), h)
		code = rec.Code
		return seen, code
	}

	if got, code := countPatients(a.OrgID); got != 1 || code != http.StatusOK {
		t.Errorf("org A saw %d patients (status %d), want exactly its own 1", got, code)
	}
	if got, code := countPatients(b.OrgID); got != 1 || code != http.StatusOK {
		t.Errorf("org B saw %d patients (status %d), want exactly its own 1", got, code)
	}

	// And the specific row: a count of 1 could still be the wrong tenant's row.
	var seenID string
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = dbctx.From(r.Context(), nil).
			QueryRow(r.Context(), `SELECT id FROM patients LIMIT 1`).Scan(&seenID)
		w.WriteHeader(http.StatusOK)
	})
	serveWithClaims(middleware.TenantScope(appPool), "/api/v1/patients", claimsFor(a.OrgID), h)
	if seenID != a.PatientID {
		t.Errorf("org A saw patient %s, want its own %s", seenID, a.PatientID)
	}
}

// TestTenantScopeClearsTheGUCOnRelease: the connection goes back to a shared
// pool. If the GUC survived, the next request to reuse that connection would
// silently inherit the previous tenant's scope — the worst possible bug in a
// multi-tenant system, and one that only shows up under load.
func TestTenantScopeClearsTheGUCOnRelease(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	a := seedTenant(t, "mw-guc-reset")

	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var org string
		if err := dbctx.From(r.Context(), nil).
			QueryRow(r.Context(), `SELECT COALESCE(current_setting('app.current_org', true), '')`).Scan(&org); err != nil {
			t.Errorf("read GUC inside the request: %v", err)
		}
		if org != a.OrgID {
			t.Errorf("inside the request app.current_org = %q, want %q", org, a.OrgID)
		}
		w.WriteHeader(http.StatusOK)
	})
	if rec := serveWithClaims(middleware.TenantScope(appPool), "/api/v1/patients", claimsFor(a.OrgID), h); rec.Code != http.StatusOK {
		t.Fatalf("request failed with %d", rec.Code)
	}

	// Drain the pool: whichever connection served the request is among these,
	// so checking all of them is deterministic rather than a race for the
	// right one.
	maxConns := int(appPool.Config().MaxConns)
	conns := make([]interface {
		Release()
	}, 0, maxConns)
	defer func() {
		for _, c := range conns {
			c.Release()
		}
	}()

	for i := 0; i < maxConns; i++ {
		conn, err := appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection %d: %v", i, err)
		}
		conns = append(conns, conn)

		var org string
		if err := conn.QueryRow(ctx, `SELECT COALESCE(current_setting('app.current_org', true), '')`).Scan(&org); err != nil {
			t.Fatalf("read GUC on pooled connection %d: %v", i, err)
		}
		if org != "" {
			t.Fatalf("connection %d returned to the pool still scoped to org %q", i, org)
		}
	}
}

func setSubscription(t *testing.T, orgID, status string, until *time.Time) {
	t.Helper()
	if _, err := adminPool.Exec(context.Background(),
		`UPDATE organizations SET subscription_status = $2, current_period_end = $3, trial_ends_at = NULL
		 WHERE id = $1`, orgID, status, until,
	); err != nil {
		t.Fatalf("set subscription: %v", err)
	}
}

func TestSubscriptionGateAgainstTheDatabase(t *testing.T) {
	skipIfShort(t)

	future := time.Now().Add(30 * 24 * time.Hour)
	past := time.Now().Add(-time.Hour)

	cases := []struct {
		name   string
		status string
		until  *time.Time
		want   int
	}{
		{"active and paid up", "active", &future, http.StatusOK},
		{"trial still running", "trialing", &future, http.StatusOK},
		{"trial expired", "trialing", &past, http.StatusPaymentRequired},
		{"period lapsed", "active", &past, http.StatusPaymentRequired},
		{"cancelled", "canceled", &future, http.StatusPaymentRequired},
		{"past due", "past_due", &future, http.StatusPaymentRequired},
	}

	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// A fresh tenant per case: the gate caches per organization for
			// 60s, so reusing one org would have earlier cases decide later
			// ones.
			tn := seedTenant(t, "mw-sub-"+string(rune('a'+i)))
			setSubscription(t, tn.OrgID, tc.status, tc.until)

			var reached bool
			h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				reached = true
				w.WriteHeader(http.StatusOK)
			})
			rec := serveWithClaims(middleware.SubscriptionGate(appPool), "/api/v1/patients",
				claimsFor(tn.OrgID, "PROFESSIONAL"), h)

			if rec.Code != tc.want {
				t.Errorf("status = %d, want %d (body %q)", rec.Code, tc.want, rec.Body.String())
			}
			if reached != (tc.want == http.StatusOK) {
				t.Errorf("handler reached = %v, want %v", reached, tc.want == http.StatusOK)
			}
			if tc.want == http.StatusPaymentRequired {
				if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
					t.Errorf("Content-Type = %q, want application/json — the SPA parses this body", ct)
				}
				if body := rec.Body.String(); body != `{"error":"subscription_required"}` {
					t.Errorf("body = %q, want the subscription_required payload", body)
				}
			}
		})
	}
}

// TestSubscriptionGateFallsBackToTrialEndsAt: the SQL coalesces
// current_period_end with trial_ends_at, so a tenant that has never paid is
// still entitled for the length of its trial.
func TestSubscriptionGateFallsBackToTrialEndsAt(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "mw-sub-trial-fallback")
	if _, err := adminPool.Exec(context.Background(),
		`UPDATE organizations SET subscription_status = 'trialing',
		        current_period_end = NULL, trial_ends_at = $2 WHERE id = $1`,
		tn.OrgID, time.Now().Add(7*24*time.Hour),
	); err != nil {
		t.Fatalf("set trial: %v", err)
	}

	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	rec := serveWithClaims(middleware.SubscriptionGate(appPool), "/api/v1/patients",
		claimsFor(tn.OrgID, "PROFESSIONAL"), h)

	if rec.Code != http.StatusOK {
		t.Errorf("a tenant inside its trial was gated with %d", rec.Code)
	}
}

// TestSubscriptionGateCachesTheLookup pins the documented 60s TTL: a status
// flip is not seen immediately. Worth an explicit test because it is the
// behaviour that will look like a bug to whoever reactivates a tenant by hand
// and expects it to take effect on the next click.
func TestSubscriptionGateCachesTheLookup(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "mw-sub-cache")
	past := time.Now().Add(-time.Hour)
	setSubscription(t, tn.OrgID, "canceled", &past)

	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	gate := middleware.SubscriptionGate(appPool) // one instance, one cache

	if rec := serveWithClaims(gate, "/api/v1/patients", claimsFor(tn.OrgID, "PROFESSIONAL"), h); rec.Code != http.StatusPaymentRequired {
		t.Fatalf("first request = %d, want 402", rec.Code)
	}

	future := time.Now().Add(30 * 24 * time.Hour)
	setSubscription(t, tn.OrgID, "active", &future)

	if rec := serveWithClaims(gate, "/api/v1/patients", claimsFor(tn.OrgID, "PROFESSIONAL"), h); rec.Code != http.StatusPaymentRequired {
		t.Errorf("status = %d; the cached entry should still deny for up to 60s after reactivation", rec.Code)
	}

	// A gate with a cold cache sees the new status immediately, which proves
	// the row really did change and the staleness above is the cache, not a
	// failed UPDATE.
	if rec := serveWithClaims(middleware.SubscriptionGate(appPool), "/api/v1/patients", claimsFor(tn.OrgID, "PROFESSIONAL"), h); rec.Code != http.StatusOK {
		t.Errorf("a cold gate returned %d after reactivation, want 200", rec.Code)
	}
}

// TestSubscriptionGateDeniesMidTTLWhenTheDeadlinePasses: the cache holds the
// status, but Entitled re-checks the wall clock on every request, so a period
// that lapses between lookups is denied without waiting out the TTL.
func TestSubscriptionGateDeniesMidTTLWhenTheDeadlinePasses(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "mw-sub-midttl")
	soon := time.Now().Add(400 * time.Millisecond)
	setSubscription(t, tn.OrgID, "active", &soon)

	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	gate := middleware.SubscriptionGate(appPool)

	if rec := serveWithClaims(gate, "/api/v1/patients", claimsFor(tn.OrgID, "PROFESSIONAL"), h); rec.Code != http.StatusOK {
		t.Fatalf("request before the deadline = %d, want 200", rec.Code)
	}

	time.Sleep(700 * time.Millisecond) // still well inside the 60s cache TTL

	if rec := serveWithClaims(gate, "/api/v1/patients", claimsFor(tn.OrgID, "PROFESSIONAL"), h); rec.Code != http.StatusPaymentRequired {
		t.Errorf("status = %d after the period lapsed, want 402 — the deadline must be "+
			"re-evaluated per request, not cached with the status", rec.Code)
	}
}
