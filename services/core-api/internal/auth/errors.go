package auth

import "errors"

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountLocked      = errors.New("account locked, try again later")
	ErrAccountInactive    = errors.New("account inactive")
)
