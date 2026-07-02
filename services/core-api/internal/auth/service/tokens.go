package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/token"
)

// refreshPayload is stored as JSON in Redis under the refresh token key.
// Deliberately minimal: Refresh reloads the user (roles, permissions, email)
// from the database, so the payload is a pointer, not a snapshot — a cached
// snapshot would keep revoked roles alive for the whole refresh TTL. Old
// payloads with extra keys (org/roles/perms) still parse fine.
type refreshPayload struct {
	UserID string `json:"uid"`
	Epoch  int64  `json:"ep"` // password epoch this token was issued under
}

// passwordEpoch returns the user's current password epoch (0 when unset).
func (s *Service) passwordEpoch(ctx context.Context, userID string) int64 {
	v, err := s.rdb.Get(ctx, pwEpochPrefix+userID).Int64()
	if err != nil {
		return 0
	}
	return v
}

// bumpPasswordEpoch advances the epoch, invalidating every refresh token the
// user holds. Called after a password reset or change.
func (s *Service) bumpPasswordEpoch(ctx context.Context, userID string) {
	_ = s.rdb.Incr(ctx, pwEpochPrefix+userID).Err()
}

func (s *Service) issueTokenPair(ctx context.Context, user *auth.User) (*token.Pair, error) {
	now := time.Now()

	claims := token.Claims{
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
		Email:          user.Email,
		DisplayName:    user.DisplayName,
		Roles:          user.Roles,
		Permissions:    user.Permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
		},
	}

	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("signing access token: %w", err)
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("generating refresh token: %w", err)
	}
	refreshToken := hex.EncodeToString(raw)

	payload := refreshPayload{
		UserID: user.ID,
		Epoch:  s.passwordEpoch(ctx, user.ID),
	}
	payloadJSON, _ := json.Marshal(payload)

	if err := s.rdb.Set(ctx, refreshTokenPrefix+refreshToken, payloadJSON, s.refreshTTL).Err(); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}

	return &token.Pair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(s.accessTTL.Seconds()),
	}, nil
}
