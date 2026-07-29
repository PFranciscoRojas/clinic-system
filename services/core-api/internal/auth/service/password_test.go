package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
)

// Everything that writes a password goes through bcrypt and then ends every
// outstanding session. Both halves are asserted: a reset that does not bump the
// epoch leaves a compromised account reachable for the whole refresh TTL.

func TestChangePassword(t *testing.T) {
	ctx := context.Background()

	t.Run("rotates the hash and ends every session", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		var written string
		repo := &fakeRepo{
			findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
			findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
			updatePwByID: func(_ context.Context, _, passwordHash string) error {
				written = passwordHash
				return nil
			},
		}
		svc, mr := newTestService(t, repo)

		pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login: %v", err)
		}

		if err := svc.ChangePassword(ctx, user.ID, testPassword, "a-brand-new-password"); err != nil {
			t.Fatalf("change password: %v", err)
		}

		// The stored value must be a bcrypt hash of the new password — never the
		// password, and never the old hash.
		if written == "" {
			t.Fatal("no new password hash was persisted")
		}
		if strings.Contains(written, "a-brand-new-password") {
			t.Fatalf("the password was stored in the clear: %q", written)
		}
		if err := bcrypt.CompareHashAndPassword([]byte(written), []byte("a-brand-new-password")); err != nil {
			t.Errorf("the stored hash does not match the new password: %v", err)
		}
		if err := bcrypt.CompareHashAndPassword([]byte(written), []byte(testPassword)); err == nil {
			t.Error("the stored hash still matches the old password")
		}

		if !mr.Exists(pwEpochPrefix + user.ID) {
			t.Fatal("the password epoch was not bumped — outstanding sessions survive")
		}
		if _, err := svc.Refresh(ctx, pair.RefreshToken); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("the session started before the change still refreshes: %v", err)
		}
	})

	t.Run("rejections", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		cases := []struct {
			name        string
			current     string
			next        string
			userMissing bool
			want        error
		}{
			{"wrong current password", "not-it", "a-brand-new-password", false, auth.ErrInvalidCredentials},
			{"empty current password", "", "a-brand-new-password", false, auth.ErrInvalidCredentials},
			{"new password too short", testPassword, "1234567", false, auth.ErrWeakPassword},
			{"new password empty", testPassword, "", false, auth.ErrWeakPassword},
			{"unknown user", testPassword, "a-brand-new-password", true, auth.ErrUserNotFound},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				var persisted bool
				repo := &fakeRepo{
					findUserByID: func(context.Context, string) (*auth.User, error) {
						if tc.userMissing {
							return nil, errors.New("no rows")
						}
						return user, nil
					},
					updatePwByID: func(context.Context, string, string) error {
						persisted = true
						return nil
					},
				}
				svc, mr := newTestService(t, repo)

				err := svc.ChangePassword(ctx, user.ID, tc.current, tc.next)
				if !errors.Is(err, tc.want) {
					t.Fatalf("err = %v, want %v", err, tc.want)
				}
				if persisted {
					t.Error("a rejected change still wrote a new password hash")
				}
				if mr.Exists(pwEpochPrefix + user.ID) {
					t.Error("a rejected change still ended every session")
				}
			})
		}
	})

	// Exactly 8 characters is the documented minimum, not 9.
	t.Run("the minimum length boundary", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		repo := &fakeRepo{
			findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
			updatePwByID: func(context.Context, string, string) error { return nil },
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ChangePassword(ctx, user.ID, testPassword, "1234567"); !errors.Is(err, auth.ErrWeakPassword) {
			t.Errorf("7 characters: got %v, want ErrWeakPassword", err)
		}
		if err := svc.ChangePassword(ctx, user.ID, testPassword, "12345678"); err != nil {
			t.Errorf("8 characters: got %v, want it accepted", err)
		}
	})
}

func TestVerifyPassword(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)

	repo := &fakeRepo{
		findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, _ := newTestService(t, repo)

	if err := svc.VerifyPassword(ctx, user.ID, testPassword); err != nil {
		t.Errorf("correct password: %v", err)
	}
	if err := svc.VerifyPassword(ctx, user.ID, "wrong"); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("wrong password: got %v, want ErrInvalidCredentials", err)
	}

	missing := &fakeRepo{
		findUserByID: func(context.Context, string) (*auth.User, error) { return nil, errors.New("no rows") },
	}
	svcMissing, _ := newTestService(t, missing)
	if err := svcMissing.VerifyPassword(ctx, "ghost", testPassword); !errors.Is(err, auth.ErrUserNotFound) {
		t.Errorf("unknown user: got %v, want ErrUserNotFound", err)
	}
}

// TestRequestPasswordResetNeverEnumeratesAccounts: the endpoint must behave
// identically for a registered address, an unknown one, and a disabled one.
// The only observable difference is whether a token landed in Redis.
func TestRequestPasswordReset(t *testing.T) {
	ctx := context.Background()
	active := verifiedUser(t, testPassword)

	disabled := verifiedUser(t, testPassword)
	disabled.IsActive = false

	cases := []struct {
		name      string
		user      *auth.User // nil = unknown address
		wantToken bool
	}{
		{"registered and active", active, true},
		{"unknown address", nil, false},
		{"disabled account", disabled, false},
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

			// Same nil error every time: the handler returns 200 regardless, so
			// nothing here may distinguish the three cases to the caller.
			if err := svc.RequestPasswordReset(ctx, "pro@clinic.test"); err != nil {
				t.Fatalf("err = %v, want nil for every case", err)
			}

			keys := mr.Keys()
			var resetKeys int
			for _, k := range keys {
				if strings.HasPrefix(k, pwResetPrefix) {
					resetKeys++
				}
			}
			if (resetKeys > 0) != tc.wantToken {
				t.Errorf("%d reset tokens stored, wantToken = %v", resetKeys, tc.wantToken)
			}
		})
	}
}

