package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sghcp/core-api/internal/shared/token"
)

// These tests exist because RequireAuth/RequirePermission/RequireRole are the
// only thing between an anonymous request and clinical data. Every denial is
// asserted explicitly and by status code, not just "did not reach the handler":
// a middleware that silently passed through with a 200 and an empty body would
// look identical to one that denied, from the handler's point of view.

var testSecret = []byte("test-secret-not-used-anywhere-real")

// nextRecorder is the downstream handler. It records whether it ran, which is
// the only thing that actually matters for an authorization decision.
type nextRecorder struct {
	called bool
	claims *token.Claims
}

func (n *nextRecorder) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.called = true
		n.claims = ClaimsFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})
}

// withClaims injects claims the way RequireAuth does, so the middleware under
// test sees exactly what it would see in the real chain.
func withClaims(ctx context.Context, c *token.Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

func signedToken(t *testing.T, secret []byte, claims *token.Claims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func validClaims() *token.Claims {
	return &token.Claims{
		UserID:         "11111111-1111-1111-1111-111111111111",
		OrganizationID: "22222222-2222-2222-2222-222222222222",
		Email:          "pro@clinic.test",
		Roles:          []string{"PROFESSIONAL"},
		Permissions:    []string{"patients:read", "patients:write"},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
}

func TestRequireAuthAcceptsAValidToken(t *testing.T) {
	next := &nextRecorder{}
	claims := validClaims()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, testSecret, claims))
	rec := httptest.NewRecorder()

	RequireAuth(testSecret)(next.handler()).ServeHTTP(rec, req)

	if !next.called {
		t.Fatalf("a valid token was rejected: %d %s", rec.Code, rec.Body.String())
	}
	if next.claims == nil {
		t.Fatal("claims were not injected into the request context")
	}
	// The whole point of embedding permissions in the token is that downstream
	// middleware reads them without a DB call; if they do not survive the hop,
	// RequirePermission silently degrades.
	if next.claims.OrganizationID != claims.OrganizationID {
		t.Errorf("org id = %q, want %q", next.claims.OrganizationID, claims.OrganizationID)
	}
	if len(next.claims.Permissions) != 2 {
		t.Errorf("permissions = %v, want the 2 signed into the token", next.claims.Permissions)
	}
}

func TestRequireAuthRejects(t *testing.T) {
	otherSecret := []byte("a-different-secret-entirely-here-x")

	expired := validClaims()
	expired.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Second))

	notYetValid := validClaims()
	notYetValid.NotBefore = jwt.NewNumericDate(time.Now().Add(time.Hour))

	// An alg:none token: the classic JWT forgery. jwt.ParseWithClaims must
	// refuse it before our SigningMethodHMAC check even matters, but we assert
	// the outcome rather than trusting the library.
	noneToken, err := jwt.NewWithClaims(jwt.SigningMethodNone, validClaims()).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("build alg:none token: %v", err)
	}

	cases := []struct {
		name   string
		header string
	}{
		{"no Authorization header at all", ""},
		{"bare token without the Bearer scheme", signedToken(t, testSecret, validClaims())},
		{"lowercase bearer scheme", "bearer " + signedToken(t, testSecret, validClaims())},
		{"Bearer with nothing after it", "Bearer "},
		{"Basic auth instead", "Basic dXNlcjpwYXNz"},
		{"signed with the wrong secret", "Bearer " + signedToken(t, otherSecret, validClaims())},
		{"expired token", "Bearer " + signedToken(t, testSecret, expired)},
		{"token not valid yet", "Bearer " + signedToken(t, testSecret, notYetValid)},
		{"alg:none forgery", "Bearer " + noneToken},
		{"garbage that is not a JWT", "Bearer not.a.jwt"},
		{"truncated token", "Bearer " + signedToken(t, testSecret, validClaims())[:20]},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &nextRecorder{}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()

			RequireAuth(testSecret)(next.handler()).ServeHTTP(rec, req)

			if next.called {
				t.Fatal("the request reached the handler")
			}
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", rec.Code)
			}
		})
	}
}

