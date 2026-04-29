package handler

import (
	"errors"
	"net/http"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/httputil"
)

var patientErrors = httputil.ErrorMapper(func(err error) (int, string) {
	switch {
	case errors.Is(err, patients.ErrNotFound):
		return http.StatusNotFound, "patient not found"
	case errors.Is(err, patients.ErrForbidden):
		return http.StatusForbidden, "access denied"
	case errors.Is(err, patients.ErrInvalidInput):
		return http.StatusUnprocessableEntity, "invalid input"
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, patientErrors)
}
