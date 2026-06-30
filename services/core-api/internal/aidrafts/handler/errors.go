package handler

import (
	"errors"
	"net/http"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/httputil"
)

var draftErrors = httputil.ErrorMapper(func(err error) (int, string) {
	switch {
	case errors.Is(err, aidrafts.ErrNotFound):
		return http.StatusNotFound, "ai draft not found"
	case errors.Is(err, aidrafts.ErrForbidden):
		return http.StatusForbidden, "access denied"
	case errors.Is(err, aidrafts.ErrInvalidInput):
		return http.StatusUnprocessableEntity, "invalid input"
	case errors.Is(err, aidrafts.ErrNotReady):
		return http.StatusConflict, "draft is not ready for approval"
	case errors.Is(err, aidrafts.ErrConflict):
		return http.StatusConflict, err.Error()
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, draftErrors)
}
