package auth

import "errors"

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountLocked      = errors.New("account locked, try again later")
	ErrAccountInactive    = errors.New("account inactive")
	ErrInviteInvalid      = errors.New("invite code is invalid or expired")
	ErrEmailAlreadyExists = errors.New("email already registered")
	ErrWeakPassword       = errors.New("password must be at least 8 characters")
	ErrUserNotFound       = errors.New("user not found")
	ErrRoleNotFound       = errors.New("role not found")
	ErrEmailNotVerified   = errors.New("email address not verified")
	ErrEmailChangePending = errors.New("email change token invalid or expired")
	ErrSelfRoleChange     = errors.New("cannot change your own role")
	ErrSelfDeactivate     = errors.New("cannot deactivate your own account")
	ErrLastAdmin          = errors.New("cannot remove the last admin of the organization")
	ErrSeatLimit          = errors.New("no clinical seats available in the plan")
)
