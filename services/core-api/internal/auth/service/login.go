package service

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
	"sghcp/core-api/internal/shared/token"
)

// Login authenticates by email alone — the tenant is resolved from the account,
// so a user never needs to know their org slug. A self-serve signup is not
// usable until the owner confirms their address, hence the email-verified gate.
func (s *Service) Login(ctx context.Context, email, password, ip, userAgent string) (*token.Pair, error) {
	emailHash := hash.Normalize(email)

	user, err := s.repo.FindForLogin(ctx, email)
	if err != nil {
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			EmailHash: emailHash, Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("INVALID_CREDENTIALS"),
		})
		return nil, auth.ErrInvalidCredentials
	}

	if user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			OrgID: &user.OrganizationID, UserID: &user.ID, EmailHash: emailHash,
			Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("ACCOUNT_LOCKED"),
		})
		return nil, auth.ErrAccountLocked
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		_ = s.repo.IncrementFailedAttempts(ctx, user.ID)
		if user.FailedAttempts+1 >= maxFailedAttempts {
			_ = s.repo.LockUser(ctx, user.ID, time.Now().Add(lockoutDuration))
		}
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			OrgID: &user.OrganizationID, UserID: &user.ID, EmailHash: emailHash,
			Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("INVALID_CREDENTIALS"),
		})
		return nil, auth.ErrInvalidCredentials
	}

	_ = s.repo.ClearFailedAttempts(ctx, user.ID)

	// Both checks below are gated after a correct password so that a wrong
	// guess never reveals whether the email exists, is unverified, or inactive.
	if !user.IsActive {
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			OrgID: &user.OrganizationID, UserID: &user.ID, EmailHash: emailHash,
			Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("ACCOUNT_INACTIVE"),
		})
		return nil, auth.ErrAccountInactive
	}

	if user.EmailVerifiedAt == nil {
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			OrgID: &user.OrganizationID, UserID: &user.ID, EmailHash: emailHash,
			Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("EMAIL_NOT_VERIFIED"),
		})
		return nil, auth.ErrEmailNotVerified
	}

	pair, err := s.issueTokenPair(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("issuing tokens: %w", err)
	}

	s.repo.WriteAuditLog(ctx, auth.AuditEntry{
		OrgID: &user.OrganizationID, UserID: &user.ID, EmailHash: emailHash,
		Action: "auth.login", ResourceType: "user",
		IP: ip, UserAgent: userAgent, Success: true,
	})

	return pair, nil
}
