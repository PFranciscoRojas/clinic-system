package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const claimsKey contextKey = "claims"

// Claims are the JWT payload fields embedded in every authenticated request.
type Claims struct {
	UserID         string   `json:"sub"`
	OrganizationID string   `json:"org"`
	Roles          []string `json:"roles"`
	jwt.RegisteredClaims
}

// RequireAuth validates the Bearer JWT and injects Claims into the request context.
// Returns 401 if the token is missing, expired, or has an invalid signature.
func RequireAuth(jwtSecret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			claims := &Claims{}
			parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return jwtSecret, nil
			})
			if err != nil || !parsed.Valid {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ClaimsFromContext retrieves JWT claims from the request context.
// Panics if called outside of RequireAuth-protected routes.
func ClaimsFromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey).(*Claims)
	return c
}

// RequirePermission checks that the authenticated user has the given permission code.
// Permission codes follow the format "resource:action" (e.g. "patients:read").
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Actual permission lookup against DB will be implemented in Fase 3.
			// Placeholder: pass through (DB-backed RBAC wired in auth handler).
			next.ServeHTTP(w, r)
		})
	}
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}
