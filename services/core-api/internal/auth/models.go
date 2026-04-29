package auth

import "time"

// User is the auth aggregate root — loaded from DB and used by the service to
// validate credentials, check lockout state, and build JWT claims.
type User struct {
	ID             string
	OrganizationID string
	PasswordHash   string
	IsActive       bool
	FailedAttempts int
	LockedUntil    *time.Time
	Roles          []string
	Permissions    []string
}

// AuditEntry carries the fields written to audit_log on each auth event.
type AuditEntry struct {
	OrgID        *string
	UserID       *string
	EmailHash    string
	Action       string
	ResourceType string
	IP           string
	UserAgent    string
	Success      bool
	ErrorCode    *string
}
