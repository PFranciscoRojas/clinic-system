package service

import (
	"context"
	"encoding/json"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/token"
)

// Register creates a new user using a valid invite code and immediately issues tokens.
// The invite code is consumed (deleted from Redis) on success.
func (s *Service) Register(ctx context.Context, inviteCode, email, password, displayName string) (*token.Pair, error) {
	if len(password) < 8 {
		return nil, auth.ErrWeakPassword
	}

	raw, err := s.rdb.GetDel(ctx, invitePrefix+inviteCode).Bytes()
	if err != nil {
		return nil, auth.ErrInviteInvalid
	}

	var payload auth.InvitePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, auth.ErrInviteInvalid
	}

	// Guard: duplicate email in this org.
	if _, err := s.repo.FindUserByEmailInOrg(ctx, payload.OrgID, email); err == nil {
		// Restore invite so the admin can share it again or the user can fix their email.
		s.rdb.Set(ctx, invitePrefix+inviteCode, raw, inviteTTL)
		return nil, auth.ErrEmailAlreadyExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	userID, err := s.repo.CreateUser(ctx, payload.OrgID, email, string(hash), displayName)
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}

	roleID, err := s.repo.FindRoleIDByName(ctx, payload.RoleName)
	if err != nil {
		return nil, fmt.Errorf("finding role %q: %w", payload.RoleName, err)
	}
	if err := s.repo.AssignRole(ctx, payload.OrgID, userID, roleID, userID); err != nil {
		return nil, fmt.Errorf("assigning role: %w", err)
	}

	// Build a synthetic User to issue tokens without a second DB round-trip.
	u, err := s.repo.FindUserByEmailInOrg(ctx, payload.OrgID, email)
	if err != nil {
		return nil, fmt.Errorf("loading new user: %w", err)
	}

	pair, err := s.issueTokenPair(ctx, u)
	if err != nil {
		return nil, fmt.Errorf("issuing tokens: %w", err)
	}
	return pair, nil
}
