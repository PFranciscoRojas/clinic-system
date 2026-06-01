package clinicalrecords

import "errors"

var (
	ErrNotFound       = errors.New("clinical record not found")
	ErrForbidden      = errors.New("access to this record is not allowed")
	ErrInvalidInput   = errors.New("invalid input")
	ErrNotDraft       = errors.New("record is not in DRAFT status")
	ErrAlreadyApproved = errors.New("record is already approved")
	ErrCosignRequired = errors.New("supervisor cosign is required before approval")
	ErrInternCannotApprove = errors.New("interns cannot approve clinical records")
)
