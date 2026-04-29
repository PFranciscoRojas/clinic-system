package patients

import "errors"

var (
	ErrNotFound     = errors.New("patient not found")
	ErrForbidden    = errors.New("access to this patient is not allowed")
	ErrInvalidInput = errors.New("invalid input")
)
