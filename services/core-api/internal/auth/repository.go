package auth

import (
	"context"
	"time"
)

// Repository defines the persistence contract for the auth domain.
// The pgx implementation lives in ./repository/ and is injected at startup.
type Repository interface {
	FindByEmail(ctx context.Context, orgSlug, email string) (*User, error)
	IncrementFailedAttempts(ctx context.Context, userID string) error
	LockUser(ctx context.Context, userID string, until time.Time) error
	ClearFailedAttempts(ctx context.Context, userID string) error
	WriteAuditLog(ctx context.Context, entry AuditEntry)
}
