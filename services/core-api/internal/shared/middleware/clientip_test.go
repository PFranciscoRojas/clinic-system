package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"sghcp/core-api/internal/shared/httputil"
)

// What these guard: chi's RealIP overwrote RemoteAddr with the LEFTMOST
// X-Forwarded-For entry — a value the caller types. A different one per
// request meant a different rate-limit bucket per request, so the
// brute-force limit on /auth/login was decorative, and the IP written into
// consent evidence and the audit trail was whatever the signer felt like
// claiming. It shipped that way (GO-2026-5777, GO-2026-5775).
//
// The fix only holds because of the deployment: Caddy is the sole ingress and
// core-api is not published to the host, so the rightmost entry is always the
// one Caddy appended. These tests model that topology instead of asserting on
// a bare request, because a test that skips the proxy would be testing a
// configuration we do not run.

// asCaddyWould rewrites the request the way the real proxy does: the client's
// address is appended to whatever X-Forwarded-For the client sent, and the TCP
// peer becomes Caddy itself on the docker network.
func asCaddyWould(req *http.Request, clientIP string) *http.Request {
	if existing := req.Header.Get("X-Forwarded-For"); existing != "" {
		req.Header.Set("X-Forwarded-For", existing+", "+clientIP)
	} else {
		req.Header.Set("X-Forwarded-For", clientIP)
	}
	req.RemoteAddr = "10.0.0.5:44300"
	return req
}

func productionStack(inner http.Handler) http.Handler {
	// The same two, in the same order, as cmd/api/routes.go.
	return chimiddleware.ClientIPFromRemoteAddr(
		chimiddleware.ClientIPFromXFF()(inner),
	)
}

// The attack, verbatim: one attacker, a fresh forged origin on every request.
func TestForgedForwardedForCannotBuyExtraRequests(t *testing.T) {
	next := &nextRecorder{}
	h := productionStack(RateLimit(3, time.Minute)(next.handler()))

	send := func(forged string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.Header.Set("X-Forwarded-For", forged)
		req.Header.Set("X-Real-IP", forged)
		req.Header.Set("True-Client-IP", forged)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, asCaddyWould(req, "198.51.100.9"))
		return rec.Code
	}

	forged := []string{"203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4", "203.0.113.5"}
	for i, f := range forged[:3] {
		if code := send(f); code != http.StatusOK {
			t.Fatalf("request %d was rejected with %d before the limit", i+1, code)
		}
	}
	for i, f := range forged[3:] {
		if code := send(f); code != http.StatusTooManyRequests {
			t.Errorf("request %d returned %d, want 429 — a forged header bought a "+
				"fresh rate-limit bucket, so there is no login rate limit at all", i+4, code)
		}
	}
}

// The other half. Everyone arrives through the same proxy, so keying on
// something too coarse would put every clinic in one bucket and let a single
// abuser lock out the whole customer base.
func TestVisitorsBehindTheProxyGetTheirOwnBuckets(t *testing.T) {
	next := &nextRecorder{}
	h := productionStack(RateLimit(1, time.Minute)(next.handler()))

	send := func(clientIP string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, asCaddyWould(req, clientIP))
		return rec.Code
	}

	if code := send("203.0.113.10"); code != http.StatusOK {
		t.Fatalf("first visitor got %d", code)
	}
	if code := send("203.0.113.11"); code != http.StatusOK {
		t.Errorf("a second visitor got %d, want 200 — everyone behind the proxy "+
			"is sharing one bucket", code)
	}
	if code := send("203.0.113.10"); code != http.StatusTooManyRequests {
		t.Errorf("the first visitor's second request got %d, want 429", code)
	}
}

// ClientIP is the only sanctioned accessor and must be safe when the caller
// never installed the middleware: the TCP peer, never a header.
func TestClientIPIgnoresHeadersWithoutTheMiddleware(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "198.51.100.20:33000"
	req.Header.Set("X-Forwarded-For", "203.0.113.99")
	req.Header.Set("X-Real-IP", "203.0.113.98")

	if got := httputil.ClientIP(req); got != "198.51.100.20" {
		t.Errorf("ClientIP = %q, want the TCP peer 198.51.100.20 — a header reached "+
			"a caller that never installed the middleware", got)
	}
}

// The access log is an evidence trail too, and it must record the address the
// stack resolved rather than the one the visitor asked us to write down.
func TestTheAccessLogRecordsTheResolvedIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.77") // the lie
	req = asCaddyWould(req, "198.51.100.30")          // what Caddy appends

	var entry map[string]any
	h := productionStack(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		entry = captureLog(t, r, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
	}))
	h.ServeHTTP(httptest.NewRecorder(), req)

	if entry["remote_ip"] != "198.51.100.30" {
		t.Errorf("remote_ip = %v, want 198.51.100.30 — the access log is recording "+
			"an address the visitor chose", entry["remote_ip"])
	}
}
