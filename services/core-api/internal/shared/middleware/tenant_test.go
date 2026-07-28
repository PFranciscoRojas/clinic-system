package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/shared/token"
)

// TenantScope is the single enforcement point for CLAUDE.md rule 2 — every DB
// interaction goes through RLS with app.current_org set. The success path needs
// a live database and lives in internal/integration (tenant_scope_test.go); what
// is asserted here is everything that happens when the pool cannot serve the
// request, because those are the branches where a bug is silent.

func TestTenantScopePassesThroughWithoutAnOrg(t *testing.T) {
	pool := unreachablePool(t)

	cases := []struct {
		name   string
		claims *token.Claims
	}{
		{"no claims — an unprotected route", nil},
		{"claims with an empty organization", &token.Claims{UserID: "u1", OrganizationID: ""}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var called bool
			var querier dbctx.Querier
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
				querier = dbctx.From(r.Context(), nil)
				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
			if tc.claims != nil {
				req = req.WithContext(withClaims(req.Context(), tc.claims))
			}
			rec := httptest.NewRecorder()

			TenantScope(pool)(handler).ServeHTTP(rec, req)

			if !called {
				t.Fatalf("the request was blocked with %d", rec.Code)
			}
			// No org means no scoped connection: dbctx must not hand the
			// handler a querier it would then use unscoped.
			if querier != nil {
				t.Error("a querier was injected for a request with no organization")
			}
		})
	}
}

// TestTenantScopeFailsClosedWhenTheDatabaseIsUnreachable: if the connection
// cannot be pinned and the GUC cannot be set, the request must not proceed on
// the shared pool. Proceeding would run the handler's queries with no
// app.current_org — under FORCE RLS that returns zero rows, which reads as
// "this tenant has no patients" rather than as an outage.
func TestTenantScopeFailsClosedWhenTheDatabaseIsUnreachable(t *testing.T) {
	pool := unreachablePool(t)

	next := &nextRecorder{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
	req = req.WithContext(withClaims(req.Context(), &token.Claims{
		UserID:         "u1",
		OrganizationID: "22222222-2222-2222-2222-222222222222",
	}))
	rec := httptest.NewRecorder()

	TenantScope(pool)(next.handler()).ServeHTTP(rec, req)

	if next.called {
		t.Fatal("the handler ran without a tenant-scoped connection")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
}
