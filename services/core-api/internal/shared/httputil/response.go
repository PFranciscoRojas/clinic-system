package httputil

import (
	"encoding/json"
	"net"
	"net/http"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}

func DecodeJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	return json.NewDecoder(r.Body).Decode(v)
}

// ClientIP returns the client's IP as the middleware stack resolved it, and is
// the only sanctioned way to get it. It never reads a request header itself.
//
// The header is attacker-controlled. Anyone can send
// `X-Forwarded-For: 1.2.3.4` or `X-Real-IP: whatever`, so trusting the value a
// client supplied turns the rate limiter into a no-op (a fresh IP per request
// means a fresh bucket per request, and the brute-force limit on /auth/login
// stops existing) and writes a forged address into the consent evidence and
// the audit trail — records whose whole purpose is to say who did something
// and from where.
//
// Only the right-hand end of X-Forwarded-For is trustworthy, because our own
// Caddy appends it; the middleware in cmd/api/routes.go is what reads it. Here
// we only fetch what it stored, falling back to the TCP peer address for
// requests that never passed through that stack (tests, other entrypoints).
func ClientIP(r *http.Request) string {
	if ip := chimiddleware.GetClientIP(r.Context()); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
