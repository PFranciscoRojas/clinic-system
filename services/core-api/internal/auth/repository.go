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
	// IsInternalOrg reports whether orgID is an operational fixture (the SaaS
	// operator's own org or the CI-seeded demo org) rather than a real tenant.
	IsInternalOrg(ctx context.Context, orgID string) (bool, error)
	MarkEmailVerified(ctx context.Context, userID string) error
	AssignRole(ctx context.Context, orgID, userID, roleID, assignedByUserID string) error
	UpdatePassword(ctx context.Context, orgID, targetEmail, passwordHash string) error
	UpdatePasswordByID(ctx context.Context, userID, passwordHash string) error
	UpdateDisplayName(ctx context.Context, userID, displayName string) error
	SetOnboardingCompleted(ctx context.Context, userID string) error
	OnboardingCompleted(ctx context.Context, userID string) (bool, error)

	// Email change flow.
	UpdateEmail(ctx context.Context, userID, newEmail string) error

	// Team management.
	ListOrgUsers(ctx context.Context, orgID string) ([]OrgUser, error)
	ListOrgProfessionals(ctx context.Context, orgID string) ([]OrgProfessional, error)
	ReplaceUserRole(ctx context.Context, orgID, targetUserID, newRoleID, callerUserID string) error
	DeactivateUser(ctx context.Context, orgID, targetUserID string) (int64, error)
	ReactivateUser(ctx context.Context, orgID, targetUserID, roleID, callerUserID string) error
	CountAdminsExcluding(ctx context.Context, orgID, excludeUserID string) (int, error)
	SeatUsage(ctx context.Context, orgID, excludeUserID string) (used, limit int, status string, err error)

	// Legal / DPA.
	AcceptDPA(ctx context.Context, userID string) error
	DPAAccepted(ctx context.Context, userID string) (bool, error)
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
	// IsProfessional grants the owner the PROFESSIONAL role (bookable agenda).
	// False = manager-only admin, who then invites the practitioners.
	IsProfessional bool
	// TermsVersion is the accepted legal-document version (e.g. "2026-06-24").
	// Stored alongside terms_accepted_at = now() as a Ley 1581/2012 audit trail.
	TermsVersion string
	// Phone and ReferralSource are optional lead-tracking fields from the signup
	// form: the owner's WhatsApp contact and how they heard about the product.
	Phone          string
	ReferralSource string
}

// SignupParams carries the public signup form into the service layer.
type SignupParams struct {
	OrgName      string // clinic/practice name → organization + slug
	AdminName    string // the owner's own name → display name
	Email        string
	Password     string
	TermsVersion string
	// Phone and ReferralSource are optional lead-tracking fields.
	Phone          string
	ReferralSource string
	IsProfessional bool
}

// InvitePayload is serialised to/from Redis for the 48-hour invite window.
type InvitePayload struct {
	OrgID     string    `json:"org_id"`
	RoleName  string    `json:"role_name"`
	CreatedBy string    `json:"created_by"`
	ExpiresAt time.Time `json:"expires_at"`
}
