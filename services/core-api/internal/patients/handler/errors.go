package handler

import (
	"errors"
	"net/http"

	"sghcp/core-api/internal/patients"
	"sghcp/core-api/internal/shared/httputil"
)

// writeErr maps patients domain sentinels to the appropriate HTTP status.
func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, patients.ErrNotFound):
		httputil.WriteError(w, http.StatusNotFound, "patient not found")
	case errors.Is(err, patients.ErrForbidden):
		httputil.WriteError(w, http.StatusForbidden, "access denied")
	case errors.Is(err, patients.ErrInvalidInput):
		httputil.WriteError(w, http.StatusUnprocessableEntity, "invalid input")
	default:
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
	}
}
