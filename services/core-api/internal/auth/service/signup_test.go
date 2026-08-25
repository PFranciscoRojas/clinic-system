package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/hash"
)

// Signup provisions a tenant from an anonymous public form, so validation is
// the whole safety story. VerifyEmail is the gate that makes the account
// usable, and it must be single-use.

func TestSignupProvisionsATenant(t *testing.T) {
	ctx := context.Background()

	var got auth.CreateOrgParams
	repo := &fakeRepo{}
	repo.createOrg = func(_ context.Context, p auth.CreateOrgParams) (string, string, string, error) {
		got = p
		return "org-1", "clinica-chapni", "user-1", nil
	}
	svc, mr := newTestService(t, repo)

	err := svc.Signup(ctx, auth.SignupParams{
		OrgName:        "  Clínica Chapni  ",
		AdminName:      "  Marcela Chapués  ",
		Email:          "  marcela@chapni.com  ",
		Password:       "una-clave-decente",
		TermsVersion:   "2026-06-24",
		Phone:          "+57 300 123 4567",
		ReferralSource: "  un colega  ",
		IsProfessional: true,
	})
	if err != nil {
		t.Fatalf("signup: %v", err)
	}

	if got.OrgName != "Clínica Chapni" || got.DisplayName != "Marcela Chapués" || got.Email != "marcela@chapni.com" {
		t.Errorf("fields were not trimmed: %+v", got)
	}
	if got.BaseSlug != "clinica-chapni" {
		t.Errorf("BaseSlug = %q, want the slugified org name", got.BaseSlug)
	}
	if got.Phone != "573001234567" {
		t.Errorf("Phone = %q, want the sanitized wa.me-ready number", got.Phone)
	}
	if got.ReferralSource != "un colega" {
		t.Errorf("ReferralSource = %q, want it trimmed", got.ReferralSource)
	}
	if got.TrialDays != trialDays {
		t.Errorf("TrialDays = %d, want %d", got.TrialDays, trialDays)
	}
	if got.TermsVersion != "2026-06-24" {
		t.Errorf("TermsVersion = %q — the Ley 1581/2012 audit trail was dropped", got.TermsVersion)
	}
	if !got.IsProfessional {
		t.Error("IsProfessional was not carried through")
	}

	// The password must never reach the repository in the clear.
	if got.PasswordHash == "" || strings.Contains(got.PasswordHash, "una-clave-decente") {
		t.Fatalf("PasswordHash = %q, want a bcrypt hash", got.PasswordHash)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(got.PasswordHash), []byte("una-clave-decente")); err != nil {
		t.Errorf("the stored value is not a bcrypt hash of the password: %v", err)
	}

	// A verification token must exist, stored hashed, so the account is not
	// usable until the address is confirmed.
	var verifyKeys int
	for _, k := range mr.Keys() {
		if strings.HasPrefix(k, emailVerifyPrefix) {
			verifyKeys++
		}
	}
	if verifyKeys != 1 {
		t.Errorf("%d verification tokens stored, want 1", verifyKeys)
	}
}

func TestSignupRejections(t *testing.T) {
	ctx := context.Background()

	valid := auth.SignupParams{
		OrgName: "Clinica", AdminName: "Marcela",
		Email: "marcela@chapni.com", Password: "una-clave-decente",
	}

	cases := []struct {
		name   string
		mutate func(*auth.SignupParams)
		want   error
	}{
		{"empty org name", func(p *auth.SignupParams) { p.OrgName = "" }, auth.ErrInvalidCredentials},
		{"whitespace org name", func(p *auth.SignupParams) { p.OrgName = "   " }, auth.ErrInvalidCredentials},
		{"empty admin name", func(p *auth.SignupParams) { p.AdminName = "" }, auth.ErrInvalidCredentials},
		{"whitespace admin name", func(p *auth.SignupParams) { p.AdminName = "  " }, auth.ErrInvalidCredentials},
		{"empty email", func(p *auth.SignupParams) { p.Email = "" }, auth.ErrInvalidCredentials},
		{"malformed email", func(p *auth.SignupParams) { p.Email = "not-an-email" }, auth.ErrInvalidCredentials},
		{"email with no domain dot", func(p *auth.SignupParams) { p.Email = "a@b" }, auth.ErrInvalidCredentials},
		{"password too short", func(p *auth.SignupParams) { p.Password = "1234567" }, auth.ErrWeakPassword},
		{"password empty", func(p *auth.SignupParams) { p.Password = "" }, auth.ErrWeakPassword},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := valid
			tc.mutate(&p)

			var provisioned bool
			repo := &fakeRepo{}
			repo.createOrg = func(context.Context, auth.CreateOrgParams) (string, string, string, error) {
				provisioned = true
				return "", "", "", nil
			}
			svc, mr := newTestService(t, repo)

			if err := svc.Signup(ctx, p); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if provisioned {
				t.Error("a rejected signup still provisioned a tenant")
			}
			if len(mr.Keys()) != 0 {
				t.Errorf("a rejected signup left %v in redis", mr.Keys())
			}
		})
	}

	// Exactly 8 characters is accepted; the boundary is checked separately from
	// the table so a change to it cannot hide behind a passing "too short" case.
	t.Run("eight characters is accepted", func(t *testing.T) {
		p := valid
		p.Password = "12345678"
		repo := &fakeRepo{}
		repo.createOrg = func(context.Context, auth.CreateOrgParams) (string, string, string, error) {
			return "org-1", "clinica", "user-1", nil
		}
		svc, _ := newTestService(t, repo)
		if err := svc.Signup(ctx, p); err != nil {
			t.Errorf("err = %v, want the signup accepted", err)
		}
	})
}

