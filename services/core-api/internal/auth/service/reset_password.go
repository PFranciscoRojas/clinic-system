package service

import (
	"context"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
)

// ResetPassword lets an admin override any user's password within their org.
// The caller's orgID comes from the validated JWT — not the request body.
func (s *Service) ResetPassword(ctx context.Context, callerOrgID, targetEmail, newPassword string) error {
	if len(newPassword) < 8 {
		return auth.ErrWeakPassword
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	return s.repo.UpdatePassword(ctx, callerOrgID, targetEmail, string(hash))
}
