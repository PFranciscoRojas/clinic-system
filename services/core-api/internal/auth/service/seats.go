package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/auth"
)

// ensureSeatAvailable blocks adding another clinical professional (PROFESSIONAL
// or INTERN) once the org has used all its paid seats. Trials are never
// limited — the checkout later prices the plan by the actual clinical
// headcount, so a trial clinic can't underpay by inviting first.
// excludeUserID leaves one user out of the count (role changes: a user who
// already holds a clinical seat keeps it).
func (s *Service) ensureSeatAvailable(ctx context.Context, orgID, roleName, excludeUserID string) error {
	if roleName != "PROFESSIONAL" && roleName != "INTERN" {
		return nil
	}
	used, limit, status, err := s.repo.SeatUsage(ctx, orgID, excludeUserID)
	if err != nil {
		return fmt.Errorf("checking seat availability: %w", err)
	}
	if status != "trialing" && used >= limit {
		return auth.ErrSeatLimit
	}
	return nil
}