// TestSignupSurfacesADuplicateEmailUnwrapped: the handler maps this error to a
// specific message, so it must arrive as auth.ErrEmailAlreadyExists and not
// buried under "provisioning tenant".
func TestSignupSurfacesADuplicateEmail(t *testing.T) {
	repo := &fakeRepo{}
	repo.createOrg = func(context.Context, auth.CreateOrgParams) (string, string, string, error) {
		return "", "", "", auth.ErrEmailAlreadyExists
	}
	svc, mr := newTestService(t, repo)

	err := svc.Signup(context.Background(), auth.SignupParams{
		OrgName: "Clinica", AdminName: "Marcela",
		Email: "taken@chapni.com", Password: "una-clave-decente",
	})
	if !errors.Is(err, auth.ErrEmailAlreadyExists) {
		t.Fatalf("err = %v, want ErrEmailAlreadyExists", err)
	}
	if len(mr.Keys()) != 0 {
		t.Error("a failed signup still issued a verification token")
	}
}

func TestVerifyEmail(t *testing.T) {
	ctx := context.Background()

	newSvc := func(t *testing.T, user *auth.User) (*Service, *fakeRepo) {
		t.Helper()
		repo := &fakeRepo{
			findUserByID: func(context.Context, string) (*auth.User, error) {
				if user == nil {
					return nil, errors.New("no rows")
				}
				return user, nil
			},
		}
		repo.markVerified = func(_ context.Context, userID string) error {
			repo.mu.Lock()
			defer repo.mu.Unlock()
			repo.verifiedIDs = append(repo.verifiedIDs, userID)
			return nil
		}
		svc, mr := newTestService(t, repo)
		repo.mr = mr
		return svc, repo
	}

	t.Run("a valid token marks the account verified, once", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		user.EmailVerifiedAt = nil
		svc, repo := newSvc(t, user)

		const raw = "the-verification-token"
		if err := repo.mr.Set(emailVerifyPrefix+hash.Token(raw), user.ID); err != nil {
			t.Fatal(err)
		}

		if err := svc.VerifyEmail(ctx, raw); err != nil {
			t.Fatalf("verify: %v", err)
		}
		if len(repo.verifiedIDs) != 1 || repo.verifiedIDs[0] != user.ID {
			t.Errorf("marked verified: %v, want exactly [%s]", repo.verifiedIDs, user.ID)
		}

		// Single use: the link in an email may be re-fetched by a scanner or a
		// second click, and must not stay live.
		if err := svc.VerifyEmail(ctx, raw); !errors.Is(err, auth.ErrInviteInvalid) {
			t.Errorf("replayed link: got %v, want ErrInviteInvalid", err)
		}
		if len(repo.verifiedIDs) != 1 {
			t.Errorf("the replay verified the account again: %v", repo.verifiedIDs)
		}
	})

	t.Run("rejections", func(t *testing.T) {
		for _, tok := range []string{"never-issued", ""} {
			t.Run("token "+tok, func(t *testing.T) {
				user := verifiedUser(t, testPassword)
				svc, repo := newSvc(t, user)
				if err := svc.VerifyEmail(ctx, tok); !errors.Is(err, auth.ErrInviteInvalid) {
					t.Errorf("got %v, want ErrInviteInvalid", err)
				}
				if len(repo.verifiedIDs) != 0 {
					t.Error("a rejected token still verified an account")
				}
			})
		}
	})

	// The courtesy emails are best-effort: if the user row cannot be reloaded,
	// the verification itself must still stand.
	t.Run("verification stands even if the user cannot be reloaded", func(t *testing.T) {
		svc, repo := newSvc(t, nil)

		const raw = "another-verification-token"
		if err := repo.mr.Set(emailVerifyPrefix+hash.Token(raw), "user-1"); err != nil {
			t.Fatal(err)
		}
		if err := svc.VerifyEmail(ctx, raw); err != nil {
			t.Errorf("verify: %v, want it to succeed anyway", err)
		}
		if len(repo.verifiedIDs) != 1 {
			t.Error("the account was not marked verified")
		}
	})
}

