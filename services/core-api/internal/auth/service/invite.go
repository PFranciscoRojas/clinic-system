package service

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"

	"sghcp/core-api/internal/auth"
)

const (
	invitePrefix  = "invite:"
	inviteTTL     = 48 * time.Hour
	inviteChars   = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // excludes visually confusable chars
	inviteCodeLen = 8
)

// Invite generates a one-time invite code stored in Redis.
// Only an authenticated admin should call this endpoint — the caller's userID and orgID
// come from the validated JWT claims, not the request body.
func (s *Service) Invite(ctx context.Context, orgID, callerUserID, roleName string) (code string, expiresAt time.Time, err error) {
	if roleName == "" {
		roleName = "PROFESSIONAL"
	}

	code, err = generateInviteCode()
	if err != nil {
		return "", time.Time{}, fmt.Errorf("generating invite code: %w", err)
	}

	expiresAt = time.Now().Add(inviteTTL)
	payload := auth.InvitePayload{
		OrgID:     orgID,
		RoleName:  roleName,
		CreatedBy: callerUserID,
		ExpiresAt: expiresAt,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("marshalling invite payload: %w", err)
	}

	if err := s.rdb.Set(ctx, invitePrefix+code, raw, inviteTTL).Err(); err != nil {
		return "", time.Time{}, fmt.Errorf("storing invite: %w", err)
	}
	return code, expiresAt, nil
}

func generateInviteCode() (string, error) {
	b := make([]byte, inviteCodeLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, inviteCodeLen)
	for i, v := range b {
		out[i] = inviteChars[int(v)%len(inviteChars)]
	}
	return string(out), nil
}
