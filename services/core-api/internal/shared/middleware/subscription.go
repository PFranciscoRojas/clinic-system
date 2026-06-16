package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SubscriptionGate blocks clinical access once a tenant's trial or paid period
// has lapsed, returning 402 Payment Required so the SPA can show a reactivation
// screen. Access to a tenant's own data export stays open at all times (legal
// duty of custody, Res. 1995/1999), as does the operator console; the SaaS
// operator (SYSTEM_ADMIN) is never gated.
//
// Entitlement is intentionally decoupled from any payment provider: a row is
// entitled whenever its status is active/trialing and its access deadline is in
// the future — regardless of whether that was set by a gateway webhook or a
// manual activation by the operator (cash/transfer). On any lookup error the
// gate fails open, so an infrastructure hiccup never locks a paying tenant out.
func SubscriptionGate(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			// Always-open: data export (custody) and the operator console.
			if strings.HasSuffix(path, "/export") || strings.HasPrefix(path, "/api/v1/admin") {
				next.ServeHTTP(w, r)
				return
			}

			claims := ClaimsFromContext(r.Context())
			if claims == nil || claims.OrganizationID == "" {
				next.ServeHTTP(w, r) // RequireAuth/TenantScope already handle this
				return
			}
			// The operator is never gated.
			for _, role := range claims.Roles {
				if role == "SYSTEM_ADMIN" {
					next.ServeHTTP(w, r)
					return
				}
			}

			var status string
			var accessUntil *time.Time
			err := pool.QueryRow(r.Context(),
				`SELECT subscription_status, COALESCE(current_period_end, trial_ends_at)
				 FROM organizations WHERE id = $1`,
				claims.OrganizationID,
			).Scan(&status, &accessUntil)
			if err != nil {
				next.ServeHTTP(w, r) // fail open on lookup error
				return
			}

			if !Entitled(status, accessUntil) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				_, _ = w.Write([]byte(`{"error":"subscription_required"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Entitled reports whether a tenant may use the product: an active or trialing
// status whose access deadline has not passed. Shared so /me reports the same
// truth the gate enforces.
func Entitled(status string, accessUntil *time.Time) bool {
	if status != "active" && status != "trialing" {
		return false
	}
	return accessUntil != nil && accessUntil.After(time.Now())
}
