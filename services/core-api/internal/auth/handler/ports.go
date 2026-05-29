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
	Login(ctx context.Context, orgSlug, email, password, ip, userAgent string) (*token.Pair, error)
	Refresh(ctx context.Context, refreshToken string) (*token.Pair, error)
	Logout(ctx context.Context, refreshToken string) error
	Invite(ctx context.Context, orgID, callerUserID, roleName string) (code string, expiresAt time.Time, err error)
	Register(ctx context.Context, inviteCode, email, password, displayName string) (*token.Pair, error)
	ResetPassword(ctx context.Context, callerOrgID, targetEmail, newPassword string) error
}

// compile-time guard: *authsvc.Service must satisfy svcPort.
var _ svcPort = (*authsvc.Service)(nil)
