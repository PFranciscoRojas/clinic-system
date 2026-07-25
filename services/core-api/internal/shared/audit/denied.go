package audit

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// DeniedAction is the audit_log action for a refused resource access.
const DeniedAction = "RESOURCE_ACCESS_DENIED"

// Denied returns middleware that records, with success=false, every
// authenticated request that was refused one specific resource: a 403, or the
// 404 that RLS produces when the row belongs to another organization.
//
// Pasting another clinic's link is indistinguishable from a typo or a stale
// bookmark at this layer — the API answers 404 either way, on purpose, so a
// probe cannot confirm that the id exists elsewhere. The trail is therefore
// not an alarm: it is the evidence that the refusal happened, which is what
// Ley 1581 asks a data controller to be able to show.
//
// Only requests whose route carries a resource id are recorded, so ordinary
// unmatched-path noise never reaches audit_log. Must be composed after
// RequireAuth; requests without claims are skipped by the writer.
func (w *Writer) Denied() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			rec := &statusRecorder{ResponseWriter: rw, status: http.StatusOK}
			next.ServeHTTP(rec, r)

			if rec.status != http.StatusForbidden && rec.status != http.StatusNotFound {
				return
			}
			resourceType, resourceID := routeResource(r)
			if resourceID == "" {
				return
			}
			w.record(r, DeniedAction, resourceType, resourceID, "", false)
		})
	}
}

// statusRecorder captures the status code without buffering the body, so
// streamed responses (CSV and PDF exports) are unaffected.
type statusRecorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (s *statusRecorder) WriteHeader(code int) {
	if !s.written {
		s.status = code
		s.written = true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	s.written = true // an implicit 200
	return s.ResponseWriter.Write(b)
}

// routeResource pulls the resource this request was after: the deepest URL
// param that is a uuid, plus the collection segment right before it in the
// route pattern ("/api/v1/patients/{id}" → "patients"). Returns an empty id
// when the route addresses no single resource.
func routeResource(r *http.Request) (resourceType, resourceID string) {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		return "", ""
	}

	key := ""
	for i := len(rctx.URLParams.Values) - 1; i >= 0; i-- {
		if _, err := uuid.Parse(rctx.URLParams.Values[i]); err == nil {
			key, resourceID = rctx.URLParams.Keys[i], rctx.URLParams.Values[i]
			break
		}
	}
	if resourceID == "" {
		return "", ""
	}

	// Walk the pattern to the segment holding that param and take its parent.
	segments := strings.Split(strings.Trim(rctx.RoutePattern(), "/"), "/")
	for i, seg := range segments {
		if seg == "{"+key+"}" && i > 0 {
			// "clinical-records" → "clinical_record", matching the resource_type
			// spelling the handlers already write.
			parent := strings.ReplaceAll(segments[i-1], "-", "_")
			return strings.TrimSuffix(parent, "s"), resourceID
		}
	}
	return "resource", resourceID
}
