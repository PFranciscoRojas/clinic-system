package handler

import (
	"context"
	"time"

	authsvc "sghcp/core-api/internal/auth/service"
	"sghcp/core-api/internal/shared/token"
)

// svcPort is the contract the handler requires from the service layer.
// Defined here so the handler owns its dependency boundary — DIP.
type svcPort interface {
	Login(ctx context.Context, email, password, ip, userAgent string) (*token.Pair, error)
	Signup(ctx context.Context, orgName, adminName, email, password string, isProfessional bool) error
	VerifyEmail(ctx context.Context, token string) error
	ResendVerification(ctx context.Context, email string) error
	Refresh(ctx context.Context, refreshToken string) (*token.Pair, error)
	Logout(ctx context.Context, refreshToken string) error
	Invite(ctx context.Context, orgID, callerUserID, roleName string) (code string, expiresAt time.Time, err error)
	Register(ctx context.Context, inviteCode, email, password, displayName string) (*token.Pair, error)
	ResetPassword(ctx context.Context, callerOrgID, targetEmail, newPassword string) error
	RequestPasswordReset(ctx context.Context, email string) error
	ConfirmPasswordReset(ctx context.Context, token, newPassword string) error
	UpdateProfile(ctx context.Context, userID, displayName string) (*token.Pair, error)
	ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error
	CompleteOnboarding(ctx context.Context, userID string) error
	OnboardingCompleted(ctx context.Context, userID string) (bool, error)
	OrgInfo(ctx context.Context, orgID string) (name, status string, trialEndsAt, currentPeriodEnd *time.Time, err error)
}

// compile-time guard: *authsvc.Service must satisfy svcPort.
var _ svcPort = (*authsvc.Service)(nil)
