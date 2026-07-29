package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
)

// Register redeems an admin-issued invite. The invite is one-time, so every
// failure path has to decide whether to consume it or hand it back — a code
// burned on a typo means the admin has to reissue, and a code that survives a
// successful registration is a free extra seat.

type registerFixture struct {
	svc  *Service
	repo *fakeRepo
	code string
}

func newRegisterFixture(t *testing.T, roleName string, seatUsed, seatLimit int, seatStatus string) *registerFixture {
	t.Helper()

	created := verifiedUser(t, testPassword)
	created.ID = "new-user"

	repo := &fakeRepo{}
	repo.seatUsage = func(context.Context, string, string) (int, int, string, error) {
		return seatUsed, seatLimit, seatStatus, nil
	}
	repo.findInOrg = func(context.Context, string, string) (*auth.User, error) {
		return nil, errors.New("no rows") // free by default; tests override
	}
	repo.createUser = func(context.Context, string, string, string, string) (string, error) {
		return created.ID, nil
	}
	repo.markVerified = func(context.Context, string) error { return nil }
	repo.findRoleID = func(_ context.Context, name string) (string, error) { return "role-" + name, nil }
	repo.assignRole = func(context.Context, string, string, string, string) error { return nil }

	svc, mr := newTestService(t, repo)
	repo.mr = mr

	code := "TESTCODE"
	payload, err := json.Marshal(auth.InvitePayload{
		OrgID: "org-1", RoleName: roleName, CreatedBy: "admin-1",
		ExpiresAt: time.Now().Add(inviteTTL),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := mr.Set(invitePrefix+hash.Token(code), string(payload)); err != nil {
		t.Fatal(err)
	}
	return &registerFixture{svc: svc, repo: repo, code: code}
}

func TestRegisterRedeemsAnInvite(t *testing.T) {
	ctx := context.Background()
	f := newRegisterFixture(t, "PROFESSIONAL", 0, 10, "active")

	created := verifiedUser(t, testPassword)
	created.ID = "new-user"

	var gotOrg, gotEmail, gotHash, gotName string
	f.repo.createUser = func(_ context.Context, orgID, email, passwordHash, displayName string) (string, error) {
		gotOrg, gotEmail, gotHash, gotName = orgID, email, passwordHash, displayName
		return created.ID, nil
	}
	// After creation the service reloads the user to build the claims.
	calls := 0
	f.repo.findInOrg = func(context.Context, string, string) (*auth.User, error) {
		calls++
		if calls == 1 {
			return nil, errors.New("no rows") // the duplicate guard
		}
		return created, nil
	}
	var verified, assignedRole string
	f.repo.markVerified = func(_ context.Context, userID string) error {
		verified = userID
		return nil
	}
	f.repo.assignRole = func(_ context.Context, _, _, roleID, _ string) error {
		assignedRole = roleID
		return nil
	}

	pair, err := f.svc.Register(ctx, f.code, "nuevo@clinic.test", "una-clave-decente", "Nuevo Colega")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("no token pair issued")
	}

	if gotOrg != "org-1" || gotEmail != "nuevo@clinic.test" || gotName != "Nuevo Colega" {
		t.Errorf("CreateUser(org=%q email=%q name=%q)", gotOrg, gotEmail, gotName)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(gotHash), []byte("una-clave-decente")); err != nil {
		t.Errorf("the persisted value is not a bcrypt hash of the password: %v", err)
	}

	// An admin-issued code is itself proof the address is trusted, so there is
	// no confirmation email — and login requires a verified address, so
	// skipping this would leave the invited user unable to sign in at all.
	if verified != created.ID {
		t.Errorf("MarkEmailVerified(%q), want %q", verified, created.ID)
	}
	if assignedRole != "role-PROFESSIONAL" {
		t.Errorf("assigned role %q, want role-PROFESSIONAL", assignedRole)
	}

	// One-time: the code must be gone.
	if f.repo.mr.Exists(invitePrefix + hash.Token(f.code)) {
		t.Error("the invite code survived a successful registration")
	}
	if _, err := f.svc.Register(ctx, f.code, "otro@clinic.test", "una-clave-decente", "Otro"); !errors.Is(err, auth.ErrInviteInvalid) {
		t.Errorf("replayed code: got %v, want ErrInviteInvalid", err)
	}
}

func TestRegisterRejections(t *testing.T) {
	ctx := context.Background()

	t.Run("password too short, before the code is touched", func(t *testing.T) {
		f := newRegisterFixture(t, "PROFESSIONAL", 0, 10, "active")

		if _, err := f.svc.Register(ctx, f.code, "nuevo@clinic.test", "1234567", "Nuevo"); !errors.Is(err, auth.ErrWeakPassword) {
			t.Fatalf("err = %v, want ErrWeakPassword", err)
		}
		if !f.repo.mr.Exists(invitePrefix + hash.Token(f.code)) {
			t.Error("a weak password burned the invite code")
		}
	})

	t.Run("unknown code", func(t *testing.T) {
		f := newRegisterFixture(t, "PROFESSIONAL", 0, 10, "active")
		if _, err := f.svc.Register(ctx, "NOTACODE", "nuevo@clinic.test", "una-clave-decente", "Nuevo"); !errors.Is(err, auth.ErrInviteInvalid) {
			t.Errorf("err = %v, want ErrInviteInvalid", err)
		}
	})

	t.Run("a corrupt stored payload", func(t *testing.T) {
		f := newRegisterFixture(t, "PROFESSIONAL", 0, 10, "active")
		if err := f.repo.mr.Set(invitePrefix+hash.Token("BROKEN"), "{not json"); err != nil {
			t.Fatal(err)
		}
		if _, err := f.svc.Register(ctx, "BROKEN", "nuevo@clinic.test", "una-clave-decente", "Nuevo"); !errors.Is(err, auth.ErrInviteInvalid) {
			t.Errorf("err = %v, want ErrInviteInvalid", err)
		}
	})
}

// TestRegisterRestoresTheInviteOnRecoverableFailures is the behaviour worth
// pinning hardest. Both of these are the invitee's or the plan's problem, not
// the code's — burning it would force the admin to issue a new one for a
// mistyped address or a seat that frees up minutes later.
func TestRegisterRestoresTheInviteOnRecoverableFailures(t *testing.T) {
	ctx := context.Background()

	t.Run("the email already exists in the org", func(t *testing.T) {
		f := newRegisterFixture(t, "PROFESSIONAL", 0, 10, "active")
		f.repo.findInOrg = func(context.Context, string, string) (*auth.User, error) {
			return verifiedUser(t, testPassword), nil
		}
		var created bool
		f.repo.createUser = func(context.Context, string, string, string, string) (string, error) {
			created = true
			return "", nil
		}

		if _, err := f.svc.Register(ctx, f.code, "taken@clinic.test", "una-clave-decente", "Nuevo"); !errors.Is(err, auth.ErrEmailAlreadyExists) {
			t.Fatalf("err = %v, want ErrEmailAlreadyExists", err)
		}
		if created {
			t.Error("a duplicate address still created a user")
		}
		if !f.repo.mr.Exists(invitePrefix + hash.Token(f.code)) {
			t.Error("the invite was consumed — the invitee cannot retry with a corrected address")
		}
	})

	t.Run("the last seat was taken between issue and redemption", func(t *testing.T) {
		f := newRegisterFixture(t, "PROFESSIONAL", 3, 3, "active")
		var created bool
		f.repo.createUser = func(context.Context, string, string, string, string) (string, error) {
			created = true
			return "", nil
		}

		if _, err := f.svc.Register(ctx, f.code, "nuevo@clinic.test", "una-clave-decente", "Nuevo"); !errors.Is(err, auth.ErrSeatLimit) {
			t.Fatalf("err = %v, want ErrSeatLimit", err)
		}
		if created {
			t.Error("a user was created past the seat limit")
		}
		if !f.repo.mr.Exists(invitePrefix + hash.Token(f.code)) {
			t.Error("the invite was consumed — it must survive until a seat frees up")
		}
	})

	// A non-clinical invite is never seat-limited, so a full plan must not stop
	// a receptionist from joining.
	t.Run("a receptionist joins a full plan", func(t *testing.T) {
		f := newRegisterFixture(t, "RECEPTIONIST", 3, 3, "active")
		created := verifiedUser(t, testPassword)
		calls := 0
		f.repo.findInOrg = func(context.Context, string, string) (*auth.User, error) {
			calls++
			if calls == 1 {
				return nil, errors.New("no rows")
			}
			return created, nil
		}

		if _, err := f.svc.Register(ctx, f.code, "recepcion@clinic.test", "una-clave-decente", "Recepción"); err != nil {
			t.Errorf("a receptionist was blocked by the clinical seat limit: %v", err)
		}
	})
}
