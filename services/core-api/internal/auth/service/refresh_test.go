package service

import (
	"context"
	"errors"
	"testing"

	"sghcp/core-api/internal/auth"
)

// Refresh is the one place where a token can outlive the decision that granted
// it. Every test here is about that: rotation, the password epoch, and the fact
// that roles are reloaded rather than replayed from the stored payload.

func loggedIn(t *testing.T, user *auth.User) (*Service, *fakeRepo, string) {
	t.Helper()
	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
		findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, _ := newTestService(t, repo)
	pair, err := svc.Login(context.Background(), user.Email, testPassword, "127.0.0.1", "go-test")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	return svc, repo, pair.RefreshToken
}

func TestRefreshRotatesAndCannotBeReplayed(t *testing.T) {
	ctx := context.Background()
	svc, _, refresh := loggedIn(t, verifiedUser(t, testPassword))

	pair, err := svc.Refresh(ctx, refresh)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if pair.RefreshToken == refresh {
		t.Fatal("the refresh token was reissued unchanged — no rotation")
	}

	if _, err := svc.Refresh(ctx, refresh); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("replaying the consumed token: got %v, want ErrInvalidCredentials", err)
	}
	if _, err := svc.Refresh(ctx, pair.RefreshToken); err != nil {
		t.Errorf("the rotated token stopped working: %v", err)
	}
}

// TestRefreshReloadsRolesFromTheDatabase is the reason the stored payload is
// only a pointer. A role revoked mid-session must not survive in reissued
// claims for the whole refresh TTL.
func TestRefreshReloadsRolesFromTheDatabase(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)

	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
		findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, _ := newTestService(t, repo)

	pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	// The admin strips the clinical role while the session is live.
	user.Roles = []string{"RECEPTIONIST"}
	user.Permissions = nil

	rotated, err := svc.Refresh(ctx, pair.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}

	claims := parseAccess(t, rotated.AccessToken)
	if len(claims.Roles) != 1 || claims.Roles[0] != "RECEPTIONIST" {
		t.Errorf("roles = %v, want [RECEPTIONIST] — the revoked role survived the rotation", claims.Roles)
	}
	if len(claims.Permissions) != 0 {
		t.Errorf("permissions = %v, want none", claims.Permissions)
	}
}

func TestRefreshRejections(t *testing.T) {
	ctx := context.Background()

	t.Run("a token that was never issued", func(t *testing.T) {
		svc, _, _ := loggedIn(t, verifiedUser(t, testPassword))
		if _, err := svc.Refresh(ctx, "not-a-real-token"); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("got %v, want ErrInvalidCredentials", err)
		}
	})

	t.Run("an empty token", func(t *testing.T) {
		svc, _, _ := loggedIn(t, verifiedUser(t, testPassword))
		if _, err := svc.Refresh(ctx, ""); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("got %v, want ErrInvalidCredentials", err)
		}
	})

	t.Run("a stored payload that is not valid JSON", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		repo := &fakeRepo{
			findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
			findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
		}
		svc, mr := newTestService(t, repo)
		if err := mr.Set(refreshTokenPrefix+"corrupt", "{not json"); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Refresh(ctx, "corrupt"); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("got %v, want ErrInvalidCredentials", err)
		}
	})

	t.Run("the user was deleted", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		repo := &fakeRepo{
			findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
			findUserByID: func(context.Context, string) (*auth.User, error) { return nil, errors.New("no rows") },
		}
		svc, _ := newTestService(t, repo)
		pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		if _, err := svc.Refresh(ctx, pair.RefreshToken); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("got %v, want ErrInvalidCredentials", err)
		}
	})

	t.Run("the user was deactivated", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		svc, _, refresh := loggedIn(t, user)
		user.IsActive = false
		if _, err := svc.Refresh(ctx, refresh); !errors.Is(err, auth.ErrAccountInactive) {
			t.Errorf("got %v, want ErrAccountInactive", err)
		}
	})
}

// TestRefreshConsumesTheTokenEvenWhenItThenFails: the token is deleted before
// the epoch and user checks run. Without that, a token whose epoch is stale
// could be retried forever, and a rejected refresh would leave a live token
// behind in Redis.
func TestRefreshConsumesTheTokenEvenWhenItThenFails(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)

	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
		findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, mr := newTestService(t, repo)

	pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	// A password reset elsewhere bumps the epoch, invalidating this token.
	mr.Incr(pwEpochPrefix+user.ID, 1)

	if _, err := svc.Refresh(ctx, pair.RefreshToken); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("stale-epoch refresh: got %v, want ErrInvalidCredentials", err)
	}
	if mr.Exists(refreshTokenPrefix + pair.RefreshToken) {
		t.Error("the rejected refresh token is still live in redis")
	}
}

// TestPasswordEpochInvalidatesEverySession is the guarantee a reset has to
// deliver: not "the next login is safe" but "every outstanding session is
// already dead".
func TestPasswordEpochInvalidatesEverySession(t *testing.T) {
	ctx := context.Background()
	user := verifiedUser(t, testPassword)

	repo := &fakeRepo{
		findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
		findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
	}
	svc, mr := newTestService(t, repo)

	// Three devices signed in.
	var tokens []string
	for i := 0; i < 3; i++ {
		pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login %d: %v", i, err)
		}
		tokens = append(tokens, pair.RefreshToken)
	}

	mr.Incr(pwEpochPrefix+user.ID, 1)

	for i, tok := range tokens {
		if _, err := svc.Refresh(ctx, tok); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("session %d survived the epoch bump: %v", i, err)
		}
	}

	// And a fresh login works again under the new epoch.
	pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
	if err != nil {
		t.Fatalf("login after reset: %v", err)
	}
	if _, err := svc.Refresh(ctx, pair.RefreshToken); err != nil {
		t.Errorf("a session started after the reset was rejected: %v", err)
	}
}

func TestLogoutKillsTheRefreshToken(t *testing.T) {
	ctx := context.Background()
	svc, _, refresh := loggedIn(t, verifiedUser(t, testPassword))

	if err := svc.Logout(ctx, refresh); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, err := svc.Refresh(ctx, refresh); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("the token still works after logout: %v", err)
	}
	// Logging out twice, or with a token that never existed, is not an error:
	// the SPA calls this on every sign-out including expired sessions.
	if err := svc.Logout(ctx, refresh); err != nil {
		t.Errorf("second logout: %v", err)
	}
	if err := svc.Logout(ctx, "never-existed"); err != nil {
		t.Errorf("logout of an unknown token: %v", err)
	}
}
