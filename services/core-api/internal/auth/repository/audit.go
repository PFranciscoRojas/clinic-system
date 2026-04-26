package repository

import (
	"context"

	"sghcp/core-api/internal/auth"
)

// WriteAuditLog is best-effort — errors are silently dropped so that an audit
// failure never cascades into a failed login response.
func (r *Repository) WriteAuditLog(ctx context.Context, e auth.AuditEntry) {
	r.db.Exec(ctx, `
		INSERT INTO audit_log
			(organization_id, user_id, user_email_hash, action, resource_type,
			 ip_address, user_agent, success, error_code)
		VALUES
			($1::uuid, $2::uuid, $3, $4, $5, $6::inet, $7, $8, $9)
	`,
		nullableUUID(e.OrgID),
		nullableUUID(e.UserID),
		e.EmailHash,
		e.Action,
		e.ResourceType,
		nullableText(e.IP),
		nullableText(e.UserAgent),
		e.Success,
		e.ErrorCode,
	)
}
