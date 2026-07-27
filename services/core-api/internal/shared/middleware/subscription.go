package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// entitlementTTL bounds how stale a cached subscription row may be. A change
// made by a webhook or the operator takes at most this long to be enforced —
// acceptable grace for payment gating, and it removes one SELECT per request.
const entitlementTTL = 60 * time.Second

type entitlementEntry struct {
	status      string
	accessUntil *time.Time
	fetchedAt   time.Time
}

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
// isDataExport reports whether the path is one of the tenant's own data-export
// endpoints. These stay reachable after the subscription lapses: the duty to
// conserve the clinical history is the professional's (Res. 1995/1999), so
// billing must never be what stands between them and their own archive.
// Suffixes are matched explicitly — a bare Contains would also open anything
// that merely happens to carry the word in a path segment.
func isDataExport(path string) bool {
	for _, suffix := range []string{"/export", "/export.zip", "/export.csv"} {
		if strings.HasSuffix(path, suffix) {
			return true
		}
	}
	return false
}

func SubscriptionGate(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	// One entry per organization (tenant counts are small, growth is bounded);
	// lookup errors are never cached so fail-open stays a per-request decision.
	var mu sync.Mutex
	cache := make(map[string]entitlementEntry)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			// Always-open: data export (custody), the operator console, and
			// billing (so a lapsed tenant can still pay to reactivate).
			if isDataExport(path) || strings.HasPrefix(path, "/api/v1/admin") || strings.HasPrefix(path, "/api/v1/billing") {
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

			mu.Lock()
			entry, ok := cache[claims.OrganizationID]
			mu.Unlock()
			if !ok || time.Since(entry.fetchedAt) > entitlementTTL {
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
				entry = entitlementEntry{status: status, accessUntil: accessUntil, fetchedAt: time.Now()}
				mu.Lock()
				cache[claims.OrganizationID] = entry
				mu.Unlock()
			}

			// Entitled re-evaluates the deadline against the wall clock, so a
			// period that lapses mid-TTL is denied immediately; only status
			// flips (e.g. reactivation) wait out the remaining TTL.
			if !Entitled(entry.status, entry.accessUntil) {
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
