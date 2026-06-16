package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/hash"
)

const (
	emailVerifyPrefix = "verify:"
	emailVerifyTTL    = 24 * time.Hour
	trialDays         = 14
)

// Signup provisions a new tenant (organization + owner) from a public form and
// emails a one-time verification link. The account exists immediately but
// cannot log in until the address is confirmed (see Login's verified gate).
func (s *Service) Signup(ctx context.Context, fullName, email, password string) error {
	fullName = strings.TrimSpace(fullName)
	email = strings.TrimSpace(email)
	if fullName == "" || !looksLikeEmail(email) {
		return auth.ErrInvalidCredentials
	}
	if len(password) < 8 {
		return auth.ErrWeakPassword
	}

	pwHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	_, _, userID, err := s.repo.CreateOrgWithOwner(ctx, auth.CreateOrgParams{
		OrgName:      fullName,
		BaseSlug:     slugify(fullName),
		Email:        email,
		PasswordHash: string(pwHash),
		DisplayName:  fullName,
		TrialDays:    trialDays,
	})
	if errors.Is(err, auth.ErrEmailAlreadyExists) {
		return err
	}
	if err != nil {
		return fmt.Errorf("provisioning tenant: %w", err)
	}

	token, err := generateResetToken()
	if err != nil {
		return fmt.Errorf("generating verification token: %w", err)
	}
	// Only the hash is stored; the raw token lives solely in the email link.
	if err := s.rdb.Set(ctx, emailVerifyPrefix+hash.Token(token), userID, emailVerifyTTL).Err(); err != nil {
		return fmt.Errorf("storing verification token: %w", err)
	}

	link := fmt.Sprintf("%s/verify-email?token=%s", s.appBaseURL, token)
	go s.notifier.AccountVerification(context.Background(), email, notify.VerificationDetails{
		Name: fullName,
		Link: link,
	})
	return nil
}

// VerifyEmail consumes a one-time verification token and marks the account
// confirmed. The token is single-use (GetDel) and expires within 24h.
func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	userID, err := s.rdb.GetDel(ctx, emailVerifyPrefix+hash.Token(token)).Result()
	if err != nil || userID == "" {
		return auth.ErrInviteInvalid // reused/expired/unknown token
	}
	return s.repo.MarkEmailVerified(ctx, userID)
}

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func looksLikeEmail(s string) bool { return emailRe.MatchString(s) }

var (
	nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)
	trimDashes   = regexp.MustCompile(`^-+|-+$`)
)

// slugify turns a display name into a URL-safe org slug. Accented characters
// are stripped (best-effort, ASCII-fold of the common Spanish set) and runs of
// non-alphanumerics collapse to a single dash.
func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = foldAccents(s)
	s = nonSlugChars.ReplaceAllString(s, "-")
	s = trimDashes.ReplaceAllString(s, "")
	if s == "" {
		return "clinica"
	}
	return s
}

var accentFolder = strings.NewReplacer(
	"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n",
	"à", "a", "è", "e", "ì", "i", "ò", "o", "ù", "u",
)

func foldAccents(s string) string { return accentFolder.Replace(s) }
