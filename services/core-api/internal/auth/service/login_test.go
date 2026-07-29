package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
	"sghcp/core-api/internal/shared/token"
)

const testPassword = "correct-horse-battery"

func TestLoginIssuesUsableClaims(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)
	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, mr := newTestService(t, repo)

	pair, err := svc.Login(ctx, user.Email, testPassword, "203.0.113.9", "go-test")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if pair.RefreshToken == "" {
		t.Fatal("no refresh token issued")
	}
	if pair.ExpiresIn != 15*60 {
		t.Errorf("ExpiresIn = %d, want 900 (the configured 15-minute access TTL)", pair.ExpiresIn)
	}

	// The access token is what every downstream middleware reads. If roles or
	// permissions do not survive into it, authorization silently degrades to
	// "authenticated but entitled to nothing".
	var claims token.Claims
	parsed, err := jwt.ParseWithClaims(pair.AccessToken, &claims, func(*jwt.Token) (any, error) {
		return []byte("unit-test-secret"), nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("the issued access token does not verify: %v", err)
	}
	if claims.UserID != user.ID {
		t.Errorf("UserID = %q, want %q", claims.UserID, user.ID)
	}
	if claims.OrganizationID != user.OrganizationID {
		t.Errorf("org = %q, want %q", claims.OrganizationID, user.OrganizationID)
	}
	if len(claims.Roles) != 1 || claims.Roles[0] != "PROFESSIONAL" {
		t.Errorf("roles = %v, want [PROFESSIONAL]", claims.Roles)
	}
	if len(claims.Permissions) != 1 || claims.Permissions[0] != "patients:read" {
		t.Errorf("permissions = %v, want [patients:read]", claims.Permissions)
	}
	// A token with no expiry would never stop working.
	if claims.ExpiresAt == nil || !claims.ExpiresAt.After(time.Now()) {
		t.Errorf("ExpiresAt = %v, want a time in the future", claims.ExpiresAt)
	}

	// The refresh token must exist in Redis under the documented prefix, and the
	// stored payload must not be a snapshot of roles (that is the whole reason
	// Refresh reloads the user).
	stored, err := mr.Get(refreshTokenPrefix + pair.RefreshToken)
	if err != nil {
		t.Fatalf("refresh token was not stored in redis: %v", err)
	}
	for _, leaked := range []string{"PROFESSIONAL", "patients:read", user.Email} {
		if strings.Contains(stored, leaked) {
			t.Errorf("the refresh payload carries %q; it must stay a pointer, not a snapshot:\n%s", leaked, stored)
		}
	}

	if len(repo.clearedFor) != 1 || repo.clearedFor[0] != user.ID {
		t.Errorf("failed-attempt counter cleared for %v, want exactly [%s]", repo.clearedFor, user.ID)
	}
	if entry := repo.lastAudit(t); !entry.Success || entry.Action != "auth.login" {
		t.Errorf("audit entry = %+v, want a successful auth.login", entry)
	}
}

// TestIssuedTokenCarriesTheUserInSubOnly documents a live quirk rather than a
// requirement. token.Claims declares UserID with `json:"sub"`, and it also
// embeds jwt.RegisteredClaims, whose Subject is *also* "sub". encoding/json
// resolves the collision in favour of the shallower field, so:
//
//   - Subject is never written to the token, and
//   - Subject is always empty after parsing, whatever was set before signing.
//
// issueTokenPair's `Subject: user.ID` is therefore dead. Nothing reads
// claims.Subject today, so nothing is broken — but anything that starts to will
// silently get "". This test fails the moment that changes, which is the point.
func TestIssuedTokenCarriesTheUserInSubOnly(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)
	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, _ := newTestService(t, repo)

	pair, err := svc.Login(ctx, user.Email, testPassword, "203.0.113.9", "go-test")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	var claims token.Claims
	if _, err := jwt.ParseWithClaims(pair.AccessToken, &claims, func(*jwt.Token) (any, error) {
		return []byte("unit-test-secret"), nil
	}); err != nil {
		t.Fatalf("parse: %v", err)
	}

	if claims.UserID != user.ID {
		t.Errorf("UserID = %q, want %q — the sub claim must carry the user id", claims.UserID, user.ID)
	}
	if claims.Subject != "" {
		t.Errorf("Subject = %q, want \"\". If this now round-trips, the tag collision "+
			"between Claims.UserID and RegisteredClaims.Subject was resolved — "+
			"update this test and drop the dead assignment in issueTokenPair.", claims.Subject)
	}
}

