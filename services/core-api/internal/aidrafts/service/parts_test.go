package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"sghcp/core-api/internal/aidrafts"
)

// Uploading the session in parts, while it is still being recorded, instead of
// as one body at the end.
//
// The whole recording already exists chunk by chunk in the browser from second
// one (recordingStore), and it was all held back until "Finalizar sesión" — so
// the professional watched a progress bar move bytes that could have travelled
// during the hour they were already sitting there.
//
// Each part is its own file rather than an append to a shared one. That buys the
// three properties this needs and an O_APPEND stream does not: a retried part
// overwrites itself instead of duplicating, parts may arrive out of order or at
// the same time, and nothing has to remember how far the upload got.

const (
	testOrg  = "11111111-1111-1111-1111-111111111111"
	testAppt = "22222222-2222-2222-2222-222222222222"
	testUp   = "33333333-3333-3333-3333-333333333333"
)

// Comfortably past abandonedPartAge without pinning the test to its value.
func timeLongAgo() time.Time { return time.Now().Add(-30 * 24 * time.Hour) }

func appendPart(t *testing.T, svc *Service, index int, body string) error {
	t.Helper()
	return svc.AppendPart(context.Background(), AppendPartInput{
		OrganizationID: testOrg,
		AppointmentID:  testAppt,
		UploadID:       testUp,
		Index:          index,
		Part:           strings.NewReader(body),
	})
}

func assemble(t *testing.T, svc *Service) (string, error) {
	t.Helper()
	return svc.assembleParts(AssemblePartsInput{
		OrganizationID: testOrg,
		AppointmentID:  testAppt,
		UploadID:       testUp,
		Ext:            ".webm",
	})
}

func TestPartsAssembleInIndexOrderNotArrivalOrder(t *testing.T) {
	svc := partsService(t, t.TempDir())

	// Deliberately backwards. A part is a slice of a clinical session: assembled
	// in the wrong order the audio is still a valid file, still transcribes, and
	// produces a plausible note about a conversation that never happened that
	// way. There is nothing downstream that would notice.
	for _, p := range []struct {
		index int
		body  string
	}{{2, "CCC"}, {0, "AAA"}, {1, "BBB"}} {
		if err := appendPart(t, svc, p.index, p.body); err != nil {
			t.Fatalf("append part %d: %v", p.index, err)
		}
	}

	path, err := assemble(t, svc)
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}
	assertFileContent(t, path, "AAABBBCCC", "assembled session")
}

// The safety property. A gap means minutes of the session are missing, and the
// result is a shorter file that transcribes perfectly well — so the failure is
// silent unless it is refused here.
func TestAssembleRefusesAGapInTheParts(t *testing.T) {
	svc := partsService(t, t.TempDir())
	for _, i := range []int{0, 1, 3} {
		if err := appendPart(t, svc, i, fmt.Sprintf("part-%d ", i)); err != nil {
			t.Fatalf("append part %d: %v", i, err)
		}
	}

	if _, err := assemble(t, svc); !errors.Is(err, aidrafts.ErrInvalidInput) {
		t.Fatalf("got %v, want ErrInvalidInput — part 2 never arrived", err)
	}
}

func TestAssembleRefusesAnUploadWithNoParts(t *testing.T) {
	svc := partsService(t, t.TempDir())
	if _, err := assemble(t, svc); !errors.Is(err, aidrafts.ErrInvalidInput) {
		t.Fatalf("got %v, want ErrInvalidInput", err)
	}
}

// A part that times out and is retried must replace itself. Appending it a
// second time would double those seconds of audio, which is the same class of
// damage as losing them.
func TestRetryingAPartReplacesItInsteadOfDuplicating(t *testing.T) {
	svc := partsService(t, t.TempDir())
	if err := appendPart(t, svc, 0, "first attempt"); err != nil {
		t.Fatalf("append: %v", err)
	}
	if err := appendPart(t, svc, 0, "retry"); err != nil {
		t.Fatalf("retry: %v", err)
	}

	path, err := assemble(t, svc)
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}
	assertFileContent(t, path, "retry", "retried part")
}

