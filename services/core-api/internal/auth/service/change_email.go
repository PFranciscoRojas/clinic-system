package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/hash"
)

const (
	emailChangePrefix = "email-change:"
	emailChangeTTL    = time.Hour
)

// RequestEmailChange validates the new address, stores a one-time token in
// Redis, and sends a verification email to the new address.
func (s *Service) RequestEmailChange(ctx context.Context, userID, newEmail string) error {
	if !looksLikeEmail(newEmail) {
		return fmt.Errorf("%w: formato de correo inválido", auth.ErrEmailAlreadyExists)
	}

	// Fail fast: check if email is already taken before sending the verification email.
	u, err := s.repo.FindUserByEmailGlobal(ctx, newEmail)
	if err == nil && u != nil {
		return auth.ErrEmailAlreadyExists
	}

	token, err := generateResetToken()
	if err != nil {
		return fmt.Errorf("generate email-change token: %w", err)
	}

	key := emailChangePrefix + hash.Token(token)
	val := userID + ":" + newEmail
	if err := s.rdb.Set(ctx, key, val, emailChangeTTL).Err(); err != nil {
		return fmt.Errorf("store email-change token: %w", err)
	}

	link := fmt.Sprintf("%s/verify-email-change?token=%s", s.appBaseURL, token)
	go s.notifier.AccountVerification(context.Background(), newEmail, notify.VerificationDetails{
		Name: newEmail,
		Link: link,
	})
	return nil
}

// ConfirmEmailChange consumes the single-use token, updates the user's email
// and invalidates all existing sessions by bumping the password epoch.
func (s *Service) ConfirmEmailChange(ctx context.Context, rawToken string) error {
	val, err := s.rdb.GetDel(ctx, emailChangePrefix+hash.Token(rawToken)).Result()
	if err != nil || val == "" {
		return auth.ErrEmailChangePending
	}

	parts := strings.SplitN(val, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return auth.ErrEmailChangePending
	}
	userID, newEmail := parts[0], parts[1]

	if err := s.repo.UpdateEmail(ctx, userID, newEmail); err != nil {
		return err
	}
	s.bumpPasswordEpoch(ctx, userID)
	return nil
}

// ListOrgUsers returns all users in the org with their current role.
func (s *Service) ListOrgUsers(ctx context.Context, orgID string) ([]auth.OrgUser, error) {
	return s.repo.ListOrgUsers(ctx, orgID)
}

// ListOrgProfessionals returns the org's active clinical staff for scheduling
// (assign-a-professional selectors). Unlike ListOrgUsers it is safe to expose
// beyond CLINIC_ADMIN: no emails as identifiers, no login data, no inactive
// accounts.
func (s *Service) ListOrgProfessionals(ctx context.Context, orgID string) ([]auth.OrgProfessional, error) {
	return s.repo.ListOrgProfessionals(ctx, orgID)
}

// DeactivateUser soft-deletes a user from the org. Guards: can't deactivate
// yourself, can't remove the last CLINIC_ADMIN.
func (s *Service) DeactivateUser(ctx context.Context, orgID, callerUserID, targetUserID string) error {
	if callerUserID == targetUserID {
		return auth.ErrSelfDeactivate
	}
	remaining, err := s.repo.CountAdminsExcluding(ctx, orgID, targetUserID)
	if err != nil {
		return fmt.Errorf("count admins: %w", err)
	}
	if remaining == 0 {
		return auth.ErrLastAdmin
	}
	n, err := s.repo.DeactivateUser(ctx, orgID, targetUserID)
	if err != nil {
		return err
	}
	if n == 0 {
		return auth.ErrUserNotFound
	}
	return nil
}

// ReactivateUser restores a previously deactivated user and assigns them a role.
func (s *Service) ReactivateUser(ctx context.Context, orgID, callerUserID, targetUserID, roleName string) error {
	if roleName == "SYSTEM_ADMIN" {
		return auth.ErrRoleNotFound
	}
	// The target is inactive, so they don't hold a seat yet — restoring them
	// into a clinical role consumes one.
	if err := s.ensureSeatAvailable(ctx, orgID, roleName, ""); err != nil {
		return err
	}
	roleID, err := s.repo.FindRoleIDByName(ctx, roleName)
	if err != nil {
		return err
	}
	return s.repo.ReactivateUser(ctx, orgID, targetUserID, roleID, callerUserID)
}

// ChangeUserRole replaces a user's org role. A user cannot change their own role,
// and SYSTEM_ADMIN cannot be assigned via this endpoint.
func (s *Service) ChangeUserRole(ctx context.Context, orgID, callerUserID, targetUserID, roleName string) error {
	if callerUserID == targetUserID {
		return auth.ErrSelfRoleChange
	}
	if roleName == "SYSTEM_ADMIN" {
		return auth.ErrRoleNotFound
	}
	// Excluding the target from the count lets a user who already occupies a
	// clinical seat switch between PROFESSIONAL and INTERN freely.
	if err := s.ensureSeatAvailable(ctx, orgID, roleName, targetUserID); err != nil {
		return err
	}
	roleID, err := s.repo.FindRoleIDByName(ctx, roleName)
	if err != nil {
		return err
	}
	return s.repo.ReplaceUserRole(ctx, orgID, targetUserID, roleID, callerUserID)
}
