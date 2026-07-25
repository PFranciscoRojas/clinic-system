package audit

import (
	"context"
	"log/slog"
	"net"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/hash"
	"sghcp/core-api/internal/shared/middleware"
)

// Writer records security-relevant events in audit_log.
// Writes are async and best-effort: auditing must never block or fail the
// clinical flow. audit_log is append-only at the DB-permission level.
type Writer struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Writer {
	return &Writer{pool: pool}
}

// Record writes one audit entry derived from an authenticated request.
// resourceID may be empty when the action is not tied to a single resource.
func (w *Writer) Record(r *http.Request, action, resourceType, resourceID string) {
	w.RecordWithReason(r, action, resourceType, resourceID, "")
}

// RecordWithReason is like Record but also stores the accessing user's roles
// snapshot and an explicit justification string in the audit_log metadata.
// Used for break-the-glass access (Ley 23/1981 — Res. 1995/1999 audit trail).
func (w *Writer) RecordWithReason(r *http.Request, action, resourceType, resourceID, reason string) {
	w.record(r, action, resourceType, resourceID, reason, true)
}

// record is the single insert path. success=false marks a refused access —
// the entry then documents that the system denied the request, which is the
// half of the trail an "it never happened" claim cannot dispute.
func (w *Writer) record(r *http.Request, action, resourceType, resourceID, reason string, success bool) {
	if w == nil || w.pool == nil {
		return
	}
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		return
	}

	orgID := claims.OrganizationID
	userID := claims.UserID
	emailHash := hash.Normalize(claims.Email)
	userAgent := r.UserAgent()
	roles := claims.Roles
	// RemoteAddr is already the real client IP: chimiddleware.RealIP runs first
	// on every route and rewrites it from X-Forwarded-For, validating the value
	// so a malformed header cannot reach the ::inet cast. Do not "fix" this to
	// re-read the headers here — it would only duplicate that middleware.
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}

	go func() {
		var resID *string
		if resourceID != "" {
			resID = &resourceID
		}
		var metadata *string
		if reason != "" {
			s := `{"reason":"` + reason + `"}`
			metadata = &s
		}
		_, err := w.pool.Exec(context.Background(), `
			INSERT INTO audit_log
				(organization_id, user_id, user_email_hash, action, resource_type,
				 resource_id, ip_address, user_agent, success,
				 user_roles_snapshot, metadata)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::inet, $8, $9,
			        $10, $11::jsonb)
		`, orgID, userID, emailHash, action, resourceType, resID, ip, userAgent,
			success, roles, metadata)
		if err != nil {
			slog.Error("audit write failed", "action", action, "resource_type", resourceType, "err", err)
		}
	}()
}
