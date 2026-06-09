package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// RateLimit returns middleware that allows at most `limit` requests per
// `window` per client IP, using a fixed-window counter kept in memory.
// Suitable for the Bootstrap single-instance deployment; a multi-instance
// deployment would need a shared store (Redis).
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	type bucket struct {
		count       int
		windowStart time.Time
	}

	var (
		mu      sync.Mutex
		buckets = make(map[string]*bucket)
	)

	// Periodically drop expired buckets so the map does not grow unbounded
	// under IP churn (one goroutine per middleware instance, lives forever).
	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()
		for range ticker.C {
			mu.Lock()
			now := time.Now()
			for ip, b := range buckets {
				if now.Sub(b.windowStart) > window {
					delete(buckets, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// RealIP middleware runs earlier, so RemoteAddr holds the client
			// IP (with or without port depending on the proxy headers).
			ip := r.RemoteAddr
			if host, _, err := net.SplitHostPort(ip); err == nil {
				ip = host
			}

			mu.Lock()
			b, ok := buckets[ip]
			now := time.Now()
			if !ok || now.Sub(b.windowStart) > window {
				b = &bucket{windowStart: now}
				buckets[ip] = b
			}
			b.count++
			exceeded := b.count > limit
			mu.Unlock()

			if exceeded {
				w.Header().Set("Retry-After", window.String())
				http.Error(w, "too many requests", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
