package service

import (
	"context"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
)

// ChangePassword lets an authenticated user rotate their own password after
// proving they know the current one.
func (s *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return auth.ErrWeakPassword
	}

	user, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return auth.ErrUserNotFound
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)) != nil {
		return auth.ErrInvalidCredentials
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}
	if err := s.repo.UpdatePasswordByID(ctx, userID, string(hash)); err != nil {
		return err
	}

	// Changing the password ends all existing sessions (this one included);
	// the user signs in again with the new credentials.
	s.bumpPasswordEpoch(ctx, userID)
	return nil
}

// CompleteOnboarding stamps the server-side onboarding flag (idempotent).
func (s *Service) CompleteOnboarding(ctx context.Context, userID string) error {
	return s.repo.SetOnboardingCompleted(ctx, userID)
}

// OnboardingCompleted reports the server-side onboarding flag.
func (s *Service) OnboardingCompleted(ctx context.Context, userID string) (bool, error) {
	return s.repo.OnboardingCompleted(ctx, userID)
}
