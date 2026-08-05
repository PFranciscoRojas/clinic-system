package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The access log is the one place where every request is written to disk, so it
// is also the easiest place to leak PII by accident (CLAUDE.md rule 4). These
// tests pin both halves: the fields that must be there, and the request data
// that must never be.

func captureLog(t *testing.T, req *http.Request, next http.Handler) map[string]any {
	t.Helper()

	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	rec := httptest.NewRecorder()

	StructuredLogger(logger)(next).ServeHTTP(rec, req)

	line := strings.TrimSpace(buf.String())
	if line == "" {
		t.Fatal("the middleware logged nothing")
	}
	var entry map[string]any
	if err := json.Unmarshal([]byte(line), &entry); err != nil {
		t.Fatalf("log line is not JSON: %v\n%s", err, line)
	}
	return entry
}

func TestStructuredLoggerRecordsTheRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/patients", strings.NewReader("{}"))
	req.RemoteAddr = "203.0.113.4:5000"

	entry := captureLog(t, req, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("hello"))
	}))

	want := map[string]any{
		"msg":       "request",
		"method":    "POST",
		"path":      "/api/v1/patients",
		"status":    float64(http.StatusCreated),
		"bytes":     float64(5),
		// Bare IP, no port: the field is a client identity, and the ephemeral
		// source port changes on every connection from the same client.
		"remote_ip": "203.0.113.4",
	}
	for k, v := range want {
		if entry[k] != v {
			t.Errorf("%s = %v, want %v", k, entry[k], v)
		}
	}
	if _, ok := entry["duration_ms"]; !ok {
		t.Error("duration_ms is missing")
	}
}

// TestStructuredLoggerReportsAnImplicitStatus covers the handler that writes a
// body without calling WriteHeader: chi's wrapper must still report 200 rather
// than 0, or every successful request would log as a zero status.
func TestStructuredLoggerReportsAnImplicitStatus(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/patients", nil)

	entry := captureLog(t, req, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))

	if entry["status"] != float64(http.StatusOK) {
		t.Errorf("status = %v, want 200", entry["status"])
	}
}

// TestStructuredLoggerNeverLogsTheQueryStringOrCredentials is the regression
// guard that matters. Switching "path" from r.URL.Path to r.URL.String() or
// r.RequestURI would start writing search terms — which are hashed PII by
// design — into the access log.
func TestStructuredLoggerNeverLogsTheQueryStringOrCredentials(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/patients?email=paciente@example.com&document=1020304050", nil)
	req.Header.Set("Authorization", "Bearer super-secret-token")
	req.Header.Set("Cookie", "session=another-secret")

	entry := captureLog(t, req, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	if entry["path"] != "/api/v1/patients" {
		t.Errorf("path = %v, want the bare path with no query string", entry["path"])
	}

	raw, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("re-marshal: %v", err)
	}
	for _, secret := range []string{
		"paciente@example.com",
		"1020304050",
		"super-secret-token",
		"another-secret",
		"email=",
		"document=",
	} {
		if bytes.Contains(raw, []byte(secret)) {
			t.Errorf("the access log contains %q:\n%s", secret, raw)
		}
	}
}
