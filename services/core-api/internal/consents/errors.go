package consents

import "errors"

var (
	ErrNotFound     = errors.New("consent not found")
	ErrInvalidInput = errors.New("invalid input")
)
