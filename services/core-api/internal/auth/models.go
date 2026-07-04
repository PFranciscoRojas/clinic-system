package auth

import (
	"encoding/json"
	"time"
)

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

// OrgProfessional is the read model for scheduling: an active clinical staff
// member (PROFESSIONAL or INTERN) with their working-hours config. Exposed to
// any user with appointments:read — receptionists need it to assign a
// professional when booking — so it carries no email, license or login data.
type OrgProfessional struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	RoleName     string          `json:"role_name"`
	WorkingHours json.RawMessage `json:"working_hours"`
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
