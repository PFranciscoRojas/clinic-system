package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/token"
)

// SubscriptionGate decides whether a tenant may reach clinical data. Two
// opposite mistakes are possible and both are expensive: gating a paying
// customer out, and gating a lapsed one in. The always-open list is the part
// with legal weight — Res. 1995/1999 makes the professional the custodian of
// the clinical history, so billing must never block the export.

func TestEntitled(t *testing.T) {
	future := time.Now().Add(24 * time.Hour)
	past := time.Now().Add(-time.Second)

	cases := []struct {
		name        string
		status      string
		accessUntil *time.Time
		want        bool
	}{
		{"active with a future deadline", "active", &future, true},
		{"trialing with a future deadline", "trialing", &future, true},
		{"active but the period already ended", "active", &past, false},
		{"trial already ended", "trialing", &past, false},
		{"active with no deadline at all", "active", nil, false},
		{"trialing with no deadline at all", "trialing", nil, false},
		{"cancelled", "canceled", &future, false},
		{"past due", "past_due", &future, false},
		{"unpaid", "unpaid", &future, false},
		{"empty status", "", &future, false},
		// Status is compared exactly: a gateway that starts sending "Active"
		// must fail closed rather than silently entitle everyone.
		{"capitalised status", "Active", &future, false},
		{"status with whitespace", " active", &future, false},
		{"unknown status invented by a provider", "incomplete_expired", &future, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Entitled(tc.status, tc.accessUntil); got != tc.want {
				t.Errorf("Entitled(%q, %v) = %v, want %v", tc.status, tc.accessUntil, got, tc.want)
			}
		})
	}
}

// TestEntitledAtTheExactDeadline pins the boundary: After() is strict, so a
// deadline that has just passed is not entitled.
func TestEntitledAtTheExactDeadline(t *testing.T) {
	justPassed := time.Now().Add(-time.Nanosecond)
	if Entitled("active", &justPassed) {
		t.Error("a deadline one nanosecond in the past was treated as entitled")
	}
	stillAhead := time.Now().Add(time.Hour)
	if !Entitled("active", &stillAhead) {
		t.Error("a deadline an hour ahead was treated as lapsed")
	}
}

func TestIsDataExport(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/v1/patients/export", true},
		{"/api/v1/patients/export.zip", true},
		{"/api/v1/clinical/export.csv", true},
		// A bare Contains would open all of these. They must stay gated.
		{"/api/v1/patients/export/schedule", false},
		{"/api/v1/exports", false},
		{"/api/v1/export-settings", false},
		{"/api/v1/patients/exportable", false},
		{"/api/v1/patients", false},
		{"/", false},
		{"", false},
		{"/api/v1/patients/EXPORT", false},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			if got := isDataExport(tc.path); got != tc.want {
				t.Errorf("isDataExport(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}

// unreachablePool is a pool whose DSN points at a port nothing listens on.
// Every query fails, which is exactly the fail-open branch the gate documents:
// an infrastructure hiccup must never lock a paying tenant out. Using a real
// pool rather than an interface keeps the production signature untouched.
func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	cfg, err := pgxpool.ParseConfig("postgres://nobody:nobody@127.0.0.1:1/nodb?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatalf("parse dsn: %v", err)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("new pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// TestSubscriptionGateAlwaysOpenPaths asserts the routes that must work even
// when the pool is dead — proof they short-circuit before any DB lookup.
func TestSubscriptionGateAlwaysOpenPaths(t *testing.T) {
	pool := unreachablePool(t)

	paths := []string{
		"/api/v1/patients/export",
		"/api/v1/patients/export.zip",
		"/api/v1/clinical/export.csv",
		"/api/v1/admin/orgs",
		"/api/v1/billing/invoices",
	}

	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			next := &nextRecorder{}
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req = req.WithContext(withClaims(req.Context(), &token.Claims{
				OrganizationID: "org-1",
				Roles:          []string{"PROFESSIONAL"},
			}))
			rec := httptest.NewRecorder()

			SubscriptionGate(pool)(next.handler()).ServeHTTP(rec, req)

			if !next.called {
				t.Errorf("%s was gated (status %d) — it must stay open regardless of subscription", path, rec.Code)
			}
		})
	}
}

func TestSubscriptionGateSkipsWithoutAnOrg(t *testing.T) {
	pool := unreachablePool(t)

	cases := []struct {
		name   string
		claims *token.Claims
	}{
		{"no claims at all", nil},
		{"claims without an organization", &token.Claims{UserID: "u1"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &nextRecorder{}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
			if tc.claims != nil {
				req = req.WithContext(withClaims(req.Context(), tc.claims))
			}
			rec := httptest.NewRecorder()

			SubscriptionGate(pool)(next.handler()).ServeHTTP(rec, req)

			if !next.called {
				t.Errorf("request was gated with %d; RequireAuth/TenantScope own this case", rec.Code)
			}
		})
	}
}

func TestSubscriptionGateNeverGatesTheOperator(t *testing.T) {
	pool := unreachablePool(t)

	next := &nextRecorder{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
	req = req.WithContext(withClaims(req.Context(), &token.Claims{
		OrganizationID: "org-1",
		Roles:          []string{"CLINIC_ADMIN", "SYSTEM_ADMIN"},
	}))
	rec := httptest.NewRecorder()

	SubscriptionGate(pool)(next.handler()).ServeHTTP(rec, req)

	if !next.called {
		t.Errorf("the SaaS operator was gated with %d", rec.Code)
	}
}

// TestSubscriptionGateFailsOpenOnLookupError is the documented behaviour, and
// the one worth pinning explicitly: it is a deliberate exception to the
// fail-closed default, so it must not be "fixed" by accident.
func TestSubscriptionGateFailsOpenOnLookupError(t *testing.T) {
	pool := unreachablePool(t)

	next := &nextRecorder{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
	req = req.WithContext(withClaims(req.Context(), &token.Claims{
		OrganizationID: "org-unreachable",
		Roles:          []string{"PROFESSIONAL"},
	}))
	rec := httptest.NewRecorder()

	SubscriptionGate(pool)(next.handler()).ServeHTTP(rec, req)

	if !next.called {
		t.Errorf("an unreachable database produced %d instead of failing open", rec.Code)
	}
}
