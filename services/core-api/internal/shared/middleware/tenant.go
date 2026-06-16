package middleware

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/dbctx"
)

// gucResetSQL clears the org GUC before a pooled connection is reused, so a
// recycled connection can never leak one tenant's scope into another request.
const (
	gucSetSQL   = `SELECT set_config('app.current_org', $1, false)`
	gucResetSQL = `SELECT set_config('app.current_org', '', false)`
)

// TenantScope pins a pooled connection for the duration of the request and sets
// the app.current_org GUC from the authenticated claims, so Row-Level Security
// policies scope every query to the caller's organization. It must be composed
// AFTER RequireAuth. Requests without claims (should not happen on protected
// routes) pass through on the shared pool unchanged.
func TenantScope(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFromContext(r.Context())
			if claims == nil || claims.OrganizationID == "" {
				next.ServeHTTP(w, r)
				return
			}

			conn, err := pool.Acquire(r.Context())
			if err != nil {
				http.Error(w, "database unavailable", http.StatusServiceUnavailable)
				return
			}
			defer func() {
				// Best-effort reset so the connection returns to the pool clean.
				_, _ = conn.Exec(context.Background(), gucResetSQL)
				conn.Release()
			}()

			if _, err := conn.Exec(r.Context(), gucSetSQL, claims.OrganizationID); err != nil {
				http.Error(w, "database unavailable", http.StatusServiceUnavailable)
				return
			}

			ctx := dbctx.WithQuerier(r.Context(), conn)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
