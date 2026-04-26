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
type refreshPayload struct {
	UserID string   `json:"uid"`
	OrgID  string   `json:"org"`
	Roles  []string `json:"roles"`
	Perms  []string `json:"perms"`
}

func (s *Service) issueTokenPair(ctx context.Context, user *auth.User) (*token.Pair, error) {
	now := time.Now()

	claims := token.Claims{
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
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
		OrgID:  user.OrganizationID,
		Roles:  user.Roles,
		Perms:  user.Permissions,
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
