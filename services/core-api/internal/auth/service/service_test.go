package service

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/hash"
	"sghcp/core-api/internal/shared/token"
)

// These are unit tests: a fake repository and an in-process Redis, no docker.
// internal/integration/auth_test.go covers the same service against the real
// pgx repository; what is asserted here are the branches and the exact
// behaviours that are awkward to reach through SQL — the lockout boundary, what
// lands in the audit log, and the fact that a failed login reveals nothing
// about whether the account exists.

var initPepperOnce sync.Once

func initPepper(t *testing.T) {
	t.Helper()
	initPepperOnce.Do(func() {
		if err := hash.Init(strings.Repeat("ab", 32)); err != nil {
			t.Fatalf("hash.Init: %v", err)
		}
	})
}

// fakeRepo embeds the interface rather than implementing all ~35 methods. A
// method a test did not wire up is nil and panics loudly if the code under test
// calls it — which is the point: an unexpected repository call is a finding,
// not something to silently return a zero value for.
type fakeRepo struct {
	auth.Repository

	mu    sync.Mutex
	audit []auth.AuditEntry

	// mr is the miniredis backing this service, so a test can seed the keys the
	// service would have written (reset/verification tokens are one-way hashed,
	// and the raw value only ever exists inside an email).
	mr *miniredis.Miniredis

	verifiedIDs []string

	// Call counters, so a test can assert side effects happened (or did not).
	incrementedFor []string
	lockedFor      []string
	clearedFor     []string

	findForLogin   func(ctx context.Context, email string) (*auth.User, error)
	findUserByID   func(ctx context.Context, userID string) (*auth.User, error)
	findByEmail    func(ctx context.Context, email string) (*auth.User, error)
	updatePwByID   func(ctx context.Context, userID, passwordHash string) error
	updatePassword func(ctx context.Context, orgID, targetEmail, passwordHash string) error
	updateDisplay  func(ctx context.Context, userID, displayName string) error
	seatUsage      func(ctx context.Context, orgID, excludeUserID string) (int, int, string, error)
	createOrg      func(ctx context.Context, p auth.CreateOrgParams) (string, string, string, error)
	markVerified   func(ctx context.Context, userID string) error
	updateEmail    func(ctx context.Context, userID, newEmail string) error
	findRoleID     func(ctx context.Context, roleName string) (string, error)
	countAdmins    func(ctx context.Context, orgID, excludeUserID string) (int, error)
	deactivate     func(ctx context.Context, orgID, targetUserID string) (int64, error)
	reactivate     func(ctx context.Context, orgID, targetUserID, roleID, callerUserID string) error
	replaceRole    func(ctx context.Context, orgID, targetUserID, newRoleID, callerUserID string) error
	orgInfo        func(ctx context.Context, orgID string) (string, string, *time.Time, *time.Time, error)
	orgSlug        func(ctx context.Context, orgID string) (string, error)
	isInternal     func(ctx context.Context, orgID string) (bool, error)
	listUsers      func(ctx context.Context, orgID string) ([]auth.OrgUser, error)
	listPros       func(ctx context.Context, orgID string) ([]auth.OrgProfessional, error)
	acceptDPA      func(ctx context.Context, userID string) error
	dpaAccepted    func(ctx context.Context, userID string) (bool, error)
	setOnboarding  func(ctx context.Context, userID string, skipped bool) error
	onboardingDone func(ctx context.Context, userID string) (bool, error)
	findInOrg      func(ctx context.Context, orgID, email string) (*auth.User, error)
	createUser     func(ctx context.Context, orgID, email, passwordHash, displayName string) (string, error)
	assignRole     func(ctx context.Context, orgID, userID, roleID, assignedByUserID string) error
}

func (f *fakeRepo) FindUserByEmailInOrg(ctx context.Context, orgID, email string) (*auth.User, error) {
	return f.findInOrg(ctx, orgID, email)
}

func (f *fakeRepo) CreateUser(ctx context.Context, orgID, email, passwordHash, displayName string) (string, error) {
	return f.createUser(ctx, orgID, email, passwordHash, displayName)
}

func (f *fakeRepo) AssignRole(ctx context.Context, orgID, userID, roleID, assignedByUserID string) error {
	return f.assignRole(ctx, orgID, userID, roleID, assignedByUserID)
}

func (f *fakeRepo) OrgSlug(ctx context.Context, orgID string) (string, error) {
	return f.orgSlug(ctx, orgID)
}

func (f *fakeRepo) IsInternalOrg(ctx context.Context, orgID string) (bool, error) {
	return f.isInternal(ctx, orgID)
}

func (f *fakeRepo) ListOrgUsers(ctx context.Context, orgID string) ([]auth.OrgUser, error) {
	return f.listUsers(ctx, orgID)
}

func (f *fakeRepo) ListOrgProfessionals(ctx context.Context, orgID string) ([]auth.OrgProfessional, error) {
	return f.listPros(ctx, orgID)
}

func (f *fakeRepo) AcceptDPA(ctx context.Context, userID string) error {
	return f.acceptDPA(ctx, userID)
}

func (f *fakeRepo) DPAAccepted(ctx context.Context, userID string) (bool, error) {
	return f.dpaAccepted(ctx, userID)
}

func (f *fakeRepo) SetOnboardingCompleted(ctx context.Context, userID string, skipped bool) error {
	return f.setOnboarding(ctx, userID, skipped)
}

