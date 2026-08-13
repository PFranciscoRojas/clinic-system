package aidrafts

import "errors"

var (
	ErrNotFound     = errors.New("ai draft not found")
	ErrForbidden    = errors.New("access to this draft is not allowed")
	ErrInvalidInput = errors.New("invalid input")
	ErrNotReady     = errors.New("draft is not ready for approval")
	ErrConflict     = errors.New("conflict")
	// ErrTooLarge is its own error rather than a flavour of ErrInvalidInput
	// because it is the one upload failure the professional can act on: the
	// session is too long, and the answer is to split it into takes.
	ErrTooLarge = errors.New("payload too large")
)
