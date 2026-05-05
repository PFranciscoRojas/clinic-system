package aidrafts

import "errors"

var (
	ErrNotFound     = errors.New("ai draft not found")
	ErrForbidden    = errors.New("access to this draft is not allowed")
	ErrInvalidInput = errors.New("invalid input")
	ErrNotReady     = errors.New("draft is not ready for approval")
)
