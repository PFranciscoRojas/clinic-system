package auth

import (
	"context"
	"errors"
	"time"
)

// User is the auth aggregate root.
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

// Repository defines the persistence contract for the auth domain.
// The pgx implementation lives in ./repository/ and is injected at startup.
type Repository interface {
	FindByEmail(ctx context.Context, orgSlug, email string) (*User, error)
	IncrementFailedAttempts(ctx context.Context, userID string) error
	LockUser(ctx context.Context, userID string, until time.Time) error
	ClearFailedAttempts(ctx context.Context, userID string) error
	WriteAuditLog(ctx context.Context, entry AuditEntry)
}

// Domain errors — the handler maps these to HTTP status codes.
var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountLocked      = errors.New("account locked, try again later")
	ErrAccountInactive    = errors.New("account inactive")
)
