package service

import (
	"context"
	"fmt"
	"strings"

	"sghcp/core-api/internal/shared/token"
)

// UpdateProfile changes the display name of the calling user and returns a fresh token pair
// so the new name is immediately reflected in the JWT without requiring re-login.
func (s *Service) UpdateProfile(ctx context.Context, userID, displayName string) (*token.Pair, error) {
	displayName = strings.TrimSpace(displayName)

	if err := s.repo.UpdateDisplayName(ctx, userID, displayName); err != nil {
		return nil, fmt.Errorf("updating display name: %w", err)
	}

	u, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("reloading user: %w", err)
	}

	return s.issueTokenPair(ctx, u)
}
