package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// MaxInFlight is what bounds the memory an audio upload may hold. The tests
// below pin the two halves that matter and are easy to get wrong in opposite
// directions: the limit is a limit (the N+1th request is refused, not queued),
// and a slot always comes back (a limiter that leaks slots ends up refusing
// everything, which looks exactly like the server being busy forever).

// blockingHandler holds every request inside the handler until release is
// closed, which is the only way to have several requests genuinely in flight at
// once without racing on timing.
type blockingHandler struct {
	entered chan struct{}
	release chan struct{}
}

func newBlockingHandler() *blockingHandler {
	return &blockingHandler{
		entered: make(chan struct{}, 1024),
		release: make(chan struct{}),
	}
}

func (b *blockingHandler) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		b.entered <- struct{}{}
		<-b.release
		w.WriteHeader(http.StatusOK)
	})
}

func post(h http.Handler) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/appointments/x/audio", nil))
	return rec
}

func TestMaxInFlightAdmitsExactlyTheLimit(t *testing.T) {
	const limit = 2
	block := newBlockingHandler()
	h := MaxInFlight(limit, 30*time.Second, "el servidor está ocupado")(block.handler())

	var wg sync.WaitGroup
	for i := 0; i < limit; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); post(h) }()
	}
	// Both are inside the handler, so both slots are genuinely taken.
	for i := 0; i < limit; i++ {
		<-block.entered
	}

	rec := post(h)
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("request %d with %d slots taken = %d, want 429", limit+1, limit, rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "30" {
		t.Errorf("Retry-After = %q, want %q — seconds, not a Go duration string", got, "30")
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("429 body is not the JSON error envelope every other error uses: %v (%q)", err, rec.Body)
	}
	if body["error"] != "el servidor está ocupado" {
		t.Errorf("error = %q, want the message the caller configured", body["error"])
	}

	close(block.release)
	wg.Wait()
}

// TestMaxInFlightReleasesItsSlot is the failure mode that would be invisible in
// development and fatal in production: uploads work until exactly `limit` of
// them have ever happened, and then the route is 429 forever.
func TestMaxInFlightReleasesItsSlot(t *testing.T) {
	h := MaxInFlight(1, time.Second, "busy")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 1; i <= 5; i++ {
		if code := post(h).Code; code != http.StatusOK {
			t.Fatalf("sequential request %d = %d, want 200 — the slot was never given back", i, code)
		}
	}
}

// TestMaxInFlightReleasesItsSlotAfterAPanic: the audio handlers touch the
// filesystem and a nil map somewhere downstream must not permanently close the
// route. The release has to be deferred, not a plain statement after the call.
func TestMaxInFlightReleasesItsSlotAfterAPanic(t *testing.T) {
	var boom atomic.Bool
	boom.Store(true)
	h := MaxInFlight(1, time.Second, "busy")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if boom.Swap(false) {
			panic("downstream")
		}
		w.WriteHeader(http.StatusOK)
	}))

	func() {
		defer func() { _ = recover() }()
		post(h)
	}()

	if code := post(h).Code; code != http.StatusOK {
		t.Errorf("request after a panicking one = %d, want 200 — the slot leaked", code)
	}
}

// TestMaxInFlightWithoutSlotsRefusesEverything pins a decision rather than a
// behaviour that fell out. Zero is fail-closed here; the tempting alternative
// ("zero means unlimited") would turn a configuration slip into the unbounded
// memory this middleware exists to prevent.
func TestMaxInFlightWithoutSlotsRefusesEverything(t *testing.T) {
	for _, limit := range []int{0, -1} {
		h := MaxInFlight(limit, time.Second, "busy")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		if code := post(h).Code; code != http.StatusTooManyRequests {
			t.Errorf("limit %d admitted a request (%d); a limit of zero or less must refuse", limit, code)
		}
	}
}

// TestMaxInFlightNeverExceedsTheLimit runs with -race in CI. The point of the
// whole middleware is the number below: however many callers arrive at once,
// the handler never has more than `limit` bodies in memory.
func TestMaxInFlightNeverExceedsTheLimit(t *testing.T) {
	const limit = 3
	const callers = 60

	var inFlight, peak atomic.Int32
	h := MaxInFlight(limit, time.Second, "busy")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		n := inFlight.Add(1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		// Long enough that the callers genuinely overlap.
		time.Sleep(2 * time.Millisecond)
		inFlight.Add(-1)
		w.WriteHeader(http.StatusOK)
	}))

	var admitted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if post(h).Code == http.StatusOK {
				admitted.Add(1)
			}
		}()
	}
	wg.Wait()

	if got := peak.Load(); got > limit {
		t.Errorf("%d requests were in the handler at once, limit is %d", got, limit)
	}
	if admitted.Load() == 0 {
		t.Error("no request was admitted at all — the limiter is refusing everything")
	}
}
