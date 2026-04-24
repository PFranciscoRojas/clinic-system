package auth

import "time"

// LoginRequest is the body for POST /api/v1/auth/login.
type LoginRequest struct {
	OrgSlug  string `json:"org_slug"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RefreshRequest is the body for POST /api/v1/auth/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// LogoutRequest is the body for POST /api/v1/auth/logout.
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// TokenPair is returned by login and refresh endpoints.
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds until access token expires
}

// userRecord is an internal projection of the users table, used only within this package.
type userRecord struct {
	ID             string
	OrganizationID string
	PasswordHash   string
	IsActive       bool
	FailedAttempts int
	LockedUntil    *time.Time
	Roles          []string
	Permissions    []string
}

// auditEntry carries the fields written to audit_log on each auth event.
type auditEntry struct {
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
