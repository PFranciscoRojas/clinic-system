package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// RateLimit is what stands in front of /auth/login. The tests below pin the
// exact boundary (the Nth request passes, the N+1th does not), because an
// off-by-one here is the difference between a limit and a suggestion.

func TestRateLimitAllowsExactlyTheLimit(t *testing.T) {
	next := &nextRecorder{}
	h := RateLimit(3, time.Minute)(next.handler())

	for i := 1; i <= 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "203.0.113.7:51000"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d of 3 was rejected with %d", i, rec.Code)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = "203.0.113.7:51000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("the 4th request returned %d, want 429", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != time.Minute.String() {
		t.Errorf("Retry-After = %q, want %q", got, time.Minute.String())
	}
}

// TestRateLimitIsPerIP: one abusive client must not lock everyone else out.
func TestRateLimitIsPerIP(t *testing.T) {
	next := &nextRecorder{}
	h := RateLimit(1, time.Minute)(next.handler())

	send := func(remoteAddr string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = remoteAddr
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := send("198.51.100.1:40000"); code != http.StatusOK {
		t.Fatalf("first request from IP A: %d", code)
	}
	if code := send("198.51.100.1:40001"); code != http.StatusTooManyRequests {
		t.Errorf("second request from IP A (different source port) = %d, want 429 — "+
			"the bucket key must be the IP, not the IP:port", code)
	}
	if code := send("198.51.100.2:40000"); code != http.StatusOK {
		t.Errorf("first request from IP B = %d, want 200 — one client exhausted another's budget", code)
	}
}

// TestRateLimitAddressWithoutAPort covers the branch where SplitHostPort fails
// (some proxies rewrite RemoteAddr to a bare address).
func TestRateLimitAddressWithoutAPort(t *testing.T) {
	next := &nextRecorder{}
	h := RateLimit(1, time.Minute)(next.handler())

	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "192.0.2.55"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := send(); code != http.StatusOK {
		t.Fatalf("bare address first request = %d, want 200", code)
	}
	if code := send(); code != http.StatusTooManyRequests {
		t.Errorf("bare address second request = %d, want 429 — the fallback key must still bucket", code)
	}
}

func TestRateLimitWindowResets(t *testing.T) {
	next := &nextRecorder{}
	// A window short enough to wait out, long enough not to be flaky.
	h := RateLimit(1, 60*time.Millisecond)(next.handler())

	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "192.0.2.9:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := send(); code != http.StatusOK {
		t.Fatalf("first request = %d", code)
	}
	if code := send(); code != http.StatusTooManyRequests {
		t.Fatalf("second request inside the window = %d, want 429", code)
	}

	time.Sleep(100 * time.Millisecond)

	if code := send(); code != http.StatusOK {
		t.Errorf("request after the window elapsed = %d, want 200 — the limiter never recovers", code)
	}
}

// TestRateLimitUnderConcurrency runs with -race in CI. The counter lives in a
// map shared by every request goroutine; without the mutex this both races and
// admits more requests than the limit.
func TestRateLimitUnderConcurrency(t *testing.T) {
	const limit = 20
	const attempts = 200

	// A bare handler, not the shared nextRecorder: this test fans out across
	// goroutines and the recorder's fields are not synchronised.
	h := RateLimit(limit, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	var mu sync.Mutex
	allowed := 0

	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
			req.RemoteAddr = "192.0.2.100:9999"
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code == http.StatusOK {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if allowed != limit {
		t.Errorf("%d of %d concurrent requests were allowed, want exactly %d", allowed, attempts, limit)
	}
}

// TestRateLimitWindowBoundary pins the exact instant the window rolls over.
// Mutation testing found the comparison in `now.Sub(b.windowStart) > window`
// untested at its boundary: TestRateLimitWindowResets waits well past the
// window, so turning `>` into `>=` (or negating it) changed nothing any test
// could see — and that comparison is the difference between a limit that
// resets on time and one that resets a whole window late.
func TestRateLimitWindowBoundary(t *testing.T) {
	const window = 120 * time.Millisecond
	h := RateLimit(1, window)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "192.0.2.77:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	start := time.Now()
	if code := send(); code != http.StatusOK {
		t.Fatalf("first request = %d", code)
	}

	// Comfortably inside the window: still limited.
	time.Sleep(window / 3)
	if code := send(); code != http.StatusTooManyRequests {
		t.Errorf("request at %v into a %v window = %d, want 429",
			time.Since(start), window, code)
	}

	// Comfortably past it: allowed again.
	time.Sleep(window)
	if code := send(); code != http.StatusOK {
		t.Errorf("request at %v into a %v window = %d, want 200 — the window never rolled over",
			time.Since(start), window, code)
	}
}

// TestRateLimitCountsWithinOneWindowOnly: a second window starts a fresh
// count rather than carrying the old one, so a client that hit the limit once
// gets its full budget back rather than a reduced one.
func TestRateLimitCountsWithinOneWindowOnly(t *testing.T) {
	const window = 100 * time.Millisecond
	h := RateLimit(2, window)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "192.0.2.88:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	// Exhaust the first window.
	for i := 1; i <= 2; i++ {
		if code := send(); code != http.StatusOK {
			t.Fatalf("request %d of the first window = %d", i, code)
		}
	}
	if code := send(); code != http.StatusTooManyRequests {
		t.Fatalf("the third request in the window = %d, want 429", code)
	}

	time.Sleep(window + 50*time.Millisecond)

	// The full budget must be back, not one request.
	for i := 1; i <= 2; i++ {
		if code := send(); code != http.StatusOK {
			t.Errorf("request %d of the second window = %d, want 200 — the count "+
				"carried over instead of resetting", i, code)
		}
	}
}

// Surviving mutants in this package, and why they stay:
//
//   - ratelimit.go:34 (both mutators) is inside the sweeper goroutine that
//     evicts expired buckets. `buckets` is a closure variable with no accessor,
//     so eviction is invisible from outside: whether a stale bucket was dropped
//     or merely reset produces the same observable behaviour on every request.
//     Killing these means exporting internals purely to satisfy the tool, which
//     is a worse codebase for a better number.
//   - ratelimit.go:54 CONDITIONALS_BOUNDARY turns `now.Sub(b.windowStart) > window`
//     into `>=`. Distinguishing them requires a request landing on the exact
//     nanosecond the window elapses. Not reachable by a test that isn't a
//     coin flip, and a flaky test costs more than this mutant.
//   - subscription.go:66/72/81 are killed — by TestSubscriptionGate* in
//     internal/integration, which needs a real Postgres. gremlins only runs the
//     tests of the package it mutates, so cross-package coverage never counts.
//     Tool limitation. Do not duplicate those tests here.