// The browser uploads while it records, so two parts can be in flight together
// on a slow uplink. Under -race this also pins that AppendPart keeps no shared
// state across calls.
func TestPartsArriveConcurrently(t *testing.T) {
	svc := partsService(t, t.TempDir())
	const parts = 12

	var wg sync.WaitGroup
	errs := make([]error, parts)
	want := strings.Builder{}
	bodies := make([]string, parts)
	for i := range parts {
		bodies[i] = fmt.Sprintf("[%02d]", i)
		want.WriteString(bodies[i])
	}
	for i := range parts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = svc.AppendPart(context.Background(), AppendPartInput{
				OrganizationID: testOrg,
				AppointmentID:  testAppt,
				UploadID:       testUp,
				Index:          i,
				Part:           strings.NewReader(bodies[i]),
			})
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("part %d: %v", i, err)
		}
	}

	path, err := assemble(t, svc)
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}
	assertFileContent(t, path, want.String(), "concurrent parts")
}

// Nothing may survive assembly: the parts are unencrypted PHI, and after this
// point the only file anybody is tracking is the assembled take.
func TestAssemblyLeavesNoPartsBehind(t *testing.T) {
	dir := t.TempDir()
	svc := partsService(t, dir)
	for i := range 4 {
		if err := appendPart(t, svc, i, "audio "); err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	path, err := assemble(t, svc)
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}

	var left []string
	if err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && p != path {
			left = append(left, p)
		}
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(left) != 0 {
		t.Fatalf("assembly left PHI on disk: %v", left)
	}
}

// The cap has to hold across the whole upload. Per-part it is meaningless: a
// client that keeps sending 1 MB parts fills the disk one acceptable request at
// a time, and every single one of them is under any per-part limit.
func TestPartsAreCappedByTheirTotal(t *testing.T) {
	// A few kilobytes, not the real 200 MB: proving the arithmetic does not
	// require writing the limit to disk on every run, and a test that costs that
	// much is a test somebody eventually deletes.
	svc := partsService(t, t.TempDir())
	svc.maxUploadBytes = 4096
	kb := strings.Repeat("x", 1024)

	var lastErr error
	for i := range 8 {
		if lastErr = appendPart(t, svc, i, kb); lastErr != nil {
			break
		}
	}
	if !errors.Is(lastErr, aidrafts.ErrTooLarge) {
		t.Fatalf("got %v, want ErrTooLarge once the parts add up past the cap", lastErr)
	}
}

// The refusal has to happen while the body is arriving, not after it landed.
// One part bigger than the whole allowance is the case a per-part limit would
// catch and a "check the total first" would not: nothing is on disk yet, so the
// total reads as zero and the write proceeds.
func TestOneOversizedPartIsCutOffMidBody(t *testing.T) {
	dir := t.TempDir()
	svc := partsService(t, dir)
	svc.maxUploadBytes = 4096

	err := appendPart(t, svc, 0, strings.Repeat("x", 64*1024))
	if !errors.Is(err, aidrafts.ErrTooLarge) {
		t.Fatalf("got %v, want ErrTooLarge", err)
	}
	var left []string
	if err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			left = append(left, p)
		}
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(left) != 0 {
		t.Fatalf("the refused part is still on disk: %v", left)
	}
}

// Both ids reach the filesystem. The upload id is minted by the browser, which
// makes it the one piece of this path that an attacker controls outright.
func TestPartsRejectIdsAndIndexesTheyCannotTrust(t *testing.T) {
	svc := partsService(t, t.TempDir())

	for _, uploadID := range []string{
		"", "..", "../../etc/passwd", "not-a-uuid",
		"33333333-3333-3333-3333-333333333333/../../x",
	} {
		err := svc.AppendPart(context.Background(), AppendPartInput{
			OrganizationID: testOrg, AppointmentID: testAppt,
			UploadID: uploadID, Index: 0, Part: strings.NewReader("x"),
		})
		if !errors.Is(err, aidrafts.ErrInvalidInput) {
			t.Errorf("upload id %q: got %v, want ErrInvalidInput", uploadID, err)
		}
	}

	for _, index := range []int{-1, MaxParts, MaxParts + 1} {
		err := svc.AppendPart(context.Background(), AppendPartInput{
			OrganizationID: testOrg, AppointmentID: testAppt,
			UploadID: testUp, Index: index, Part: strings.NewReader("x"),
		})
		if !errors.Is(err, aidrafts.ErrInvalidInput) {
			t.Errorf("index %d: got %v, want ErrInvalidInput", index, err)
		}
	}
}

