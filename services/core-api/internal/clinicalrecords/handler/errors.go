package handler

import (
	"errors"
	"net/http"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/shared/httputil"
)

var recordErrors = httputil.ErrorMapper(func(err error) (int, string) {
	switch {
	case errors.Is(err, clinicalrecords.ErrNotFound):
		return http.StatusNotFound, "clinical record not found"
	case errors.Is(err, clinicalrecords.ErrForbidden):
		return http.StatusForbidden, "access denied"
	case errors.Is(err, clinicalrecords.ErrInvalidInput):
		return http.StatusUnprocessableEntity, "invalid input"
	case errors.Is(err, clinicalrecords.ErrNotDraft):
		return http.StatusConflict, "record is not in draft status"
	case errors.Is(err, clinicalrecords.ErrAlreadyApproved):
		return http.StatusConflict, "record is already approved"
	case errors.Is(err, clinicalrecords.ErrNotApproved):
		return http.StatusConflict, "addenda can only be added to approved records"
	case errors.Is(err, clinicalrecords.ErrCosignRequired):
		return http.StatusConflict, "supervisor cosign required before approval"
	case errors.Is(err, clinicalrecords.ErrInternCannotApprove):
		return http.StatusForbidden, "interns cannot approve clinical records"
	case errors.Is(err, clinicalrecords.ErrRiskRequired):
		return http.StatusUnprocessableEntity, "risk_level is required (NONE, IDEATION, PLAN or ATTEMPT)"
	case errors.Is(err, clinicalrecords.ErrMissingSection):
		return http.StatusUnprocessableEntity, "a required section is missing or empty"
	case errors.Is(err, clinicalrecords.ErrOpenProcessExists):
		return http.StatusConflict, "patient already has an open clinical process"
	case errors.Is(err, clinicalrecords.ErrNoOpenProcess):
		return http.StatusConflict, "patient has no open clinical process — create the intake (INITIAL) first"
	case errors.Is(err, clinicalrecords.ErrTemplateMismatch):
		return http.StatusConflict, "payload format does not match the record's template version"
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, recordErrors)
}
