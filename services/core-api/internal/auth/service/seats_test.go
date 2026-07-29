package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
)

// Seats are what the plan is priced on, so the gate has to be exact in both
// directions: letting a paid clinic past its limit is lost revenue, and
// blocking a trial is a broken evaluation.

func TestEnsureSeatAvailable(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name    string
		role    string
		used    int
		limit   int
		status  string
		wantErr error
	}{
		// Only clinical roles consume a seat.
		{"receptionist never consumes a seat", "RECEPTIONIST", 99, 1, "active", nil},
		{"clinic admin never consumes a seat", "CLINIC_ADMIN", 99, 1, "active", nil},
		{"empty role name", "", 99, 1, "active", nil},

		{"professional below the limit", "PROFESSIONAL", 1, 3, "active", nil},
		{"intern below the limit", "INTERN", 1, 3, "active", nil},
		{"professional one short of the limit", "PROFESSIONAL", 2, 3, "active", nil},
		{"professional exactly at the limit", "PROFESSIONAL", 3, 3, "active", auth.ErrSeatLimit},
		{"professional over the limit", "PROFESSIONAL", 4, 3, "active", auth.ErrSeatLimit},
		{"intern exactly at the limit", "INTERN", 3, 3, "active", auth.ErrSeatLimit},

		// Trials are never limited: the plan is priced later on the real
		// clinical headcount, so inviting first cannot be used to underpay.
		{"trial at the limit is allowed", "PROFESSIONAL", 3, 3, "trialing", nil},
		{"trial well over the limit is allowed", "PROFESSIONAL", 50, 1, "trialing", nil},

		// A lapsed subscription is not a trial.
		{"past due at the limit", "PROFESSIONAL", 3, 3, "past_due", auth.ErrSeatLimit},
		{"canceled at the limit", "PROFESSIONAL", 3, 3, "canceled", auth.ErrSeatLimit},

		// A zero limit blocks the first clinical seat outright.
		{"zero limit blocks the first professional", "PROFESSIONAL", 0, 0, "active", auth.ErrSeatLimit},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var called bool
			repo := &fakeRepo{
				seatUsage: func(context.Context, string, string) (int, int, string, error) {
					called = true
					return tc.used, tc.limit, tc.status, nil
				},
			}
			svc, _ := newTestService(t, repo)

			err := svc.ensureSeatAvailable(ctx, "org-1", tc.role, "")
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}

			// Non-clinical roles must short-circuit before the query: the check
			// is on the hot path of every invite and role change.
			clinical := tc.role == "PROFESSIONAL" || tc.role == "INTERN"
			if called != clinical {
				t.Errorf("SeatUsage called = %v for role %q, want %v", called, tc.role, clinical)
			}
		})
	}
}

// TestEnsureSeatAvailableFailsClosed: a repository error must block, not wave
// the request through. The whole system is fail-closed by default.
func TestEnsureSeatAvailableFailsClosed(t *testing.T) {
	repo := &fakeRepo{
		seatUsage: func(context.Context, string, string) (int, int, string, error) {
			return 0, 0, "", errors.New("connection reset")
		},
	}
	svc, _ := newTestService(t, repo)

	err := svc.ensureSeatAvailable(context.Background(), "org-1", "PROFESSIONAL", "")
	if err == nil {
		t.Fatal("a failed seat lookup allowed the seat")
	}
	if !strings.Contains(err.Error(), "checking seat availability") {
		t.Errorf("err = %v, want it wrapped as a seat-availability failure", err)
	}
}

// TestEnsureSeatAvailablePassesTheExclusion: a role change must not count the
// user against their own existing seat, or promoting someone already clinical
// would fail at the limit.
func TestEnsureSeatAvailablePassesTheExclusion(t *testing.T) {
	var gotOrg, gotExclude string
	repo := &fakeRepo{
		seatUsage: func(_ context.Context, orgID, excludeUserID string) (int, int, string, error) {
			gotOrg, gotExclude = orgID, excludeUserID
			return 0, 10, "active", nil
		},
	}
	svc, _ := newTestService(t, repo)

	if err := svc.ensureSeatAvailable(context.Background(), "org-7", "PROFESSIONAL", "user-9"); err != nil {
		t.Fatalf("err = %v", err)
	}
	if gotOrg != "org-7" || gotExclude != "user-9" {
		t.Errorf("SeatUsage(org=%q, exclude=%q), want (org-7, user-9)", gotOrg, gotExclude)
	}
}

