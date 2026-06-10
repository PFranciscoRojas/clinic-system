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

	// Without a reverse proxy, RemoteAddr is "ip:port" and the ::inet cast
	// rejects it — strip the port so audits never silently vanish.
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}

	go func() {
		var resID *string
		if resourceID != "" {
			resID = &resourceID
		}
		_, err := w.pool.Exec(context.Background(), `
			INSERT INTO audit_log
				(organization_id, user_id, user_email_hash, action, resource_type,
				 resource_id, ip_address, user_agent, success)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::inet, $8, true)
		`, orgID, userID, emailHash, action, resourceType, resID, ip, userAgent)
		if err != nil {
			slog.Error("audit write failed", "action", action, "resource_type", resourceType, "err", err)
		}
	}()
}
