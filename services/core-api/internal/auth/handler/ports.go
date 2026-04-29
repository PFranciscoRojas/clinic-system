package handler

import (
	"context"

	authsvc "sghcp/core-api/internal/auth/service"
	"sghcp/core-api/internal/shared/token"
)

// svcPort is the contract the handler requires from the service layer.
// Defined here so the handler owns its dependency boundary — DIP.
type svcPort interface {
	Login(ctx context.Context, orgSlug, email, password, ip, userAgent string) (*token.Pair, error)
	Refresh(ctx context.Context, refreshToken string) (*token.Pair, error)
	Logout(ctx context.Context, refreshToken string) error
}

// compile-time guard: *authsvc.Service must satisfy svcPort.
var _ svcPort = (*authsvc.Service)(nil)