func TestResendVerification(t *testing.T) {
	ctx := context.Background()

	unverified := verifiedUser(t, testPassword)
	unverified.EmailVerifiedAt = nil

	alreadyVerified := verifiedUser(t, testPassword)

	disabled := verifiedUser(t, testPassword)
	disabled.EmailVerifiedAt = nil
	disabled.IsActive = false

	cases := []struct {
		name      string
		user      *auth.User // nil = unknown address
		wantToken bool
	}{
		{"unverified account gets a new link", unverified, true},
		{"already verified is a silent no-op", alreadyVerified, false},
		{"disabled account is a silent no-op", disabled, false},
		{"unknown address is a silent no-op", nil, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeRepo{
				findByEmail: func(context.Context, string) (*auth.User, error) {
					if tc.user == nil {
						return nil, errors.New("no rows")
					}
					return tc.user, nil
				},
			}
			svc, mr := newTestService(t, repo)

			// Always nil, for every case: the handler answers 200 regardless.
			if err := svc.ResendVerification(ctx, "pro@clinic.test"); err != nil {
				t.Fatalf("err = %v, want nil", err)
			}

			var issued int
			for _, k := range mr.Keys() {
				if strings.HasPrefix(k, emailVerifyPrefix) {
					issued++
				}
			}
			if (issued > 0) != tc.wantToken {
				t.Errorf("%d verification tokens issued, wantToken = %v", issued, tc.wantToken)
			}
		})
	}
}

// TestSignupTokenTTLs pins the documented windows. A verification link that
// never expires is a permanent account-takeover primitive if an inbox is later
// compromised.
func TestSignupTokenTTLs(t *testing.T) {
	if emailVerifyTTL != 24*time.Hour {
		t.Errorf("emailVerifyTTL = %v, want 24h", emailVerifyTTL)
	}
	if pwResetTTL != time.Hour {
		t.Errorf("pwResetTTL = %v, want 1h", pwResetTTL)
	}
	if emailChangeTTL != time.Hour {
		t.Errorf("emailChangeTTL = %v, want 1h", emailChangeTTL)
	}
	if inviteTTL != 48*time.Hour {
		t.Errorf("inviteTTL = %v, want 48h", inviteTTL)
	}
	if trialDays != 14 {
		t.Errorf("trialDays = %d, want 14", trialDays)
	}
}

// captureNotifier records the operator alert instead of sending it. The service
// fires notifications in goroutines, so the alert arrives over a channel.
type captureNotifier struct {
	notify.NoopNotifier
	alerts chan notify.TenantSignupDetails
}

func (c *captureNotifier) TenantSignupAlert(_ context.Context, _ string, d notify.TenantSignupDetails) {
	c.alerts <- d
}

// TestVerifyEmailAlertCarriesTheLeadDetails pins a bug seen in production on
// 2026-08-25 with the first organic signup: the "email verified" alert built
// its details from scratch and left Slug, Phone and Source empty, so the one
// alert that says "write to this person now" was the one missing the way to
// reach them. The signup alert had them; this one dropped them on the floor.
func TestVerifyEmailAlertCarriesTheLeadDetails(t *testing.T) {
	ctx := context.Background()

	user := verifiedUser(t, testPassword)
	user.EmailVerifiedAt = nil
	name := "Juan Arrieta"
	user.DisplayName = &name
	user.Email = "juan@consultorio.test"

	repo := &fakeRepo{
		findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
		markVerified: func(context.Context, string) error { return nil },
		orgLeadInfo: func(_ context.Context, orgID string) (auth.OrgLead, error) {
			if orgID != user.OrganizationID {
				t.Errorf("OrgLeadInfo called with %q, want the user's org", orgID)
			}
			return auth.OrgLead{
				Name:   "Consultorio Juan",
				Slug:   "juan",
				Phone:  "573001234567",
				Source: "un colega",
			}, nil
		},
	}
	svc, mr := newTestService(t, repo)
	n := &captureNotifier{alerts: make(chan notify.TenantSignupDetails, 1)}
	svc.notifier = n
	svc.signupAlertEmail = "citas@chapni.com"

	const raw = "the-verification-token"
	if err := mr.Set(emailVerifyPrefix+hash.Token(raw), user.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.VerifyEmail(ctx, raw); err != nil {
		t.Fatalf("verify: %v", err)
	}

	var got notify.TenantSignupDetails
	select {
	case got = <-n.alerts:
	case <-time.After(2 * time.Second):
		t.Fatal("no operator alert was sent")
	}

	if !got.Verified {
		t.Error("Verified = false, want true — this is the post-confirmation alert")
	}
	if got.Slug != "juan" {
		t.Errorf("Slug = %q, want %q — the alert links to the tenant", got.Slug, "juan")
	}
	if got.Phone != "573001234567" {
		t.Errorf("Phone = %q, want the signup WhatsApp number", got.Phone)
	}
	if got.Source != "un colega" {
		t.Errorf("Source = %q, want the referral answer from the form", got.Source)
	}
	if got.OrgName != "Consultorio Juan" {
		t.Errorf("OrgName = %q, want the organization name", got.OrgName)
	}
	if got.AdminName != name || got.Email != user.Email {
		t.Errorf("owner identity is wrong: %+v", got)
	}
}
