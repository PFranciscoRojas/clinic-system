package httputil

import "net/http"

// ErrorMapper translates a domain error into an HTTP status code and message.
// Each bounded context defines its own ErrorMapper in its handler package.
// Return status 0 to signal "unhandled" — WriteErrorFrom falls back to 500.
type ErrorMapper func(err error) (status int, msg string)

// WriteErrorFrom applies mapper to err and writes the HTTP error response.
func WriteErrorFrom(w http.ResponseWriter, err error, mapper ErrorMapper) {
	status, msg := mapper(err)
	if status == 0 {
		status = http.StatusInternalServerError
		msg = "internal error"
	}
	WriteError(w, status, msg)
}