func (f *fakeRepo) OnboardingCompleted(ctx context.Context, userID string) (bool, error) {
	return f.onboardingDone(ctx, userID)
}

func (f *fakeRepo) CreateOrgWithOwner(ctx context.Context, p auth.CreateOrgParams) (string, string, string, error) {
	return f.createOrg(ctx, p)
}

func (f *fakeRepo) MarkEmailVerified(ctx context.Context, userID string) error {
	return f.markVerified(ctx, userID)
}

func (f *fakeRepo) UpdateEmail(ctx context.Context, userID, newEmail string) error {
	return f.updateEmail(ctx, userID, newEmail)
}

func (f *fakeRepo) FindRoleIDByName(ctx context.Context, roleName string) (string, error) {
	return f.findRoleID(ctx, roleName)
}

func (f *fakeRepo) CountAdminsExcluding(ctx context.Context, orgID, excludeUserID string) (int, error) {
	return f.countAdmins(ctx, orgID, excludeUserID)
}

func (f *fakeRepo) DeactivateUser(ctx context.Context, orgID, targetUserID string) (int64, error) {
	return f.deactivate(ctx, orgID, targetUserID)
}

func (f *fakeRepo) ReactivateUser(ctx context.Context, orgID, targetUserID, roleID, callerUserID string) error {
	return f.reactivate(ctx, orgID, targetUserID, roleID, callerUserID)
}

func (f *fakeRepo) ReplaceUserRole(ctx context.Context, orgID, targetUserID, newRoleID, callerUserID string) error {
	return f.replaceRole(ctx, orgID, targetUserID, newRoleID, callerUserID)
}

func (f *fakeRepo) OrgInfo(ctx context.Context, orgID string) (string, string, *time.Time, *time.Time, error) {
	return f.orgInfo(ctx, orgID)
}

func (f *fakeRepo) UpdatePassword(ctx context.Context, orgID, targetEmail, passwordHash string) error {
	return f.updatePassword(ctx, orgID, targetEmail, passwordHash)
}

func (f *fakeRepo) FindForLogin(ctx context.Context, email string) (*auth.User, error) {
	return f.findForLogin(ctx, email)
}

func (f *fakeRepo) FindUserByID(ctx context.Context, userID string) (*auth.User, error) {
	return f.findUserByID(ctx, userID)
}

func (f *fakeRepo) FindUserByEmailGlobal(ctx context.Context, email string) (*auth.User, error) {
	return f.findByEmail(ctx, email)
}

func (f *fakeRepo) UpdatePasswordByID(ctx context.Context, userID, passwordHash string) error {
	return f.updatePwByID(ctx, userID, passwordHash)
}

func (f *fakeRepo) UpdateDisplayName(ctx context.Context, userID, displayName string) error {
	return f.updateDisplay(ctx, userID, displayName)
}

func (f *fakeRepo) SeatUsage(ctx context.Context, orgID, excludeUserID string) (int, int, string, error) {
	return f.seatUsage(ctx, orgID, excludeUserID)
}

func (f *fakeRepo) IncrementFailedAttempts(_ context.Context, userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.incrementedFor = append(f.incrementedFor, userID)
	return nil
}

func (f *fakeRepo) LockUser(_ context.Context, userID string, _ time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lockedFor = append(f.lockedFor, userID)
	return nil
}

func (f *fakeRepo) ClearFailedAttempts(_ context.Context, userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.clearedFor = append(f.clearedFor, userID)
	return nil
}

func (f *fakeRepo) WriteAuditLog(_ context.Context, entry auth.AuditEntry) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.audit = append(f.audit, entry)
}

func (f *fakeRepo) lastAudit(t *testing.T) auth.AuditEntry {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.audit) == 0 {
		t.Fatal("nothing was written to the audit log")
	}
	return f.audit[len(f.audit)-1]
}

func newTestService(t *testing.T, repo *fakeRepo) (*Service, *miniredis.Miniredis) {
	t.Helper()
	initPepper(t)

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	cfg := config.Config{
		JWTSecret:         "unit-test-secret",
		JWTAccessTTLMin:   15,
		JWTRefreshTTLDays: 7,
		AppBaseURL:        "https://app.test",
	}
	return New(repo, rdb, cfg), mr
}

// parseAccess verifies and decodes an issued access token with the test secret.
func parseAccess(t *testing.T, accessToken string) token.Claims {
	t.Helper()
	var claims token.Claims
	parsed, err := jwt.ParseWithClaims(accessToken, &claims, func(*jwt.Token) (any, error) {
		return []byte("unit-test-secret"), nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("issued access token does not verify: %v", err)
	}
	return claims
}

// bcryptOf uses MinCost: these tests hash constantly and DefaultCost would make
// the package take minutes.
func bcryptOf(t *testing.T, password string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	return string(h)
}

func verifiedUser(t *testing.T, password string) *auth.User {
	t.Helper()
	verified := time.Now().Add(-24 * time.Hour)
	name := "Dra. Ejemplo"
	return &auth.User{
		ID:              "user-1",
		OrganizationID:  "org-1",
		Email:           "pro@clinic.test",
		DisplayName:     &name,
		PasswordHash:    bcryptOf(t, password),
		IsActive:        true,
		EmailVerifiedAt: &verified,
		Roles:           []string{"PROFESSIONAL"},
		Permissions:     []string{"patients:read"},
	}
}
