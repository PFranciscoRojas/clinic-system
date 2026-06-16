package auth

import (
	"context"
	"time"
)

// Repository defines the persistence contract for the auth domain.
// The pgx implementation lives in ./repository/ and is injected at startup.
type Repository interface {
	FindForLogin(ctx context.Context, email string) (*User, error)
	IncrementFailedAttempts(ctx context.Context, userID string) error
	LockUser(ctx context.Context, userID string, until time.Time) error
	ClearFailedAttempts(ctx context.Context, userID string) error
	WriteAuditLog(ctx context.Context, entry AuditEntry)

	// User provisioning — used by the registration and admin flows.
	FindUserByEmailInOrg(ctx context.Context, orgID, email string) (*User, error)
	FindUserByEmailGlobal(ctx context.Context, email string) (*User, error)
	FindUserByID(ctx context.Context, userID string) (*User, error)
	FindRoleIDByName(ctx context.Context, roleName string) (string, error)
	CreateUser(ctx context.Context, orgID, email, passwordHash, displayName string) (string, error)
	CreateOrgWithOwner(ctx context.Context, p CreateOrgParams) (orgID, slug, userID string, err error)
	OrgInfo(ctx context.Context, orgID string) (name, status string, trialEndsAt, currentPeriodEnd *time.Time, err error)
	MarkEmailVerified(ctx context.Context, userID string) error
	AssignRole(ctx context.Context, orgID, userID, roleID, assignedByUserID string) error
	UpdatePassword(ctx context.Context, orgID, targetEmail, passwordHash string) error
	UpdatePasswordByID(ctx context.Context, userID, passwordHash string) error
	UpdateDisplayName(ctx context.Context, userID, displayName string) error
	SetOnboardingCompleted(ctx context.Context, userID string) error
	OnboardingCompleted(ctx context.Context, userID string) (bool, error)
}

// CreateOrgParams carries everything CreateOrgWithOwner needs to provision a
// new tenant and its owner in one transaction.
type CreateOrgParams struct {
	OrgName      string // organizations.name (also the email branding fallback)
	BaseSlug     string // desired slug; a numeric suffix is appended on collision
	Email        string // owner email, plaintext
	PasswordHash string // bcrypt
	DisplayName  string // owner display name
	TrialDays    int    // trial window from now
}

// InvitePayload is serialised to/from Redis for the 48-hour invite window.
type InvitePayload struct {
	OrgID     string    `json:"org_id"`
	RoleName  string    `json:"role_name"`
	CreatedBy string    `json:"created_by"`
	ExpiresAt time.Time `json:"expires_at"`
}