// TestLoginRejections walks every denial. The error returned matters as much as
// the denial itself: an unknown address and a wrong password must be
// indistinguishable, or the endpoint becomes an account-enumeration oracle.
func TestLoginRejections(t *testing.T) {
	ctx := context.Background()
	locked := time.Now().Add(10 * time.Minute)
	pastLock := time.Now().Add(-time.Minute)

	cases := []struct {
		name          string
		user          *auth.User // nil = FindForLogin fails (unknown address)
		password      string
		wantErr       error
		wantErrorCode string
	}{
		{
			name: "unknown email", user: nil, password: testPassword,
			wantErr: auth.ErrInvalidCredentials, wantErrorCode: "INVALID_CREDENTIALS",
		},
		{
			name: "wrong password", password: "not-the-password",
			wantErr: auth.ErrInvalidCredentials, wantErrorCode: "INVALID_CREDENTIALS",
		},
		{
			name:     "empty password",
			password: "",
			wantErr:  auth.ErrInvalidCredentials, wantErrorCode: "INVALID_CREDENTIALS",
		},
		{
			name: "currently locked out", password: testPassword,
			user: func() *auth.User {
				u := verifiedUser(t, testPassword)
				u.LockedUntil = &locked
				return u
			}(),
			wantErr: auth.ErrAccountLocked, wantErrorCode: "ACCOUNT_LOCKED",
		},
		{
			name: "deactivated account", password: testPassword,
			user: func() *auth.User {
				u := verifiedUser(t, testPassword)
				u.IsActive = false
				return u
			}(),
			wantErr: auth.ErrAccountInactive, wantErrorCode: "ACCOUNT_INACTIVE",
		},
		{
			name: "email never verified", password: testPassword,
			user: func() *auth.User {
				u := verifiedUser(t, testPassword)
				u.EmailVerifiedAt = nil
				return u
			}(),
			wantErr: auth.ErrEmailNotVerified, wantErrorCode: "EMAIL_NOT_VERIFIED",
		},
		{
			name: "an expired lockout no longer blocks", password: testPassword,
			user: func() *auth.User {
				u := verifiedUser(t, testPassword)
				u.LockedUntil = &pastLock
				return u
			}(),
			wantErr: nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			u := tc.user
			if u == nil && tc.name != "unknown email" {
				u = verifiedUser(t, testPassword)
			}
			repo := &fakeRepo{
				findForLogin: func(context.Context, string) (*auth.User, error) {
					if u == nil {
						return nil, errors.New("no rows")
					}
					return u, nil
				},
			}
			svc, _ := newTestService(t, repo)

			_, err := svc.Login(ctx, "pro@clinic.test", tc.password, "203.0.113.9", "go-test")

			if tc.wantErr == nil {
				if err != nil {
					t.Fatalf("login: %v", err)
				}
				return
			}
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}

			entry := repo.lastAudit(t)
			if entry.Success {
				t.Error("a failed login was audited as successful")
			}
			if entry.ErrorCode == nil || *entry.ErrorCode != tc.wantErrorCode {
				t.Errorf("audit ErrorCode = %v, want %q", entry.ErrorCode, tc.wantErrorCode)
			}
			if entry.IP != "203.0.113.9" || entry.UserAgent != "go-test" {
				t.Errorf("audit lost the request context: ip=%q ua=%q", entry.IP, entry.UserAgent)
			}
			// The audit trail identifies the attempt by email hash, never by the
			// address itself (CLAUDE.md rule 4).
			if entry.EmailHash != hash.Normalize("pro@clinic.test") {
				t.Errorf("audit EmailHash = %q, want the normalized hash", entry.EmailHash)
			}
			if strings.Contains(entry.EmailHash, "@") {
				t.Errorf("the audit log stored a plaintext address: %q", entry.EmailHash)
			}
		})
	}
}