// TestRequireAuthRejectsATamperedPayload is the one that matters most: the
// signature must be checked against the payload, not merely be present.
func TestRequireAuthRejectsATamperedPayload(t *testing.T) {
	raw := signedToken(t, testSecret, validClaims())
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		t.Fatalf("expected a 3-part JWT, got %d parts", len(parts))
	}

	// Re-sign a different org with the *right* secret, then graft the original
	// signature onto it. Payload and signature no longer agree.
	other := validClaims()
	other.OrganizationID = "33333333-3333-3333-3333-333333333333"
	otherParts := strings.Split(signedToken(t, testSecret, other), ".")
	forged := otherParts[0] + "." + otherParts[1] + "." + parts[2]

	next := &nextRecorder{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
	req.Header.Set("Authorization", "Bearer "+forged)
	rec := httptest.NewRecorder()

	RequireAuth(testSecret)(next.handler()).ServeHTTP(rec, req)

	if next.called {
		t.Fatal("a token whose payload was swapped under its signature was accepted")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestRequirePermission(t *testing.T) {
	cases := []struct {
		name     string
		claims   *token.Claims // nil means the route was not behind RequireAuth
		required string
		want     int
	}{
		{"holds the permission", &token.Claims{Permissions: []string{"patients:read"}}, "patients:read", http.StatusOK},
		{"holds it among several", &token.Claims{Permissions: []string{"a:b", "patients:read", "c:d"}}, "patients:read", http.StatusOK},
		{"lacks it", &token.Claims{Permissions: []string{"patients:read"}}, "patients:delete", http.StatusForbidden},
		{"holds none at all", &token.Claims{Permissions: nil}, "patients:read", http.StatusForbidden},
		{"empty permission list", &token.Claims{Permissions: []string{}}, "patients:read", http.StatusForbidden},
		// Permission codes are compared exactly. A prefix match would turn
		// "patients:read" into a grant for "patients:read_all".
		{"prefix is not a match", &token.Claims{Permissions: []string{"patients:read"}}, "patients:read_all", http.StatusForbidden},
		{"suffix is not a match", &token.Claims{Permissions: []string{"read"}}, "patients:read", http.StatusForbidden},
		{"case differs", &token.Claims{Permissions: []string{"PATIENTS:READ"}}, "patients:read", http.StatusForbidden},
		{"no claims in context", nil, "patients:read", http.StatusUnauthorized},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &nextRecorder{}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
			if tc.claims != nil {
				req = req.WithContext(withClaims(req.Context(), tc.claims))
			}
			rec := httptest.NewRecorder()

			RequirePermission(tc.required)(next.handler()).ServeHTTP(rec, req)

			if rec.Code != tc.want {
				t.Errorf("status = %d, want %d", rec.Code, tc.want)
			}
			if next.called != (tc.want == http.StatusOK) {
				t.Errorf("handler called = %v, want %v", next.called, tc.want == http.StatusOK)
			}
		})
	}
}

func TestRequireRole(t *testing.T) {
	cases := []struct {
		name     string
		claims   *token.Claims
		required string
		want     int
	}{
		{"holds the role", &token.Claims{Roles: []string{"SYSTEM_ADMIN"}}, "SYSTEM_ADMIN", http.StatusOK},
		{"holds it among several", &token.Claims{Roles: []string{"PROFESSIONAL", "SYSTEM_ADMIN"}}, "SYSTEM_ADMIN", http.StatusOK},
		{"a clinic admin is not the SaaS operator", &token.Claims{Roles: []string{"CLINIC_ADMIN"}}, "SYSTEM_ADMIN", http.StatusForbidden},
		{"holds no roles", &token.Claims{Roles: nil}, "SYSTEM_ADMIN", http.StatusForbidden},
		{"case differs", &token.Claims{Roles: []string{"system_admin"}}, "SYSTEM_ADMIN", http.StatusForbidden},
		{"no claims in context", nil, "SYSTEM_ADMIN", http.StatusUnauthorized},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next := &nextRecorder{}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orgs", nil)
			if tc.claims != nil {
				req = req.WithContext(withClaims(req.Context(), tc.claims))
			}
			rec := httptest.NewRecorder()

			RequireRole(tc.required)(next.handler()).ServeHTTP(rec, req)

			if rec.Code != tc.want {
				t.Errorf("status = %d, want %d", rec.Code, tc.want)
			}
			if next.called != (tc.want == http.StatusOK) {
				t.Errorf("handler called = %v, want %v", next.called, tc.want == http.StatusOK)
			}
		})
	}
}

// TestClaimsFromContextOnAnUnprotectedRoute pins the fail-closed contract: an
// absent value yields nil, never a zero-valued *token.Claims that would read as
// "authenticated user with no org and no permissions".
func TestClaimsFromContextOnAnUnprotectedRoute(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	if got := ClaimsFromContext(req.Context()); got != nil {
		t.Errorf("ClaimsFromContext on a bare context = %+v, want nil", got)
	}

	// A value stored under a same-named key of a different type must not be
	// mistaken for claims — that is what the unexported contextKey type buys.
	//lint:ignore SA1029 the plain string key is the point: it must NOT be read back as claims
	ctx := context.WithValue(req.Context(), "claims", &token.Claims{UserID: "attacker"})
	if got := ClaimsFromContext(ctx); got != nil {
		t.Errorf("a string-keyed value was read as claims: %+v", got)
	}
}

func TestExtractBearerToken(t *testing.T) {
	cases := []struct {
		header string
		want   string
	}{
		{"Bearer abc", "abc"},
		{"Bearer  abc", " abc"}, // only the single canonical space is trimmed
		{"Bearer", ""},
		{"bearer abc", ""},
		{"BEARER abc", ""},
		{"", ""},
		{"abc", ""},
		{"Token abc", ""},
	}
	for _, tc := range cases {
		t.Run(tc.header, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.header != "" {
				r.Header.Set("Authorization", tc.header)
			}
			if got := extractBearerToken(r); got != tc.want {
				t.Errorf("extractBearerToken(%q) = %q, want %q", tc.header, got, tc.want)
			}
		})
	}
}
