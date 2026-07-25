package audit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// serve routes req through a router shaped like the real one — the resource
// routes live in subrouters mounted under /api/v1, and chi only reports the
// full pattern once the mount has been walked.
func serve(t *testing.T, method, path string) (resourceType, resourceID string) {
	t.Helper()

	patients := chi.NewRouter()
	patients.Get("/{id}", func(http.ResponseWriter, *http.Request) {})
	patients.Get("/export.csv", func(http.ResponseWriter, *http.Request) {})

	records := chi.NewRouter()
	records.Get("/{id}", func(http.ResponseWriter, *http.Request) {})

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req)
			resourceType, resourceID = routeResource(req)
		})
	})
	r.Mount("/api/v1/patients", patients)
	r.Mount("/api/v1/patients/{patient_id}/clinical-records", records)

	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(method, path, nil))
	return resourceType, resourceID
}

func TestRouteResource(t *testing.T) {
	const (
		pid = "178756cc-4535-413c-9c7a-94610acb674e"
		rid = "9f1a2b3c-0000-4000-8000-000000000001"
	)

	tests := []struct {
		name     string
		path     string
		wantType string
		wantID   string
	}{
		{"single resource", "/api/v1/patients/" + pid, "patient", pid},
		{"deepest id wins", "/api/v1/patients/" + pid + "/clinical-records/" + rid, "clinical_record", rid},
		{"collection has no id", "/api/v1/patients/export.csv", "", ""},
		{"non-uuid param is not a resource", "/api/v1/patients/not-a-uuid", "", ""},
		{"unmatched route", "/api/v1/nope/" + pid, "", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotType, gotID := serve(t, http.MethodGet, tc.path)
			if gotType != tc.wantType || gotID != tc.wantID {
				t.Errorf("routeResource(%s) = (%q, %q), want (%q, %q)",
					tc.path, gotType, gotID, tc.wantType, tc.wantID)
			}
		})
	}
}

// A nil-pool Writer must stay inert: the middleware is wired on every
// protected route, so it can never panic its way into a request.
func TestDeniedWithoutPoolIsInert(t *testing.T) {
	w := New(nil)
	h := w.Denied()(http.HandlerFunc(func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(http.StatusNotFound)
	}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/patients/x", nil))

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404 passed through", rec.Code)
	}
}

func TestStatusRecorderDefaultsTo200(t *testing.T) {
	rec := &statusRecorder{ResponseWriter: httptest.NewRecorder(), status: http.StatusOK}
	if _, err := rec.Write([]byte("body")); err != nil {
		t.Fatal(err)
	}
	if rec.status != http.StatusOK {
		t.Errorf("status = %d, want 200 for a body written without WriteHeader", rec.status)
	}
}
