package middleware

import (
	"net/http"
	"strconv"
	"time"

	"sghcp/core-api/internal/shared/httputil"
)

// MaxInFlight admits at most `limit` requests to the wrapped handler at a time
// and answers 429 to the rest. It refuses rather than queues, on purpose: a
// waiting request holds its connection, its goroutine and — for the routes this
// exists to protect — the deadline extension that lets a body take minutes to
// arrive. Queueing would move the resource that runs out from memory to file
// descriptors and buy nothing.
//
// This is not a rate limit. RateLimit counts requests per IP over a window and
// answers the question "is this caller asking too often"; this one counts
// requests in flight anywhere and answers "is the box already holding as much of
// this as it can". Two legitimate professionals closing their sessions at the
// same second are not abuse, and the per-IP limiter would not see them as one
// load at all — they arrive from different clinics.
//
// A limit of zero or less refuses everything. That is fail-closed rather than
// forgiving: the alternative reading, "zero means unlimited", turns a
// configuration slip into exactly the unbounded memory this was written to stop.
func MaxInFlight(limit int, retryAfter time.Duration, message string) func(http.Handler) http.Handler {
	// Buffered channel as the semaphore: a non-blocking send is the try-acquire,
	// and a receive in a deferred call is the release, which runs even if the
	// handler panics.
	slots := make(chan struct{}, max(limit, 0))

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case slots <- struct{}{}:
			default:
				// Seconds, not Duration.String(). "30" is a Retry-After; "30s" is
				// a header a client parses as garbage and ignores.
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				httputil.WriteError(w, http.StatusTooManyRequests, message)
				return
			}
			defer func() { <-slots }()
			next.ServeHTTP(w, r)
		})
	}
}
