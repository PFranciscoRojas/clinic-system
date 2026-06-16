package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/hash"
)

const (
	pwResetPrefix = "pwreset:"
	pwResetTTL    = time.Hour
)

// RequestPasswordReset starts the self-service flow: it emails a one-time link
// to the address if (and only if) an account exists. It never reveals whether
// the email is registered — the handler always returns 200 — so it cannot be
// used to enumerate accounts.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	u, err := s.repo.FindUserByEmailGlobal(ctx, email)
	if err != nil || !u.IsActive {
		return nil // silent no-op: unknown or disabled account
	}

	token, err := generateResetToken()
	if err != nil {
		return fmt.Errorf("generating reset token: %w", err)
	}
	// Only the hash is stored; the raw token lives solely in the email link.
	if err := s.rdb.Set(ctx, pwResetPrefix+hash.Token(token), u.ID, pwResetTTL).Err(); err != nil {
		return fmt.Errorf("storing reset token: %w", err)
	}

	name := email
	if u.DisplayName != nil && *u.DisplayName != "" {
		name = *u.DisplayName
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", s.appBaseURL, token)
	go s.notifier.PasswordReset(context.Background(), email, notify.PasswordResetDetails{
		Name: name,
		Link: link,
	})
	return nil
}

// ConfirmPasswordReset consumes a reset token and sets the new password.
func (s *Service) ConfirmPasswordReset(ctx context.Context, token, newPassword string) error {
	if len(newPassword) < 8 {
		return auth.ErrWeakPassword
	}

	userID, err := s.rdb.GetDel(ctx, pwResetPrefix+hash.Token(token)).Result()
	if err != nil || userID == "" {
		return auth.ErrInviteInvalid // reused/expired/unknown token
	}

	pwHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}
	if err := s.repo.UpdatePasswordByID(ctx, userID, string(pwHash)); err != nil {
		return err
	}

	// A reset means the account may have been compromised: end every existing
	// session so old refresh tokens can no longer be exchanged.
	s.bumpPasswordEpoch(ctx, userID)
	return nil
}

func generateResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
