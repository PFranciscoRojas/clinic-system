package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"sghcp/core-api/internal/shared/audit"
	"sghcp/core-api/internal/shared/middleware"
)

// A session recording takes minutes to arrive over a clinic uplink, and the
// server-wide ReadTimeout that protects every other route would cut it
// mid-body. The audio handler is supposed to buy itself more time with
// http.ResponseController before it touches the body.
//
// That only works if every middleware between the server and the handler
// forwards the underlying ResponseWriter — ResponseController walks the chain
// through Unwrap() and gives up the moment one link does not implement it.
// When it gives up it returns http.ErrNotSupported, and the handler discards
// that error, so the failure is completely silent: uploads simply die at
// exactly ReadTimeout with a "malformed multipart body" 400.
//
// Found in production on 2026-08-11. A 2 MB upload succeeded in 1 s and the
// same 2 MB throttled to 100 KB/s (16 s) failed — time, not size.
func TestAudioUploadCanOutlastTheServerReadTimeout(t *testing.T) {
	const serverReadTimeout = 500 * time.Millisecond
	const bodyArrivalTime = 2 * time.Second

	var deadlineErr error

	// The same global chain buildRouter installs ahead of every route.
	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.ClientIPFromRemoteAddr)
	r.Use(chimiddleware.ClientIPFromXFF())
	r.Use(middleware.StructuredLogger(slog.New(slog.NewTextHandler(io.Discard, nil))))
	r.Use(chimiddleware.Recoverer)
	r.Use(exceptAudioUpload(chimiddleware.Timeout(30 * time.Second)))
	// The audio route lives inside the authenticated group, so the audit
	// middleware sits between the server and the handler. It wraps the
	// ResponseWriter to record the status code — and that wrapper is where
	// ResponseController used to lose the connection.
	r.Use(audit.New(nil).Denied())

	r.Post("/api/v1/appointments/{appointment_id}/audio", func(w http.ResponseWriter, req *http.Request) {
		rc := http.NewResponseController(w)
		deadline := time.Now().Add(time.Minute)
		// The real handler discards these errors. The test keeps them: the
		// whole defect is that they were never looked at.
		if err := rc.SetReadDeadline(deadline); err != nil {
			deadlineErr = err
		}
		if err := rc.SetWriteDeadline(deadline); err != nil && deadlineErr == nil {
			deadlineErr = err
		}
		if _, err := io.Copy(io.Discard, req.Body); err != nil {
			http.Error(w, "body read failed: "+err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})

	srv := httptest.NewUnstartedServer(r)
	srv.Config.ReadTimeout = serverReadTimeout
	srv.Config.WriteTimeout = serverReadTimeout
	srv.Start()
	defer srv.Close()

	// A body that dribbles in for longer than ReadTimeout — a slow uplink, in
	// miniature.
	pr, pw := io.Pipe()
	go func() {
		defer pw.Close()
		const chunks = 8
		for i := 0; i < chunks; i++ {
			if _, err := pw.Write([]byte("0123456789")); err != nil {
				return
			}
			time.Sleep(bodyArrivalTime / chunks)
		}
	}()

	req, err := http.NewRequest(http.MethodPost,
		srv.URL+"/api/v1/appointments/11111111-1111-1111-1111-111111111111/audio", pr)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("the upload never completed — the connection died at the server's ReadTimeout: %v", err)
	}
	defer resp.Body.Close()

	if deadlineErr != nil {
		t.Fatalf("the handler could not extend its deadline: %v\n"+
			"ResponseController lost the underlying writer somewhere in the middleware chain, "+
			"so every audio upload slower than ReadTimeout dies", deadlineErr)
	}
	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 202 — body: %s", resp.StatusCode, body)
	}
}

