package handler

import (
	"errors"
	"net/http"

	"sghcp/core-api/internal/appointments"
	"sghcp/core-api/internal/shared/httputil"
)

var apptErrors = httputil.ErrorMapper(func(err error) (int, string) {
	switch {
	case errors.Is(err, appointments.ErrNotFound):
		return http.StatusNotFound, "appointment not found"
	case errors.Is(err, appointments.ErrForbidden):
		return http.StatusForbidden, "access denied"
	case errors.Is(err, appointments.ErrInvalidInput):
		return http.StatusUnprocessableEntity, "invalid input"
	case errors.Is(err, appointments.ErrConflict):
		return http.StatusConflict, "appointment time conflict"
	case errors.Is(err, appointments.ErrAlreadyDone):
		return http.StatusConflict, "appointment cannot be modified in its current status"
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, apptErrors)
}
