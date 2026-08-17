package service

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
)

// Every part upload has to leave the session somewhere to accumulate the
// transcript the window jobs produce (Fase 4). These tests pin the two
// properties that decide whether that is safe to have in the path of a live
// recording: it happens, and it can never be the reason a part is lost.

// fakePartialRepo records what AppendPart asked of the repository. The
// interface is embedded rather than implemented so that a method these tests do
// not expect to be called panics instead of quietly returning a zero value.
type fakePartialRepo struct {
	aidrafts.Repository
	mu      sync.Mutex
	ensured []aidrafts.EnsurePartialParams
	err     error
}

func (f *fakePartialRepo) EnsurePartial(_ context.Context, p aidrafts.EnsurePartialParams) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ensured = append(f.ensured, p)
	return f.err
}

func (f *fakePartialRepo) calls() []aidrafts.EnsurePartialParams {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]aidrafts.EnsurePartialParams(nil), f.ensured...)
}

func testKeyManager(t *testing.T) *crypto.KeyManager {
	t.Helper()
	km, err := crypto.NewKeyManager(strings.Repeat("ab", 32))
	if err != nil {
		t.Fatalf("key manager: %v", err)
	}
	return km
}

// partsService builds the service the parts tests exercise: a temp audio dir,
// a real key manager, and a repository that only records.
func partsService(t *testing.T, dir string) *Service {
	t.Helper()
	return &Service{audioDir: dir, km: testKeyManager(t), repo: &fakePartialRepo{}}
}

func TestEveryPartMakesSureTheSessionHasSomewhereToAccumulate(t *testing.T) {
	repo := &fakePartialRepo{}
	svc := &Service{audioDir: t.TempDir(), km: testKeyManager(t), repo: repo}

	for i := range 3 {
		if err := appendPart(t, svc, i, "audio"); err != nil {
			t.Fatalf("part %d: %v", i, err)
		}
	}

	calls := repo.calls()
	if len(calls) != 3 {
		t.Fatalf("want one ensure per part, got %d", len(calls))
	}
	// Idempotence lives in SQL, not here: the service calls on every part on
	// purpose, so nothing has to remember whether it is the first. If that ever
	// moves into Go, this test is what says the decision changed.
	for _, c := range calls {
		if c.OrganizationID != testOrg || c.AppointmentID != testAppt || c.UploadID != testUp {
			t.Fatalf("ensure addressed the wrong upload: %+v", c)
		}
		if len(c.EncryptedDEK) == 0 || c.KeySource == "" {
			t.Fatalf("ensure carried no wrapped key: %+v", c)
		}
	}
}

func TestAPartIsNotLostBecauseTheScratchRowCouldNotBeCreated(t *testing.T) {
	repo := &fakePartialRepo{err: errors.New("database is on fire")}
	dir := t.TempDir()
	svc := &Service{audioDir: dir, km: testKeyManager(t), repo: repo}

	// The whole of Fase 4 is an optimization sitting on top of a pipeline that
	// already works. The moment a failure here can fail a part upload, it stops
	// being one: a professional loses a minute of a real session so that a
	// transcription could have started earlier. This is the test that says so.
	if err := appendPart(t, svc, 0, "audio"); err != nil {
		t.Fatalf("a failing partial transcript took the part down with it: %v", err)
	}

	path := filepath.Join(dir, testOrg, testAppt, testUp+".0"+partSuffix)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("the part never reached disk: %v", err)
	}
}

func TestEachRecordingSessionGetsAKeyOfItsOwn(t *testing.T) {
	repo := &fakePartialRepo{}
	svc := &Service{audioDir: t.TempDir(), km: testKeyManager(t), repo: repo}

	if err := appendPart(t, svc, 0, "audio"); err != nil {
		t.Fatal(err)
	}
	if err := appendPart(t, svc, 1, "audio"); err != nil {
		t.Fatal(err)
	}

	calls := repo.calls()
	if bytes.Equal(calls[0].EncryptedDEK, calls[1].EncryptedDEK) {
		t.Fatal("the same wrapped key was offered twice; a DEK is minted per call and must be random")
	}
}
