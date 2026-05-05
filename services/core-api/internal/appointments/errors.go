package appointments

import "errors"

var (
	ErrNotFound     = errors.New("appointment not found")
	ErrForbidden    = errors.New("access to this appointment is not allowed")
	ErrInvalidInput = errors.New("invalid input")
	ErrConflict     = errors.New("appointment time conflicts with an existing appointment")
	ErrAlreadyDone  = errors.New("appointment cannot be modified in its current status")
)
