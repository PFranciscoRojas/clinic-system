package service

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"sghcp/core-api/internal/aidrafts"
)

// A session can legitimately be recorded in several takes — a power cut
// mid-session, an F5, then a fresh recording — and the worker has consolidation
// logic built for exactly that (worker.py `_prior_transcriptions`). But every
// take used to land on the same path on disk: saveAudio built it from the
// appointment id alone and opened it with O_TRUNC.
//
// The second upload therefore truncated and rewrote the file the worker was
// still reading for the first draft: take 1 came out corrupt or truncated, and
// then take 2's own job found no file at all (the finished draft unlinks it) and
// dead-lettered after 3 retries. The whole second take was lost.
func TestSaveAudioGivesEachTakeItsOwnFile(t *testing.T) {
	svc := &Service{audioDir: t.TempDir()}
	const orgID = "11111111-1111-1111-1111-111111111111"
	const apptID = "22222222-2222-2222-2222-222222222222"

	takeOne := strings.Repeat("A", 4096)
	takeTwo := strings.Repeat("B", 8192)

	pathOne, err := svc.saveAudio(newTakeInput(orgID, apptID, takeOne))
	if err != nil {
		t.Fatalf("save take 1: %v", err)
	}
	pathTwo, err := svc.saveAudio(newTakeInput(orgID, apptID, takeTwo))
	if err != nil {
		t.Fatalf("save take 2: %v", err)
	}

	if pathOne == pathTwo {
		t.Fatalf("both takes share the path %q — the second truncates the first", pathOne)
	}

	// Take 1 must still be byte-for-byte intact: it is the audio a job already
	// in flight is transcribing.
	assertFileContent(t, pathOne, takeOne, "take 1")
	assertFileContent(t, pathTwo, takeTwo, "take 2")
}

// The real-world shape of the bug is a race, not a sequence: uploads overlap
// while the worker spends ~8.5 min on an hour of audio. Under -race this also
// pins that saveAudio holds no shared state across concurrent calls.
func TestSaveAudioConcurrentTakesDoNotClobberEachOther(t *testing.T) {
	svc := &Service{audioDir: t.TempDir()}
	const orgID = "11111111-1111-1111-1111-111111111111"
	const apptID = "22222222-2222-2222-2222-222222222222"

	const takes = 8
	paths := make([]string, takes)
	bodies := make([]string, takes)
	errs := make([]error, takes)

	var wg sync.WaitGroup
	for i := range takes {
		// Distinct sizes as well as distinct bytes: a partial write that lands
		// on top of a longer sibling would otherwise pass a prefix check.
		bodies[i] = strings.Repeat(string(rune('A'+i)), 1024*(i+1))
		wg.Add(1)
		go func() {
			defer wg.Done()
			paths[i], errs[i] = svc.saveAudio(newTakeInput(orgID, apptID, bodies[i]))
		}()
	}
	wg.Wait()

	seen := make(map[string]int, takes)
	for i := range takes {
		if errs[i] != nil {
			t.Fatalf("take %d: %v", i, errs[i])
		}
		if prev, dup := seen[paths[i]]; dup {
			t.Fatalf("takes %d and %d both wrote %q", prev, i, paths[i])
		}
		seen[paths[i]] = i
	}
	for i := range takes {
		assertFileContent(t, paths[i], bodies[i], fmt.Sprintf("take %d", i))
	}
}

// Two different appointments must never share a file either, and each org keeps
// its own subtree — the path is the only thing keeping one tenant's PHI audio
// out of another's directory.
func TestSaveAudioSeparatesAppointmentsAndOrgs(t *testing.T) {
	svc := &Service{audioDir: t.TempDir()}
	const orgA = "11111111-1111-1111-1111-111111111111"
	const orgB = "33333333-3333-3333-3333-333333333333"
	const apptA = "22222222-2222-2222-2222-222222222222"
	const apptB = "44444444-4444-4444-4444-444444444444"

	pathA, err := svc.saveAudio(newTakeInput(orgA, apptA, "org A audio"))
	if err != nil {
		t.Fatalf("save org A: %v", err)
	}
	pathB, err := svc.saveAudio(newTakeInput(orgB, apptB, "org B audio"))
	if err != nil {
		t.Fatalf("save org B: %v", err)
	}

	if pathA == pathB {
		t.Fatalf("different orgs share the path %q", pathA)
	}
	if !strings.Contains(pathA, orgA) || !strings.Contains(pathB, orgB) {
		t.Fatalf("audio must live under its own org subtree: %q / %q", pathA, pathB)
	}
	assertFileContent(t, pathA, "org A audio", "org A")
	assertFileContent(t, pathB, "org B audio", "org B")
}

// A failed upload must not leave a half-written file behind: the worker would
// happily transcribe the truncated PHI, and nothing else ever cleans it up.
func TestSaveAudioLeavesNothingBehindWhenTheBodyFails(t *testing.T) {
	dir := t.TempDir()
	svc := &Service{audioDir: dir}

	in := newTakeInput(
		"11111111-1111-1111-1111-111111111111",
		"22222222-2222-2222-2222-222222222222",
		"",
	)
	in.Audio = io.MultiReader(
		strings.NewReader(strings.Repeat("A", 512)),
		failingReader{},
	)

	if _, err := svc.saveAudio(in); err == nil {
		t.Fatal("saveAudio must report a failed body read")
	}

	var leftovers []string
	if err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			leftovers = append(leftovers, path)
		}
		return nil
	}); err != nil {
		t.Fatalf("walk audio dir: %v", err)
	}
	if len(leftovers) != 0 {
		t.Fatalf("failed upload left files on disk: %v", leftovers)
	}
}

// saveAudio builds a filesystem path, so it validates the extension itself
// rather than trusting the handler's allowlist to be the only caller forever.
func TestSaveAudioRejectsAnExtensionItCannotTrust(t *testing.T) {
	svc := &Service{audioDir: t.TempDir()}
	for _, ext := range []string{"", ".", "webm", "../../etc/passwd", ".we/bm", ".WEBM", ".toolongext"} {
		in := newTakeInput(
			"11111111-1111-1111-1111-111111111111",
			"22222222-2222-2222-2222-222222222222",
			"audio",
		)
		in.Ext = ext
		if _, err := svc.saveAudio(in); !errors.Is(err, aidrafts.ErrInvalidInput) {
			t.Errorf("ext %q: got %v, want ErrInvalidInput", ext, err)
		}
	}
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func newTakeInput(orgID, apptID, body string) UploadAudioInput {
	return UploadAudioInput{
		OrganizationID: orgID,
		AppointmentID:  apptID,
		Ext:            ".webm",
		Audio:          strings.NewReader(body),
		AudioSize:      int64(len(body)),
	}
}

func assertFileContent(t *testing.T, path, want, label string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%s: read %q: %v", label, path, err)
	}
	if string(got) != want {
		t.Fatalf("%s: file has %d bytes, want %d — it was overwritten by another take",
			label, len(got), len(want))
	}
}
