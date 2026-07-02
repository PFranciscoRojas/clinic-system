package service

import (
	"context"
	"encoding/json"
	"fmt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/token"
)

// Refresh validates a refresh token from Redis and issues a new token pair.
// The old refresh token is deleted before issuing the new one (rotation).
//
// The user is reloaded from the database on every rotation — the Redis payload
// is only a pointer (user id + password epoch), never an authority on roles or
// permissions. Trusting a snapshot meant a revoked role survived for the whole
// refresh TTL, and the reissued claims lost email/display_name.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*token.Pair, error) {
	key := refreshTokenPrefix + refreshToken

	raw, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("refresh token lookup: %w", auth.ErrInvalidCredentials)
	}

	var payload refreshPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, fmt.Errorf("refresh token payload: %w", auth.ErrInvalidCredentials)
	}

	s.rdb.Del(ctx, key)

	// Reject tokens issued before the user's last password reset/change.
	if payload.Epoch != s.passwordEpoch(ctx, payload.UserID) {
		return nil, fmt.Errorf("refresh token epoch: %w", auth.ErrInvalidCredentials)
	}

	user, err := s.repo.FindUserByID(ctx, payload.UserID)
	if err != nil {
		return nil, fmt.Errorf("refresh token user: %w", auth.ErrInvalidCredentials)
	}
	if !user.IsActive {
		return nil, auth.ErrAccountInactive
	}

	pair, err := s.issueTokenPair(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("issuing tokens on refresh: %w", err)
	}

	return pair, nil
}