// TestConfirmPasswordReset covers the consumption of the emailed token. Only
// the hash is stored, so a database or Redis dump must not yield a usable link.
func TestConfirmPasswordReset(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)

	// The raw token exists only inside the emailed link, and the notifier is a
	// no-op here, so it is unrecoverable by design. The confirm side is
	// therefore driven by seeding Redis exactly the way RequestPasswordReset
	// does — which TestRequestPasswordReset and TestResetTokenIsStoredHashed
	// verify independently.
	newSvc := func(t *testing.T) (*Service, *miniredis.Miniredis, *string) {
		t.Helper()
		written := new(string)
		repo := &fakeRepo{
			findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
			findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
			findByEmail:  func(context.Context, string) (*auth.User, error) { return user, nil },
			updatePwByID: func(_ context.Context, _, passwordHash string) error {
				*written = passwordHash
				return nil
			},
		}
		svc, mr := newTestService(t, repo)
		return svc, mr, written
	}

	t.Run("a valid token sets the password and ends every session", func(t *testing.T) {
		svc, mr, written := newSvc(t)

		pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login: %v", err)
		}

		const raw = "the-token-that-went-out-in-the-email"
		if err := mr.Set(pwResetPrefix+hash.Token(raw), user.ID); err != nil {
			t.Fatal(err)
		}

		if err := svc.ConfirmPasswordReset(ctx, raw, "a-brand-new-password"); err != nil {
			t.Fatalf("confirm: %v", err)
		}
		if err := bcrypt.CompareHashAndPassword([]byte(*written), []byte("a-brand-new-password")); err != nil {
			t.Errorf("the stored hash does not match the new password: %v", err)
		}
		if _, err := svc.Refresh(ctx, pair.RefreshToken); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("a session from before the reset still refreshes: %v", err)
		}

		// One-time: the same link cannot be used twice.
		if err := svc.ConfirmPasswordReset(ctx, raw, "yet-another-password"); !errors.Is(err, auth.ErrInviteInvalid) {
			t.Errorf("replayed reset link: got %v, want ErrInviteInvalid", err)
		}
	})

	t.Run("rejections", func(t *testing.T) {
		cases := []struct {
			name  string
			token string
			next  string
			want  error
		}{
			{"unknown token", "never-issued", "a-brand-new-password", auth.ErrInviteInvalid},
			{"empty token", "", "a-brand-new-password", auth.ErrInviteInvalid},
			{"password too short", "never-issued", "1234567", auth.ErrWeakPassword},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				svc, _, written := newSvc(t)
				if err := svc.ConfirmPasswordReset(ctx, tc.token, tc.next); !errors.Is(err, tc.want) {
					t.Errorf("err = %v, want %v", err, tc.want)
				}
				if *written != "" {
					t.Error("a rejected reset still wrote a password hash")
				}
			})
		}
	})
}

// TestResetTokenIsStoredHashed: the raw token exists only inside the emailed
// link. Anything that can read Redis must not be able to reset an account.
func TestResetTokenIsStoredHashed(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)
	repo := &fakeRepo{
		findByEmail: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, mr := newTestService(t, repo)

	if err := svc.RequestPasswordReset(ctx, user.Email); err != nil {
		t.Fatalf("request reset: %v", err)
	}

	var key string
	for _, k := range mr.Keys() {
		if strings.HasPrefix(k, pwResetPrefix) {
			key = k
		}
	}
	if key == "" {
		t.Fatal("no reset token was stored")
	}

	// Whatever is in Redis must not itself work as the link token. If the raw
	// token were stored, this would succeed and anyone able to read Redis could
	// take over any account.
	stored := strings.TrimPrefix(key, pwResetPrefix)
	if err := svc.ConfirmPasswordReset(ctx, stored, "a-brand-new-password"); !errors.Is(err, auth.ErrInviteInvalid) {
		t.Errorf("the key stored in redis works as a reset token (got %v) — "+
			"the raw token was stored instead of its hash", err)
	}
}

func TestResetPasswordByAdmin(t *testing.T) {
	ctx := context.Background()

	t.Run("hashes before persisting", func(t *testing.T) {
		var gotOrg, gotEmail, gotHash string
		repo := &fakeRepo{}
		repo.updatePassword = func(_ context.Context, orgID, targetEmail, passwordHash string) error {
			gotOrg, gotEmail, gotHash = orgID, targetEmail, passwordHash
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ResetPassword(ctx, "org-1", "target@clinic.test", "admin-set-password"); err != nil {
			t.Fatalf("reset: %v", err)
		}
		if gotOrg != "org-1" || gotEmail != "target@clinic.test" {
			t.Errorf("scope lost: org=%q email=%q", gotOrg, gotEmail)
		}
		if err := bcrypt.CompareHashAndPassword([]byte(gotHash), []byte("admin-set-password")); err != nil {
			t.Errorf("the persisted value is not a bcrypt hash of the new password: %v", err)
		}
	})

	t.Run("weak password is rejected before touching the database", func(t *testing.T) {
		var called bool
		repo := &fakeRepo{}
		repo.updatePassword = func(context.Context, string, string, string) error {
			called = true
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ResetPassword(ctx, "org-1", "target@clinic.test", "short"); !errors.Is(err, auth.ErrWeakPassword) {
			t.Errorf("err = %v, want ErrWeakPassword", err)
		}
		if called {
			t.Error("a rejected reset still called the repository")
		}
	})
}
