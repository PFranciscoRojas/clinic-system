package handler

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"

	"sghcp/core-api/internal/aidrafts"
	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	"sghcp/core-api/internal/shared/middleware"
	"sghcp/core-api/internal/shared/token"
)

// What these tests pin: several sessions closing at the same minute is the
// ordinary case in a clinic, and before the limiter each of them held its slice
// of the multipart body in RAM with nothing counting them. The numbers in
// audio_limits.go only mean something if the middleware is actually in the
// chain, and in the right place in it — which is what gets lost in a refactor,
// silently, with every test still green.

const testJWTSecret = "test-secret-for-audio-limits"

// blockingSvc holds every AppendPart inside the handler until release is closed,
// which is the only way to have slots genuinely occupied rather than racing on
// timing.
type blockingSvc struct {
	entered chan struct{}
	release chan struct{}
}

func (b *blockingSvc) AppendPart(aidraftssvc.AppendPartInput) error {
	b.entered <- struct{}{}
	<-b.release
	return nil
}

func (b *blockingSvc) UploadAudio(context.Context, aidraftssvc.UploadAudioInput) (string, error) {
	return "", nil
}
func (b *blockingSvc) GetDraft(context.Context, string, string) (*aidrafts.AIDraft, error) {
	return nil, nil
}
func (b *blockingSvc) ListDrafts(context.Context, string, string) ([]*aidrafts.DraftMeta, error) {
	return nil, nil
}
func (b *blockingSvc) EstimateWait(context.Context, string, string, string) (*aidraftssvc.QueueETA, error) {
	return nil, nil
}

func (b *blockingSvc) DecryptDraftContent(context.Context, string, string) (*aidrafts.AIDraft, string, error) {
	return nil, "", nil
}
func (b *blockingSvc) DecryptForReview(context.Context, string, string) (*aidrafts.AIDraft, string, string, error) {
	return nil, "", "", nil
}
func (b *blockingSvc) ResolveDraft(context.Context, string, string, string, string) error { return nil }
func (b *blockingSvc) SaveFeedback(context.Context, aidrafts.DraftFeedback) error         { return nil }
func (b *blockingSvc) FeedbackStats(context.Context, string, aidrafts.StatsRange) (*aidrafts.FeedbackStats, error) {
	return nil, nil
}

var _ svcPort = (*blockingSvc)(nil)

// withURLParam puts the appointment id where chi.URLParam reads it. The handlers
// take it from the route pattern, and a request built by hand has no route
// context at all — without this every request 422s on "invalid appointment id"
// and the tests below would pass for the wrong reason.
func withURLParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// handlerWith builds the real Handler wiring — the same limiters New installs —
// around a service that can be made to block. The db stays nil on purpose: none
// of the paths these tests reach touch it, and a nil pool that would panic is a
// useful tripwire if that ever stops being true.
func handlerWith(svc svcPort) *Handler {
	return &Handler{
		svc: svc,
		limitWholeUpload: middleware.MaxInFlight(
			maxConcurrentWholeUploads, wholeUploadRetryAfter, busyMessage),
		limitPartUpload: middleware.MaxInFlight(
			maxConcurrentPartUploads, partUploadRetryAfter, busyMessage),
	}
}

func signedToken(t *testing.T, permissions ...string) string {
	t.Helper()
	claims := &token.Claims{
		UserID:         "00000000-0000-0000-0000-0000000000aa",
		OrganizationID: "00000000-0000-0000-0000-0000000000bb",
		Permissions:    permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("signing the test token: %v", err)
	}
	return signed
}

// authed wraps a route the way the real router does, so the tests exercise the
// composition (auth, then permission, then the limiter) and not just the leaf.
func authed(h http.Handler) http.Handler {
	return middleware.RequireAuth([]byte(testJWTSecret))(h)
}

const testAppointmentID = "11111111-2222-3333-4444-555555555555"

