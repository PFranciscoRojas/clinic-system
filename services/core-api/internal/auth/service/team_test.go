package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
)

// Team management is where a tenant can lock itself out of its own account, or
// where a non-admin could try to promote themselves. Every guard is asserted
// together with the fact that the write never happened.

func TestDeactivateUser(t *testing.T) {
	ctx := context.Background()

	t.Run("removes a colleague", func(t *testing.T) {
		var deactivated string
		repo := &fakeRepo{}
		repo.countAdmins = func(context.Context, string, string) (int, error) { return 1, nil }
		repo.deactivate = func(_ context.Context, _, targetUserID string) (int64, error) {
			deactivated = targetUserID
			return 1, nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.DeactivateUser(ctx, "org-1", "admin-1", "target-1"); err != nil {
			t.Fatalf("deactivate: %v", err)
		}
		if deactivated != "target-1" {
			t.Errorf("deactivated %q, want target-1", deactivated)
		}
	})

	t.Run("cannot deactivate yourself", func(t *testing.T) {
		var called bool
		repo := &fakeRepo{}
		repo.countAdmins = func(context.Context, string, string) (int, error) {
			called = true
			return 5, nil
		}
		repo.deactivate = func(context.Context, string, string) (int64, error) {
			called = true
			return 1, nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.DeactivateUser(ctx, "org-1", "same-user", "same-user"); !errors.Is(err, auth.ErrSelfDeactivate) {
			t.Fatalf("err = %v, want ErrSelfDeactivate", err)
		}
		if called {
			t.Error("the self-deactivation guard ran after touching the database")
		}
	})

	// The one that would brick a tenant: no admin left to invite anyone back.
	t.Run("cannot remove the last admin", func(t *testing.T) {
		var wrote bool
		repo := &fakeRepo{}
		repo.countAdmins = func(context.Context, string, string) (int, error) { return 0, nil }
		repo.deactivate = func(context.Context, string, string) (int64, error) {
			wrote = true
			return 1, nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.DeactivateUser(ctx, "org-1", "admin-1", "admin-2"); !errors.Is(err, auth.ErrLastAdmin) {
			t.Fatalf("err = %v, want ErrLastAdmin", err)
		}
		if wrote {
			t.Error("the last admin was deactivated anyway")
		}
	})

	t.Run("a user from another org affects no rows", func(t *testing.T) {
		repo := &fakeRepo{}
		repo.countAdmins = func(context.Context, string, string) (int, error) { return 2, nil }
		repo.deactivate = func(context.Context, string, string) (int64, error) { return 0, nil }
		svc, _ := newTestService(t, repo)

		if err := svc.DeactivateUser(ctx, "org-1", "admin-1", "someone-elses-user"); !errors.Is(err, auth.ErrUserNotFound) {
			t.Errorf("err = %v, want ErrUserNotFound", err)
		}
	})

	t.Run("a failed admin count fails closed", func(t *testing.T) {
		repo := &fakeRepo{}
		repo.countAdmins = func(context.Context, string, string) (int, error) {
			return 0, errors.New("connection reset")
		}
		svc, _ := newTestService(t, repo)

		err := svc.DeactivateUser(ctx, "org-1", "admin-1", "target-1")
		if err == nil {
			t.Fatal("a failed admin count allowed the deactivation")
		}
	})
}

func TestChangeUserRole(t *testing.T) {
	ctx := context.Background()

	newRepo := func() *fakeRepo {
		repo := &fakeRepo{}
		repo.seatUsage = func(context.Context, string, string) (int, int, string, error) {
			return 0, 10, "active", nil
		}
		repo.findRoleID = func(_ context.Context, roleName string) (string, error) {
			return "role-id-of-" + roleName, nil
		}
		return repo
	}

	t.Run("assigns the resolved role id", func(t *testing.T) {
		repo := newRepo()
		var gotRoleID, gotTarget, gotCaller string
		repo.replaceRole = func(_ context.Context, _, targetUserID, newRoleID, callerUserID string) error {
			gotRoleID, gotTarget, gotCaller = newRoleID, targetUserID, callerUserID
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ChangeUserRole(ctx, "org-1", "admin-1", "target-1", "PROFESSIONAL"); err != nil {
			t.Fatalf("change role: %v", err)
		}
		if gotRoleID != "role-id-of-PROFESSIONAL" || gotTarget != "target-1" || gotCaller != "admin-1" {
			t.Errorf("ReplaceUserRole(role=%q target=%q caller=%q)", gotRoleID, gotTarget, gotCaller)
		}
	})

	t.Run("cannot change your own role", func(t *testing.T) {
		repo := newRepo()
		var wrote bool
		repo.replaceRole = func(context.Context, string, string, string, string) error {
			wrote = true
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ChangeUserRole(ctx, "org-1", "same", "same", "CLINIC_ADMIN"); !errors.Is(err, auth.ErrSelfRoleChange) {
			t.Fatalf("err = %v, want ErrSelfRoleChange", err)
		}
		if wrote {
			t.Error("a self role change was written anyway")
		}
	})

	// SYSTEM_ADMIN is the SaaS operator. A tenant admin must never be able to
	// mint one through the team screen.
	t.Run("SYSTEM_ADMIN cannot be granted here", func(t *testing.T) {
		repo := newRepo()
		var wrote bool
		repo.replaceRole = func(context.Context, string, string, string, string) error {
			wrote = true
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ChangeUserRole(ctx, "org-1", "admin-1", "target-1", "SYSTEM_ADMIN"); !errors.Is(err, auth.ErrRoleNotFound) {
			t.Fatalf("err = %v, want ErrRoleNotFound", err)
		}
		if wrote {
			t.Error("a tenant admin granted SYSTEM_ADMIN")
		}
	})

	t.Run("a full plan blocks a promotion into a clinical role", func(t *testing.T) {
		repo := newRepo()
		repo.seatUsage = func(context.Context, string, string) (int, int, string, error) {
			return 3, 3, "active", nil
		}
		var wrote bool
		repo.replaceRole = func(context.Context, string, string, string, string) error {
			wrote = true
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ChangeUserRole(ctx, "org-1", "admin-1", "target-1", "PROFESSIONAL"); !errors.Is(err, auth.ErrSeatLimit) {
			t.Fatalf("err = %v, want ErrSeatLimit", err)
		}
		if wrote {
			t.Error("the promotion happened despite a full plan")
		}
	})

	// The exclusion is what lets someone already holding a clinical seat switch
	// between PROFESSIONAL and INTERN at the limit.
	t.Run("the target is excluded from the seat count", func(t *testing.T) {
		repo := newRepo()
		var gotExclude string
		repo.seatUsage = func(_ context.Context, _, excludeUserID string) (int, int, string, error) {
			gotExclude = excludeUserID
			return 0, 10, "active", nil
		}
		repo.replaceRole = func(context.Context, string, string, string, string) error { return nil }
		svc, _ := newTestService(t, repo)

		if err := svc.ChangeUserRole(ctx, "org-1", "admin-1", "target-1", "INTERN"); err != nil {
			t.Fatalf("change role: %v", err)
		}
		if gotExclude != "target-1" {
			t.Errorf("SeatUsage exclude = %q, want target-1 — a user would be counted against their own seat", gotExclude)
		}
	})
}

func TestReactivateUser(t *testing.T) {
	ctx := context.Background()

	t.Run("restores the user with the requested role", func(t *testing.T) {
		repo := &fakeRepo{}
		repo.seatUsage = func(context.Context, string, string) (int, int, string, error) {
			return 0, 10, "active", nil
		}
		repo.findRoleID = func(_ context.Context, roleName string) (string, error) {
			return "role-id-of-" + roleName, nil
		}
		var gotRoleID string
		repo.reactivate = func(_ context.Context, _, _, roleID, _ string) error {
			gotRoleID = roleID
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ReactivateUser(ctx, "org-1", "admin-1", "target-1", "PROFESSIONAL"); err != nil {
			t.Fatalf("reactivate: %v", err)
		}
		if gotRoleID != "role-id-of-PROFESSIONAL" {
			t.Errorf("roleID = %q", gotRoleID)
		}
	})

	t.Run("SYSTEM_ADMIN cannot be granted here either", func(t *testing.T) {
		repo := &fakeRepo{}
		var wrote bool
		repo.reactivate = func(context.Context, string, string, string, string) error {
			wrote = true
			return nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ReactivateUser(ctx, "org-1", "admin-1", "target-1", "SYSTEM_ADMIN"); !errors.Is(err, auth.ErrRoleNotFound) {
			t.Fatalf("err = %v, want ErrRoleNotFound", err)
		}
		if wrote {
			t.Error("a tenant admin reactivated someone as SYSTEM_ADMIN")
		}
	})

	// An inactive user holds no seat, so restoring them into a clinical role
	// consumes one — the count must NOT exclude them.
	t.Run("a full plan blocks the restore and counts the target", func(t *testing.T) {
		repo := &fakeRepo{}
		var gotExclude string
		repo.seatUsage = func(_ context.Context, _, excludeUserID string) (int, int, string, error) {
			gotExclude = excludeUserID
			return 3, 3, "active", nil
		}
		svc, _ := newTestService(t, repo)

		if err := svc.ReactivateUser(ctx, "org-1", "admin-1", "target-1", "PROFESSIONAL"); !errors.Is(err, auth.ErrSeatLimit) {
			t.Fatalf("err = %v, want ErrSeatLimit", err)
		}
		if gotExclude != "" {
			t.Errorf("SeatUsage exclude = %q, want empty — an inactive user holds no seat to exclude", gotExclude)
		}
	})
}

func TestRequestEmailChange(t *testing.T) {
	ctx := context.Background()

	t.Run("stores the token hashed with the pending address", func(t *testing.T) {
		repo := &fakeRepo{
			findByEmail: func(context.Context, string) (*auth.User, error) {
				return nil, errors.New("no rows") // the address is free
			},
		}
		svc, mr := newTestService(t, repo)

		if err := svc.RequestEmailChange(ctx, "user-1", "nuevo@clinic.test"); err != nil {
			t.Fatalf("request: %v", err)
		}

		var found string
		for _, k := range mr.Keys() {
			if len(k) > len(emailChangePrefix) && k[:len(emailChangePrefix)] == emailChangePrefix {
				found = k
			}
		}
		if found == "" {
			t.Fatal("no email-change token was stored")
		}
		val, err := mr.Get(found)
		if err != nil {
			t.Fatal(err)
		}
		if val != "user-1:nuevo@clinic.test" {
			t.Errorf("stored payload = %q, want \"user-1:nuevo@clinic.test\"", val)
		}
	})

	t.Run("rejects a malformed address before doing anything", func(t *testing.T) {
		var looked bool
		repo := &fakeRepo{
			findByEmail: func(context.Context, string) (*auth.User, error) {
				looked = true
				return nil, errors.New("no rows")
			},
		}
		svc, mr := newTestService(t, repo)

		if err := svc.RequestEmailChange(ctx, "user-1", "not-an-email"); !errors.Is(err, auth.ErrEmailAlreadyExists) {
			t.Fatalf("err = %v, want ErrEmailAlreadyExists (the wrapper used for invalid format)", err)
		}
		if looked {
			t.Error("a malformed address still hit the database")
		}
		if len(mr.Keys()) != 0 {
			t.Error("a malformed address still stored a token")
		}
	})

	t.Run("rejects an address already in use", func(t *testing.T) {
		repo := &fakeRepo{
			findByEmail: func(context.Context, string) (*auth.User, error) {
				return verifiedUser(t, testPassword), nil
			},
		}
		svc, mr := newTestService(t, repo)

		if err := svc.RequestEmailChange(ctx, "user-1", "taken@clinic.test"); !errors.Is(err, auth.ErrEmailAlreadyExists) {
			t.Fatalf("err = %v, want ErrEmailAlreadyExists", err)
		}
		if len(mr.Keys()) != 0 {
			t.Error("a taken address still stored a token — and would have emailed its owner")
		}
	})
}

func TestConfirmEmailChange(t *testing.T) {
	ctx := context.Background()

	t.Run("applies the change and ends every session", func(t *testing.T) {
		user := verifiedUser(t, testPassword)
		var gotUser, gotEmail string
		repo := &fakeRepo{
			findForLogin: func(context.Context, string) (*auth.User, error) { return user, nil },
			findUserByID: func(context.Context, string) (*auth.User, error) { return user, nil },
		}
		repo.updateEmail = func(_ context.Context, userID, newEmail string) error {
			gotUser, gotEmail = userID, newEmail
			return nil
		}
		svc, mr := newTestService(t, repo)

		pair, err := svc.Login(ctx, user.Email, testPassword, "127.0.0.1", "go-test")
		if err != nil {
			t.Fatalf("login: %v", err)
		}

		const raw = "the-email-change-token"
		if err := mr.Set(emailChangePrefix+hash.Token(raw), user.ID+":nuevo@clinic.test"); err != nil {
			t.Fatal(err)
		}

		if err := svc.ConfirmEmailChange(ctx, raw); err != nil {
			t.Fatalf("confirm: %v", err)
		}
		if gotUser != user.ID || gotEmail != "nuevo@clinic.test" {
			t.Errorf("UpdateEmail(user=%q, email=%q)", gotUser, gotEmail)
		}
		// The address is an identity: sessions issued under the old one must go.
		if _, err := svc.Refresh(ctx, pair.RefreshToken); !errors.Is(err, auth.ErrInvalidCredentials) {
			t.Errorf("a session from before the change still refreshes: %v", err)
		}
		// Single use.
		if err := svc.ConfirmEmailChange(ctx, raw); !errors.Is(err, auth.ErrEmailChangePending) {
			t.Errorf("replayed link: got %v, want ErrEmailChangePending", err)
		}
	})

	t.Run("rejects malformed payloads", func(t *testing.T) {
		cases := []struct {
			name  string
			token string
			value string // empty = do not seed anything
		}{
			{"unknown token", "never-issued", ""},
			{"empty token", "", ""},
			{"payload with no separator", "seeded", "just-a-user-id"},
			{"payload with an empty user id", "seeded", ":nuevo@clinic.test"},
			{"payload with an empty address", "seeded", "user-1:"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				var wrote bool
				repo := &fakeRepo{}
				repo.updateEmail = func(context.Context, string, string) error {
					wrote = true
					return nil
				}
				svc, mr := newTestService(t, repo)
				if tc.value != "" {
					if err := mr.Set(emailChangePrefix+hash.Token(tc.token), tc.value); err != nil {
						t.Fatal(err)
					}
				}

				if err := svc.ConfirmEmailChange(ctx, tc.token); !errors.Is(err, auth.ErrEmailChangePending) {
					t.Errorf("err = %v, want ErrEmailChangePending", err)
				}
				if wrote {
					t.Error("a malformed payload still changed an address")
				}
			})
		}
	})
}

// The remaining service methods are one-line delegations to the repository.
// They are covered so a future guard added to one of them cannot slip in
// untested, and so the package's coverage number reflects real behaviour rather
// than a pile of unexercised passthroughs.
func TestRepositoryDelegations(t *testing.T) {
	ctx := context.Background()

	t.Run("DPA", func(t *testing.T) {
		repo := &fakeRepo{}
		repo.acceptDPA = func(_ context.Context, userID string) error {
			if userID != "user-1" {
				t.Errorf("AcceptDPA(%q)", userID)
			}
			return nil
		}
		repo.dpaAccepted = func(context.Context, string) (bool, error) { return true, nil }
		svc, _ := newTestService(t, repo)

		if err := svc.AcceptDPA(ctx, "user-1"); err != nil {
			t.Errorf("AcceptDPA: %v", err)
		}
		ok, err := svc.DPAAccepted(ctx, "user-1")
		if err != nil || !ok {
			t.Errorf("DPAAccepted = %v, %v", ok, err)
		}
	})

	t.Run("onboarding", func(t *testing.T) {
		// The skipped flag has to survive the trip: it is the difference
		// between a tenant that set the product up and one that clicked past
		// the wizard, and the funnel used to report both as the former.
		var gotSkipped []bool
		repo := &fakeRepo{}
		repo.setOnboarding = func(_ context.Context, _ string, skipped bool) error {
			gotSkipped = append(gotSkipped, skipped)
			return nil
		}
		repo.onboardingDone = func(context.Context, string) (bool, error) { return true, nil }
		svc, _ := newTestService(t, repo)

		if err := svc.CompleteOnboarding(ctx, "user-1", false); err != nil {
			t.Errorf("CompleteOnboarding: %v", err)
		}
		if err := svc.CompleteOnboarding(ctx, "user-2", true); err != nil {
			t.Errorf("CompleteOnboarding (skipped): %v", err)
		}
		if want := []bool{false, true}; len(gotSkipped) != 2 || gotSkipped[0] != want[0] || gotSkipped[1] != want[1] {
			t.Errorf("skipped flags reaching the repository = %v, want %v", gotSkipped, want)
		}
		ok, err := svc.OnboardingCompleted(ctx, "user-1")
		if err != nil || !ok {
			t.Errorf("OnboardingCompleted = %v, %v", ok, err)
		}
	})

	t.Run("org read models", func(t *testing.T) {
		repo := &fakeRepo{}
		repo.orgInfo = func(context.Context, string) (string, string, *time.Time, *time.Time, error) {
			return "Clinica Chapni", "trialing", nil, nil, nil
		}
		repo.orgSlug = func(context.Context, string) (string, error) { return "clinica-chapni", nil }
		repo.isInternal = func(context.Context, string) (bool, error) { return false, nil }
		repo.listUsers = func(context.Context, string) ([]auth.OrgUser, error) {
			return []auth.OrgUser{{ID: "u1"}}, nil
		}
		repo.listPros = func(context.Context, string) ([]auth.OrgProfessional, error) {
			return []auth.OrgProfessional{{ID: "u1"}}, nil
		}
		svc, _ := newTestService(t, repo)

		name, status, _, _, err := svc.OrgInfo(ctx, "org-1")
		if err != nil || name != "Clinica Chapni" || status != "trialing" {
			t.Errorf("OrgInfo = %q, %q, %v", name, status, err)
		}
		if slug, err := svc.OrgSlug(ctx, "org-1"); err != nil || slug != "clinica-chapni" {
			t.Errorf("OrgSlug = %q, %v", slug, err)
		}
		if internal, err := svc.IsInternalOrg(ctx, "org-1"); err != nil || internal {
			t.Errorf("IsInternalOrg = %v, %v", internal, err)
		}
		if users, err := svc.ListOrgUsers(ctx, "org-1"); err != nil || len(users) != 1 {
			t.Errorf("ListOrgUsers = %v, %v", users, err)
		}
		if pros, err := svc.ListOrgProfessionals(ctx, "org-1"); err != nil || len(pros) != 1 {
			t.Errorf("ListOrgProfessionals = %v, %v", pros, err)
		}
	})
}
