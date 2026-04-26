package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/token"
)

// Refresh validates a refresh token from Redis and issues a new token pair.
// The old refresh token is deleted before issuing the new one (rotation).
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*token.Pair, error) {
	key := refreshTokenPrefix + refreshToken

	raw, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, errors.New("invalid or expired refresh token")
	}

	var payload refreshPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, errors.New("malformed refresh token")
	}

	s.rdb.Del(ctx, key)

	user := &auth.User{
		ID:             payload.UserID,
		OrganizationID: payload.OrgID,
		Roles:          payload.Roles,
		Permissions:    payload.Perms,
	}

	pair, err := s.issueTokenPair(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("issuing tokens on refresh: %w", err)
	}

	return pair, nil
}
