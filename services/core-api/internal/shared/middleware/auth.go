package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"sghcp/core-api/internal/shared/token"
)

type contextKey string

const claimsKey contextKey = "claims"

// RequireAuth validates the Bearer JWT and injects token.Claims into the request context.
// Returns 401 if the token is missing, expired, or has an invalid signature.
func RequireAuth(jwtSecret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := extractBearerToken(r)
			if raw == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			claims := &token.Claims{}
			parsed, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
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

// RequirePermission checks that the authenticated user has the given permission code.
// Must be composed after RequireAuth. Codes follow "resource:action" (e.g. "patients:read").
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := ClaimsFromContext(r.Context())
			if claims == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			for _, p := range claims.Permissions {
				if p == permission {
					next.ServeHTTP(w, r)
					return
				}
			}
			http.Error(w, "forbidden", http.StatusForbidden)
		})
	}
}

// ClaimsFromContext retrieves JWT claims from the request context.
// Returns nil if called outside a RequireAuth-protected route.
func ClaimsFromContext(ctx context.Context) *token.Claims {
	c, _ := ctx.Value(claimsKey).(*token.Claims)
	return c
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}