func partRequest(t *testing.T, index int, bearer string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("upload_id", "99999999-8888-7777-6666-555555555555")
	_ = mw.WriteField("index", strconv.Itoa(index))
	part, err := mw.CreateFormFile("part", strconv.Itoa(index)+".webm")
	if err != nil {
		t.Fatalf("building the multipart body: %v", err)
	}
	_, _ = part.Write([]byte("not really opus, and nothing here decodes it"))
	if err := mw.Close(); err != nil {
		t.Fatalf("closing the multipart body: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/appointments/"+testAppointmentID+"/audio/parts", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+bearer)
	return withURLParam(req, "appointment_id", testAppointmentID)
}

func TestAudioPartRouteRefusesBeyondItsConcurrencyLimit(t *testing.T) {
	svc := &blockingSvc{entered: make(chan struct{}, 64), release: make(chan struct{})}
	route := authed(handlerWith(svc).AppointmentAudioPartRoute())
	bearer := signedToken(t, "ai_drafts:request")

	var wg sync.WaitGroup
	for i := 0; i < maxConcurrentPartUploads; i++ {
		// Built here, on the test goroutine: partRequest reports its failures
		// through t, which only the test goroutine may touch.
		req := partRequest(t, i, bearer)
		wg.Add(1)
		go func() {
			defer wg.Done()
			route.ServeHTTP(httptest.NewRecorder(), req)
		}()
	}
	// Every slot is now held inside AppendPart, not merely dispatched.
	for i := 0; i < maxConcurrentPartUploads; i++ {
		<-svc.entered
	}

	// Off the test goroutine and under a deadline: an unlimited route does not
	// answer this request at all, it walks into AppendPart and blocks there with
	// the others. Waiting for it inline would turn "the limiter is gone" into a
	// ten-minute test timeout with no message, which is a red build that tells
	// nobody anything.
	rec := httptest.NewRecorder()
	extra := partRequest(t, maxConcurrentPartUploads, bearer)
	answered := make(chan struct{})
	go func() {
		defer close(answered)
		route.ServeHTTP(rec, extra)
	}()
	select {
	case <-answered:
	case <-time.After(5 * time.Second):
		close(svc.release)
		t.Fatalf("part %d with all %d slots taken was never answered — it was admitted "+
			"and is blocked downstream, so the route is unbounded",
			maxConcurrentPartUploads, maxConcurrentPartUploads)
	}
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("part %d with all %d slots taken = %d, want 429 — the route is unbounded",
			maxConcurrentPartUploads, maxConcurrentPartUploads, rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "5" {
		t.Errorf("Retry-After = %q, want %q", got, "5")
	}

	// A request without the permission, arriving while every slot is taken, must
	// still be told 403 and not 429. That is the whole reason the limiter sits
	// inside RequirePermission: put it outside and any caller with a valid
	// session could close the route to everyone by flooding it with requests it
	// is not allowed to make.
	rec = httptest.NewRecorder()
	route.ServeHTTP(rec, partRequest(t, 0, signedToken(t, "patients:read")))
	if rec.Code != http.StatusForbidden {
		t.Errorf("a forbidden request with all slots taken = %d, want 403 — "+
			"the limiter is running before the permission check", rec.Code)
	}

	close(svc.release)
	wg.Wait()

	// And the slots come back, or the route is 429 forever after the first busy
	// minute of its life.
	svc2 := &blockingSvc{entered: make(chan struct{}, 64), release: make(chan struct{})}
	close(svc2.release)
	rec = httptest.NewRecorder()
	authed(handlerWith(svc2).AppointmentAudioPartRoute()).ServeHTTP(rec, partRequest(t, 0, bearer))
	if rec.Code != http.StatusNoContent {
		t.Errorf("an uncontended part = %d, want 204", rec.Code)
	}
}

// The whole-session route holds its slot for as long as the body takes to
// arrive — up to audioUploadDeadline — which is exactly why it is the one that
// could not be left unbounded. Here the body is a pipe nobody writes to, so the
// handler blocks inside ParseMultipartForm with the slot taken, the same way a
// real upload over a clinic uplink does for minutes at a time.
func TestWholeAudioUploadRouteRefusesBeyondItsConcurrencyLimit(t *testing.T) {
	route := authed(handlerWith(&blockingSvc{
		entered: make(chan struct{}, 64), release: make(chan struct{}),
	}).AppointmentAudioRoute())
	bearer := signedToken(t, "ai_drafts:request")

	stalled := func() (*io.PipeWriter, chan struct{}) {
		pr, pw := io.Pipe()
		req := httptest.NewRequest(http.MethodPost,
			"/api/v1/appointments/"+testAppointmentID+"/audio", pr)
		req.Header.Set("Content-Type", "multipart/form-data; boundary=stalled")
		req.Header.Set("Authorization", "Bearer "+bearer)
		req = withURLParam(req, "appointment_id", testAppointmentID)

		done := make(chan struct{})
		go func() {
			defer close(done)
			route.ServeHTTP(httptest.NewRecorder(), req)
		}()
		// The first boundary line lets ParseMultipartForm start reading and then
		// block waiting for the part that never comes.
		_, _ = pw.Write([]byte("--stalled\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"a.webm\"\r\n\r\n"))
		return pw, done
	}

	writers := make([]*io.PipeWriter, 0, maxConcurrentWholeUploads)
	dones := make([]chan struct{}, 0, maxConcurrentWholeUploads)
	for i := 0; i < maxConcurrentWholeUploads; i++ {
		pw, done := stalled()
		writers = append(writers, pw)
		dones = append(dones, done)
	}
	// Nothing observable says "ParseMultipartForm is now blocked on the pipe", so
	// this is the one place a wait is unavoidable. It is generous on purpose: the
	// failure it could cause is a false pass, never a false failure, and the
	// assertion that follows is the one that matters.
	time.Sleep(150 * time.Millisecond)

	rec := httptest.NewRecorder()
	var empty bytes.Buffer
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/appointments/"+testAppointmentID+"/audio", &empty)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	req.Header.Set("Authorization", "Bearer "+bearer)
	route.ServeHTTP(rec, withURLParam(req, "appointment_id", testAppointmentID))

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("upload %d with all %d slots held by in-flight bodies = %d, want 429",
			maxConcurrentWholeUploads+1, maxConcurrentWholeUploads, rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "60" {
		t.Errorf("Retry-After = %q, want %q", got, "60")
	}

	for _, pw := range writers {
		_ = pw.CloseWithError(io.ErrUnexpectedEOF)
	}
	for _, done := range dones {
		<-done
	}
}

// The budget is the point of the two constants, so pin the arithmetic rather
// than the numbers: an edit that raises one limit has to visibly spend the
// other's room, which is the whole reason they are derived from one figure.
func TestAudioUploadLimitsStayInsideTheirBudget(t *testing.T) {
	worst := maxConcurrentWholeUploads*(32<<20) + maxConcurrentPartUploads*maxPartSize
	if worst > audioUploadMemoryBudget {
		t.Errorf("worst-case resident audio is %d MB, over the %d MB budget",
			worst>>20, audioUploadMemoryBudget>>20)
	}
	if maxConcurrentWholeUploads < 1 || maxConcurrentPartUploads < 1 {
		t.Fatalf("a limit of zero refuses every upload: whole=%d parts=%d",
			maxConcurrentWholeUploads, maxConcurrentPartUploads)
	}
}