// One tenant's recording must never be reachable from another's upload, even
// with the same upload id — the id comes from the client and nothing stops two
// of them colliding, by accident or otherwise.
func TestPartsAreScopedByOrgAndAppointment(t *testing.T) {
	svc := partsService(t, t.TempDir())
	const otherOrg = "44444444-4444-4444-4444-444444444444"

	if err := appendPart(t, svc, 0, "org A session"); err != nil {
		t.Fatalf("append: %v", err)
	}
	if err := svc.AppendPart(context.Background(), AppendPartInput{
		OrganizationID: otherOrg, AppointmentID: testAppt,
		UploadID: testUp, Index: 0, Part: strings.NewReader("org B session"),
	}); err != nil {
		t.Fatalf("append other org: %v", err)
	}

	pathA, err := assemble(t, svc)
	if err != nil {
		t.Fatalf("assemble A: %v", err)
	}
	pathB, err := svc.assembleParts(AssemblePartsInput{
		OrganizationID: otherOrg, AppointmentID: testAppt,
		UploadID: testUp, Ext: ".webm",
	})
	if err != nil {
		t.Fatalf("assemble B: %v", err)
	}

	assertFileContent(t, pathA, "org A session", "org A")
	assertFileContent(t, pathB, "org B session", "org B")
}

// A part whose body dies mid-transfer must not be left readable at its final
// name: assembly would splice the truncated half into the session and the
// client, having seen a failure, would send the part again on top of it.
func TestAFailedPartLeavesNothingAssemblable(t *testing.T) {
	dir := t.TempDir()
	svc := partsService(t, dir)

	err := svc.AppendPart(context.Background(), AppendPartInput{
		OrganizationID: testOrg, AppointmentID: testAppt,
		UploadID: testUp, Index: 0,
		Part: io.MultiReader(strings.NewReader("half a part"), failingReader{}),
	})
	if err == nil {
		t.Fatal("AppendPart must report a failed body read")
	}

	if _, err := assemble(t, svc); !errors.Is(err, aidrafts.ErrInvalidInput) {
		t.Fatalf("got %v, want ErrInvalidInput — the failed part must not count", err)
	}
	var left []string
	if err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			left = append(left, p)
		}
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(left) != 0 {
		t.Fatalf("failed part left files on disk: %v", left)
	}
}

// An abandoned session — the tab closed, the professional never pressed
// "Finalizar" — leaves parts nobody will ever assemble. They are unencrypted
// PHI and no draft row points at them, so nothing else is ever going to look.
func TestSweepRemovesAbandonedPartsAndKeepsFreshOnes(t *testing.T) {
	dir := t.TempDir()
	svc := partsService(t, dir)

	if err := appendPart(t, svc, 0, "abandoned"); err != nil {
		t.Fatalf("append: %v", err)
	}
	stale := filepath.Join(dir, testOrg, testAppt, testUp+".0"+partSuffix)
	old := timeLongAgo()
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	fresh := filepath.Join(dir, testOrg, testAppt, testUp+".1"+partSuffix)
	if err := os.WriteFile(fresh, []byte("still recording"), 0600); err != nil {
		t.Fatalf("write fresh: %v", err)
	}

	// A finished take. The sweep runs over the directory holding every
	// recording waiting to be transcribed; deleting one loses a session the
	// professional cannot record again.
	take := filepath.Join(dir, testOrg, testAppt, "aaaaaaaa-0000-0000-0000-000000000000.webm")
	if err := os.WriteFile(take, []byte("a whole session"), 0600); err != nil {
		t.Fatalf("write take: %v", err)
	}

	removed, err := svc.SweepAbandonedParts()
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed %d, want 1", removed)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("the abandoned part is still there")
	}
	for _, keep := range []string{fresh, take} {
		if _, err := os.Stat(keep); err != nil {
			t.Errorf("sweep deleted %s: %v", keep, err)
		}
	}
}
