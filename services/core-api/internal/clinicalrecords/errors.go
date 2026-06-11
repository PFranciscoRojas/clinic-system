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
	ErrNotApproved    = errors.New("addenda can only be added to approved records")

	// Template v2 business rules
	ErrRiskRequired      = errors.New("risk_level is required and must be valid")
	ErrMissingSection    = errors.New("a required section is missing or empty")
	ErrOpenProcessExists = errors.New("patient already has an open clinical process (INITIAL without DISCHARGE)")
	ErrNoOpenProcess     = errors.New("patient has no open clinical process (INITIAL required first)")
	ErrTemplateMismatch  = errors.New("payload template does not match the record's template version")
)
