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
	case errors.Is(err, clinicalrecords.ErrCosignRequired):
		return http.StatusConflict, "supervisor cosign required before approval"
	case errors.Is(err, clinicalrecords.ErrInternCannotApprove):
		return http.StatusForbidden, "interns cannot approve clinical records"
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, recordErrors)
}