func TestInvite(t *testing.T) {
	ctx := context.Background()

	t.Run("stores only the hash of the code", func(t *testing.T) {
		repo := &fakeRepo{
			seatUsage: func(context.Context, string, string) (int, int, string, error) {
				return 0, 10, "active", nil
			},
		}
		svc, mr := newTestService(t, repo)

		code, expiresAt, err := svc.Invite(ctx, "org-1", "admin-1", "PROFESSIONAL")
		if err != nil {
			t.Fatalf("invite: %v", err)
		}
		if len(code) != inviteCodeLen {
			t.Errorf("code %q has length %d, want %d", code, len(code), inviteCodeLen)
		}
		// Visually confusable characters are excluded so the code survives being
		// read aloud or copied from a screenshot.
		for _, r := range code {
			if !strings.ContainsRune(inviteChars, r) {
				t.Errorf("code %q contains %q, which is outside the safe alphabet", code, r)
			}
		}

		if !mr.Exists(invitePrefix + hash.Token(code)) {
			t.Error("the invite was not stored under the hash of the code")
		}
		if mr.Exists(invitePrefix + code) {
			t.Error("the raw invite code was stored in redis")
		}

		if d := time.Until(expiresAt); d > inviteTTL || d < inviteTTL-time.Minute {
			t.Errorf("expiresAt is %v away, want about %v", d, inviteTTL)
		}
	})

	t.Run("defaults to PROFESSIONAL and checks the seat for it", func(t *testing.T) {
		var checkedRole string
		repo := &fakeRepo{
			seatUsage: func(context.Context, string, string) (int, int, string, error) {
				checkedRole = "queried" // SeatUsage is only reached for clinical roles
				return 0, 10, "active", nil
			},
		}
		svc, _ := newTestService(t, repo)

		if _, _, err := svc.Invite(ctx, "org-1", "admin-1", ""); err != nil {
			t.Fatalf("invite: %v", err)
		}
		if checkedRole != "queried" {
			t.Error("an invite with no role skipped the seat check — the default must be clinical")
		}
	})

	t.Run("a full plan blocks the invite before a code exists", func(t *testing.T) {
		repo := &fakeRepo{
			seatUsage: func(context.Context, string, string) (int, int, string, error) {
				return 3, 3, "active", nil
			},
		}
		svc, mr := newTestService(t, repo)

		code, _, err := svc.Invite(ctx, "org-1", "admin-1", "PROFESSIONAL")
		if !errors.Is(err, auth.ErrSeatLimit) {
			t.Fatalf("err = %v, want ErrSeatLimit", err)
		}
		if code != "" {
			t.Errorf("a rejected invite still returned the code %q", code)
		}
		if len(mr.Keys()) != 0 {
			t.Errorf("a rejected invite left %v in redis", mr.Keys())
		}
	})

	t.Run("codes do not repeat", func(t *testing.T) {
		repo := &fakeRepo{
			seatUsage: func(context.Context, string, string) (int, int, string, error) {
				return 0, 100, "active", nil
			},
		}
		svc, _ := newTestService(t, repo)

		seen := make(map[string]bool)
		for i := 0; i < 200; i++ {
			code, _, err := svc.Invite(ctx, "org-1", "admin-1", "PROFESSIONAL")
			if err != nil {
				t.Fatalf("invite %d: %v", i, err)
			}
			if seen[code] {
				t.Fatalf("invite code %q was issued twice in 200 draws", code)
			}
			seen[code] = true
		}
	})
}

func TestUpdateProfile(t *testing.T) {
	ctx := context.Background()

	t.Run("trims the name and reissues tokens carrying it", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		var stored string
		repo := &fakeRepo{
			updateDisplay: func(_ context.Context, _, displayName string) error {
				stored = displayName
				newName := displayName
				user.DisplayName = &newName
				return nil
			},
			findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
		}
		svc, _ := newTestService(t, repo)

		pair, err := svc.UpdateProfile(ctx, user.ID, "  Dra. Marcela Chapués  ")
		if err != nil {
			t.Fatalf("update profile: %v", err)
		}
		if stored != "Dra. Marcela Chapués" {
			t.Errorf("persisted %q, want the surrounding whitespace trimmed", stored)
		}

		// The point of reissuing is that the SPA sees the new name without a
		// re-login. If it does not reach the claims, the feature does nothing.
		claims := parseAccess(t, pair.AccessToken)
		if claims.DisplayName == nil || *claims.DisplayName != "Dra. Marcela Chapués" {
			t.Errorf("claims DisplayName = %v, want the updated name", claims.DisplayName)
		}
	})

	t.Run("a failed write does not issue tokens", func(t *testing.T) {
		repo := &fakeRepo{
			updateDisplay: func(context.Context, string, string) error {
				return errors.New("constraint violation")
			},
		}
		svc, _ := newTestService(t, repo)

		pair, err := svc.UpdateProfile(ctx, "user-1", "New Name")
		if err == nil {
			t.Fatal("a failed write returned success")
		}
		if pair != nil {
			t.Error("a failed write still issued a token pair")
		}
	})
}
