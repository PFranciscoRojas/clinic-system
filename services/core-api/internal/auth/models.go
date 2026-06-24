package auth

import "time"

// User is the auth aggregate root — loaded from DB and used by the service to
// validate credentials, check lockout state, and build JWT claims.
type User struct {
	ID             string
	OrganizationID string
	Email          string
	DisplayName    *string
	PasswordHash   string
	IsActive       bool
	FailedAttempts int
	LockedUntil    *time.Time
	// EmailVerifiedAt is nil until the user confirms their address via the
	// verification email. Login is denied while it is nil.
	EmailVerifiedAt *time.Time
	Roles           []string
	Permissions     []string
}

// OrgUser is the read model for team management (list + role assignment).
type OrgUser struct {
	ID          string     `json:"id"`
	DisplayName *string    `json:"display_name"`
	Email       string     `json:"email"`
	RoleName    string     `json:"role_name"`
	IsActive    bool       `json:"is_active"`
	LastLoginAt *time.Time `json:"last_login_at"`
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
