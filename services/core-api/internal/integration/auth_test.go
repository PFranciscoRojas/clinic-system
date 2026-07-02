package integration

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	authrepo "sghcp/core-api/internal/auth/repository"
	authservice "sghcp/core-api/internal/auth/service"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/hash"
)

var initPepper sync.Once

// newAuthService wires the real repository (against the containerized DB, as
// sghcp_app — exactly the prod role) with the real service and a miniredis.
func newAuthService(t *testing.T) (*authservice.Service, *miniredis.Miniredis) {
	t.Helper()
	initPepper.Do(func() {
		if err := hash.Init(strings.Repeat("ab", 32)); err != nil {
			t.Fatalf("hash.Init: %v", err)
		}
	})

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	cfg := config.Config{
		JWTSecret:         "integration-test-secret",
		JWTAccessTTLMin:   15,
		JWTRefreshTTLDays: 7,
		AppBaseURL:        "https://test.local",
	}
	return authservice.New(authrepo.New(appPool), rdb, cfg), mr
}

// seedLoginUser creates a verified, active user with a bcrypt password and the
// system PROFESSIONAL role, inside its own org.
func seedLoginUser(t *testing.T, slug, email, password string) (orgID, userID string) {
	t.Helper()
	ctx := context.Background()

	if err := adminPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"Auth "+slug, slug,
	).Scan(&orgID); err != nil {
		t.Fatalf("seed org: %v", err)
	}

	pw, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := adminPool.QueryRow(ctx,
		`INSERT INTO users (organization_id, email, email_hash, password_hash, display_name, email_verified_at)
		 VALUES ($1, $2, $3, $4, 'Test User', NOW()) RETURNING id`,
		orgID, email, hash.Normalize(email), string(pw),
	).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	if _, err := adminPool.Exec(ctx,
		`INSERT INTO user_roles (organization_id, user_id, role_id)
		 SELECT $2, $1, id FROM roles WHERE name = 'PROFESSIONAL' AND organization_id IS NULL`,
		userID, orgID,
	); err != nil {
		t.Fatalf("seed role: %v", err)
	}
	return orgID, userID
}

func TestLogin(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()
	svc, _ := newAuthService(t)

	const email, password = "login@test.local", "correct-horse-battery"
	seedLoginUser(t, "auth-login", email, password)

	t.Run("valid credentials issue a token pair", func(t *testing.T) {
		pair, err := svc.Login(ctx, email, password, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		if pair.AccessToken == "" || pair.RefreshToken == "" {
			t.Fatal("empty token pair")
		}
	})

	t.Run("unknown email and wrong password are indistinguishable", func(t *testing.T) {
		_, errUnknown := svc.Login(ctx, "ghost@test.local", password, "127.0.0.1", "go-test")
		_, errWrongPw := svc.Login(ctx, email, "wrong-password", "127.0.0.1", "go-test")
		if !errors.Is(errUnknown, auth.ErrInvalidCredentials) {
			t.Errorf("unknown email: got %v, want ErrInvalidCredentials", errUnknown)
		}
		if !errors.Is(errWrongPw, auth.ErrInvalidCredentials) {
			t.Errorf("wrong password: got %v, want ErrInvalidCredentials", errWrongPw)
		}
	})

	t.Run("five failures lock the account, even with the right password", func(t *testing.T) {
		const lockEmail = "lockme@test.local"
		seedLoginUser(t, "auth-lock", lockEmail, password)

		for i := 0; i < 5; i++ {
			_, _ = svc.Login(ctx, lockEmail, "wrong-password", "127.0.0.1", "go-test")
		}
		_, err := svc.Login(ctx, lockEmail, password, "127.0.0.1", "go-test")
		if !errors.Is(err, auth.ErrAccountLocked) {
			t.Fatalf("after 5 failures: got %v, want ErrAccountLocked", err)
		}
	})
}

func TestRefresh(t *testing.T) {
	skipIfShort(t)
	ctx := context.Background()

	login := func(t *testing.T, svc *authservice.Service, email, password string) string {
		t.Helper()
		pair, err := svc.Login(ctx, email, password, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		return pair.RefreshToken
	}

	t.Run("rotation: a used refresh token cannot be replayed", func(t *testing.T) {
		svc, _ := newAuthService(t)
		const email, password = "rotate@test.local", "s3cret-enough"
		seedLoginUser(t, "auth-rotate", email, password)
		refresh := login(t, svc, email, password)

		pair2, err := svc.Refresh(ctx, refresh)
		if err != nil {
			t.Fatalf("first refresh: %v", err)
		}
		if pair2.RefreshToken == refresh {
			t.Fatal("refresh token was not rotated")
		}
		if _, err := svc.Refresh(ctx, refresh); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Fatalf("replayed refresh: got %v, want ErrInvalidCredentials", err)
		}
		// The rotated token keeps working.
		if _, err := svc.Refresh(ctx, pair2.RefreshToken); err != nil {
			t.Fatalf("rotated refresh: %v", err)
		}
	})

	t.Run("password epoch bump invalidates outstanding tokens", func(t *testing.T) {
		svc, mr := newAuthService(t)
		const email, password = "epoch@test.local", "s3cret-enough"
		_, userID := seedLoginUser(t, "auth-epoch", email, password)
		refresh := login(t, svc, email, password)

		// What a password reset does: bump the per-user epoch counter.
		mr.Incr("pwepoch:"+userID, 1)

		if _, err := svc.Refresh(ctx, refresh); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Fatalf("stale-epoch refresh: got %v, want ErrInvalidCredentials", err)
		}
	})

	t.Run("deactivated user cannot refresh", func(t *testing.T) {
		svc, _ := newAuthService(t)
		const email, password = "inactive@test.local", "s3cret-enough"
		_, userID := seedLoginUser(t, "auth-inactive", email, password)
		refresh := login(t, svc, email, password)

		if _, err := adminPool.Exec(ctx,
			`UPDATE users SET is_active = FALSE WHERE id = $1`, userID); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Refresh(ctx, refresh); !errors.Is(err, auth.ErrAccountInactive) {
			t.Fatalf("inactive refresh: got %v, want ErrAccountInactive", err)
		}
	})

	t.Run("garbage token is rejected", func(t *testing.T) {
		svc, _ := newAuthService(t)
		if _, err := svc.Refresh(ctx, "not-a-real-token"); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Fatalf("garbage refresh: got %v, want ErrInvalidCredentials", err)
		}
	})
}