// TestLoginLockoutBoundary pins the exact threshold. Off by one in either
// direction is a real bug: one way locks users out a try early, the other gives
// an attacker a free guess.
func TestLoginLockoutBoundary(t *testing.T) {
	ctx := context.Background()

	for attempts := 0; attempts < maxFailedAttempts+1; attempts++ {
		t.Run(fmt.Sprintf("with %d prior failures", attempts), func(t *testing.T) {
			u := verifiedUser(t, testPassword)
			u.FailedAttempts = attempts
			repo := &fakeRepo{
				findForLogin: func(context.Context, string) (*auth.User, error) { return u, nil },
			}
			svc, _ := newTestService(t, repo)

			_, err := svc.Login(ctx, u.Email, "wrong-password", "203.0.113.9", "go-test")
			if !errors.Is(err, auth.ErrInvalidCredentials) {
				t.Fatalf("err = %v, want ErrInvalidCredentials", err)
			}

			// This failure is the (attempts+1)-th. Locking happens exactly when
			// that reaches maxFailedAttempts.
			wantLocked := attempts+1 >= maxFailedAttempts
			gotLocked := len(repo.lockedFor) > 0
			if gotLocked != wantLocked {
				t.Errorf("locked = %v after failure number %d, want %v (threshold is %d)",
					gotLocked, attempts+1, wantLocked, maxFailedAttempts)
			}
			if len(repo.incrementedFor) != 1 {
				t.Errorf("failed-attempt counter incremented %d times, want 1", len(repo.incrementedFor))
			}
		})
	}
}

// TestLoginDoesNotCountAttemptsOnSuccess: a correct password must reset the
// counter, not add to it, or a user who mistypes twice a week eventually locks
// themselves out of an account they never got wrong.
func TestLoginDoesNotCountAttemptsOnSuccess(t *testing.T) {
	ctx := context.Background()
	u := verifiedUser(t, testPassword)
	u.FailedAttempts = maxFailedAttempts - 1

	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return u, nil },
	}
	svc, _ := newTestService(t, repo)

	if _, err := svc.Login(ctx, u.Email, testPassword, "203.0.113.9", "go-test"); err != nil {
		t.Fatalf("login: %v", err)
	}
	if len(repo.lockedFor) != 0 {
		t.Error("a successful login locked the account")
	}
	if len(repo.incrementedFor) != 0 {
		t.Error("a successful login incremented the failed-attempt counter")
	}
	if len(repo.clearedFor) != 1 {
		t.Errorf("failed-attempt counter cleared %d times, want 1", len(repo.clearedFor))
	}
}

// TestLoginChecksPasswordBeforeAccountState is the ordering the comments in
// login.go promise: a wrong guess must not reveal that the address exists but
// is unverified or disabled.
func TestLoginChecksPasswordBeforeAccountState(t *testing.T) {
	ctx := context.Background()

	for _, tc := range []struct {
		name   string
		mutate func(*auth.User)
	}{
		{"inactive", func(u *auth.User) { u.IsActive = false }},
		{"unverified", func(u *auth.User) { u.EmailVerifiedAt = nil }},
	} {
		t.Run(tc.name+" account with a wrong password", func(t *testing.T) {
			u := verifiedUser(t, testPassword)
			tc.mutate(u)
			repo := &fakeRepo{
				findForLogin: func(context.Context, string) (*auth.User, error) { return u, nil },
			}
			svc, _ := newTestService(t, repo)

			_, err := svc.Login(ctx, u.Email, "wrong-password", "203.0.113.9", "go-test")
			if !errors.Is(err, auth.ErrInvalidCredentials) {
				t.Fatalf("err = %v, want ErrInvalidCredentials — the state of the "+
					"account leaked to someone who does not know the password", err)
			}
		})
	}
}
