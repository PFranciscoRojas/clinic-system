package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"sghcp/core-api/internal/shared/middleware"
)

const (
	maxFailedAttempts  = 5
	lockoutDuration    = 15 * time.Minute
	refreshTokenPrefix = "refresh:"
)

// refreshPayload is stored as JSON in Redis under the refresh token key.
type refreshPayload struct {
	UserID  string   `json:"uid"`
	OrgID   string   `json:"org"`
	Roles   []string `json:"roles"`
	Perms   []string `json:"perms"`
}

type Service struct {
	repo       *Repository
	rdb        *redis.Client
	jwtSecret  []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewService(repo *Repository, rdb *redis.Client, jwtSecret string, accessTTLMin, refreshTTLDays int) *Service {
	return &Service{
		repo:       repo,
		rdb:        rdb,
		jwtSecret:  []byte(jwtSecret),
		accessTTL:  time.Duration(accessTTLMin) * time.Minute,
		refreshTTL: time.Duration(refreshTTLDays) * 24 * time.Hour,
	}
}

// Login verifies credentials and returns a token pair.
// Enforces account lockout after maxFailedAttempts consecutive failures.
func (s *Service) Login(ctx context.Context, req LoginRequest, ip, userAgent string) (*TokenPair, error) {
	emailHash := hashEmail(req.Email)

	user, err := s.repo.findUserByEmail(ctx, req.OrgSlug, req.Email)
	if err != nil {
		s.repo.writeAuditLog(ctx, auditEntry{
			EmailHash:    emailHash,
			Action:       "auth.login",
			ResourceType: "user",
			IP:           ip,
			UserAgent:    userAgent,
			Success:      false,
			ErrorCode:    ptr("INVALID_CREDENTIALS"),
		})
		return nil, errInvalidCredentials
	}

	if !user.IsActive {
		s.repo.writeAuditLog(ctx, auditEntry{
			OrgID:        &user.OrganizationID,
			UserID:       &user.ID,
			EmailHash:    emailHash,
			Action:       "auth.login",
			ResourceType: "user",
			IP:           ip,
			UserAgent:    userAgent,
			Success:      false,
			ErrorCode:    ptr("ACCOUNT_INACTIVE"),
		})
		return nil, errInvalidCredentials
	}

	if user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		s.repo.writeAuditLog(ctx, auditEntry{
			OrgID:        &user.OrganizationID,
			UserID:       &user.ID,
			EmailHash:    emailHash,
			Action:       "auth.login",
			ResourceType: "user",
			IP:           ip,
			UserAgent:    userAgent,
			Success:      false,
			ErrorCode:    ptr("ACCOUNT_LOCKED"),
		})
		return nil, errors.New("account locked, try again later")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		_ = s.repo.incrementFailedAttempts(ctx, user.ID)
		if user.FailedAttempts+1 >= maxFailedAttempts {
			_ = s.repo.lockUser(ctx, user.ID, time.Now().Add(lockoutDuration))
		}
		s.repo.writeAuditLog(ctx, auditEntry{
			OrgID:        &user.OrganizationID,
			UserID:       &user.ID,
			EmailHash:    emailHash,
			Action:       "auth.login",
			ResourceType: "user",
			IP:           ip,
			UserAgent:    userAgent,
			Success:      false,
			ErrorCode:    ptr("INVALID_CREDENTIALS"),
		})
		return nil, errInvalidCredentials
	}

	_ = s.repo.clearFailedAttempts(ctx, user.ID)

	tokens, err := s.issueTokenPair(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("auth: issuing tokens: %w", err)
	}

	s.repo.writeAuditLog(ctx, auditEntry{
		OrgID:        &user.OrganizationID,
		UserID:       &user.ID,
		EmailHash:    emailHash,
		Action:       "auth.login",
		ResourceType: "user",
		IP:           ip,
		UserAgent:    userAgent,
		Success:      true,
	})

	return tokens, nil
}

// Refresh validates a refresh token stored in Redis and issues a new token pair.
// The old refresh token is deleted (rotation) to limit reuse after theft.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	key := refreshTokenPrefix + refreshToken

	raw, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, errors.New("invalid or expired refresh token")
	}

	var payload refreshPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, errors.New("malformed refresh token")
	}

	// Rotate: delete old token before issuing new one
	s.rdb.Del(ctx, key)

	user := &userRecord{
		ID:             payload.UserID,
		OrganizationID: payload.OrgID,
		Roles:          payload.Roles,
		Permissions:    payload.Perms,
	}
	return s.issueTokenPair(ctx, user)
}

// Logout invalidates the refresh token so it cannot be reused.
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.rdb.Del(ctx, refreshTokenPrefix+refreshToken).Err()
}

func (s *Service) issueTokenPair(ctx context.Context, user *userRecord) (*TokenPair, error) {
	now := time.Now()

	claims := middleware.Claims{
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

	// Refresh token is an opaque 32-byte random hex string stored in Redis
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

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(s.accessTTL.Seconds()),
	}, nil
}

func ptr(s string) *string { return &s }
