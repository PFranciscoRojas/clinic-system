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

// Signup provisions a new tenant from a public form and emails a one-time
// verification link. p.OrgName is the clinic/practice (becomes the organization
// and its slug); p.AdminName is the owner's own name (becomes their display name
// and, after onboarding, their professional profile). The account exists
// immediately but cannot log in until the address is confirmed.
func (s *Service) Signup(ctx context.Context, p auth.SignupParams) error {
	orgName := strings.TrimSpace(p.OrgName)
	adminName := strings.TrimSpace(p.AdminName)
	email := strings.TrimSpace(p.Email)
	if orgName == "" || adminName == "" || !looksLikeEmail(email) {
		return auth.ErrInvalidCredentials
	}
	if len(p.Password) < 8 {
		return auth.ErrWeakPassword
	}

	pwHash, err := bcrypt.GenerateFromPassword([]byte(p.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	phone := sanitizePhone(p.Phone)
	source := clampField(p.ReferralSource, 64)
	_, slug, userID, err := s.repo.CreateOrgWithOwner(ctx, auth.CreateOrgParams{
		OrgName:        orgName,
		BaseSlug:       slugify(orgName),
		Email:          email,
		PasswordHash:   string(pwHash),
		DisplayName:    adminName,
		TrialDays:      trialDays,
		IsProfessional: p.IsProfessional,
		TermsVersion:   p.TermsVersion,
		Phone:          phone,
		ReferralSource: source,
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
		Name: adminName,
		Link: link,
	})
	if s.signupAlertEmail != "" {
		go s.notifier.TenantSignupAlert(context.Background(), s.signupAlertEmail, notify.TenantSignupDetails{
			OrgName:   orgName,
			Slug:      slug,
			AdminName: adminName,
			Email:     email,
			Phone:     phone,
			Source:    source,
		})
	}
	return nil
}

// OrgInfo returns the caller org's name, subscription status and the trial /
// paid-period deadlines, used by /me to label the org, drive the trial banner
// and compute entitlement.
func (s *Service) OrgInfo(ctx context.Context, orgID string) (name, status string, trialEndsAt, currentPeriodEnd *time.Time, err error) {
	return s.repo.OrgInfo(ctx, orgID)
}

// IsInternalOrg reports whether orgID is an operational fixture rather than
// a real tenant — used by /me to gate the "reset test data" feature.
func (s *Service) IsInternalOrg(ctx context.Context, orgID string) (bool, error) {
	return s.repo.IsInternalOrg(ctx, orgID)
}

// ResendVerification re-issues a verification link for an unverified account.
// Like the password-reset flow it never reveals whether the email exists or is
// already verified — the handler always answers 200 — so it can't be used to
// enumerate accounts.
func (s *Service) ResendVerification(ctx context.Context, email string) error {
	u, err := s.repo.FindUserByEmailGlobal(ctx, email)
	if err != nil || !u.IsActive || u.EmailVerifiedAt != nil {
		return nil // silent no-op: unknown, disabled, or already verified
	}

	token, err := generateResetToken()
	if err != nil {
		return fmt.Errorf("generating verification token: %w", err)
	}
	if err := s.rdb.Set(ctx, emailVerifyPrefix+hash.Token(token), u.ID, emailVerifyTTL).Err(); err != nil {
		return fmt.Errorf("storing verification token: %w", err)
	}

	name := email
	if u.DisplayName != nil && *u.DisplayName != "" {
		name = *u.DisplayName
	}
	link := fmt.Sprintf("%s/verify-email?token=%s", s.appBaseURL, token)
	go s.notifier.AccountVerification(context.Background(), email, notify.VerificationDetails{
		Name: name,
		Link: link,
	})
	return nil
}

// VerifyEmail consumes a one-time verification token and marks the account
// confirmed. The token is single-use (GetDel) and expires within 24h. On
// success it greets the owner (welcome + founder tour offer) and alerts the
// operator that the lead is now active; both emails are best-effort.
func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	userID, err := s.rdb.GetDel(ctx, emailVerifyPrefix+hash.Token(token)).Result()
	if err != nil || userID == "" {
		return auth.ErrInviteInvalid // reused/expired/unknown token
	}
	if err := s.repo.MarkEmailVerified(ctx, userID); err != nil {
		return err
	}

	u, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return nil // verified fine; the courtesy emails just can't be built
	}
	name := u.Email
	if u.DisplayName != nil && *u.DisplayName != "" {
		name = *u.DisplayName
	}
	go s.notifier.TenantWelcome(context.Background(), u.Email, notify.TenantWelcomeDetails{
		Name:            name,
		LoginURL:        s.appBaseURL + "/login",
		SupportWhatsApp: s.supportWhatsApp,
	})
	if s.signupAlertEmail != "" {
		orgName, _, _, _, err := s.repo.OrgInfo(ctx, u.OrganizationID)
		if err != nil {
			orgName = u.OrganizationID
		}
		go s.notifier.TenantSignupAlert(context.Background(), s.signupAlertEmail, notify.TenantSignupDetails{
			OrgName:   orgName,
			AdminName: name,
			Email:     u.Email,
			Verified:  true,
		})
	}
	return nil
}

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func looksLikeEmail(s string) bool { return emailRe.MatchString(s) }

var nonPhoneChars = regexp.MustCompile(`[^0-9+]`)

// sanitizePhone keeps only digits (dropping spaces, dashes and a leading +) so
// the stored value works directly in a wa.me link. Empty or absurd input
// (fewer than 7 digits) is discarded — the field is optional lead data.
func sanitizePhone(s string) string {
	s = nonPhoneChars.ReplaceAllString(s, "")
	s = strings.TrimPrefix(s, "+")
	if len(s) < 7 || len(s) > 15 {
		return ""
	}
	// Colombia-first: a bare 10-digit mobile (3xx…) gets the country code so
	// the wa.me link works as-is.
	if len(s) == 10 && s[0] == '3' {
		s = "57" + s
	}
	return s
}

// clampField trims an optional free-form field to a sane stored length.
func clampField(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max]
	}
	return s
}

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
