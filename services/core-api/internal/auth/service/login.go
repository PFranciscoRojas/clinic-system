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

func (s *Service) Login(ctx context.Context, orgSlug, email, password, ip, userAgent string) (*token.Pair, error) {
	emailHash := hash.Normalize(email)

	user, err := s.repo.FindByEmail(ctx, orgSlug, email)
	if err != nil {
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			EmailHash: emailHash, Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("INVALID_CREDENTIALS"),
		})
		return nil, auth.ErrInvalidCredentials
	}

	if !user.IsActive {
		s.repo.WriteAuditLog(ctx, auth.AuditEntry{
			OrgID: &user.OrganizationID, UserID: &user.ID, EmailHash: emailHash,
			Action: "auth.login", ResourceType: "user",
			IP: ip, UserAgent: userAgent, Success: false, ErrorCode: ptr("ACCOUNT_INACTIVE"),
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
