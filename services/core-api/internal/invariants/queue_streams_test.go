package invariants

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// The audio pipeline runs on two Redis streams: drafts on one, recap/plan/risk
// on the other, so a three-second suggestion does not queue behind an hour of
// audio (docs/ai/PLAN_LATENCIA_AUDIO.md, fase 5).
//
// The names are written in Go and read in Python. Nothing at either end fails
// when they disagree: core-api keeps enqueueing happily onto a stream no
// consumer group reads, and the jobs simply never happen. The suggestion sits
// on PENDING in the UI until someone goes looking. That is the failure this
// file exists to make loud, and it is why the check reads the other service's
// source instead of trusting a comment.

var streamAssign = regexp.MustCompile(`aiStream\s*=\s*"([^"]+)"`)

func readOne(t *testing.T, path string, re *regexp.Regexp) string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	m := re.FindAllStringSubmatch(string(body), -1)
	if len(m) != 1 {
		t.Fatalf("%s: expected exactly one match for %s, got %d", shortPath(path), re, len(m))
	}
	return m[0][1]
}

func pythonConst(t *testing.T, name string) string {
	t.Helper()
	worker := filepath.Join(moduleRoot(), "..", "ai-service", "src", "ai_service", "worker.py")
	return readOne(t, worker, regexp.MustCompile(`(?m)^`+name+`\s*=\s*"([^"]+)"`))
}

func TestProducersAndWorkerAgreeOnTheStreamNames(t *testing.T) {
	drafts := readOne(t, filepath.Join(moduleRoot(), "internal", "aidrafts", "service", "service.go"), streamAssign)
	suggestions := readOne(t, filepath.Join(moduleRoot(), "internal", "aisuggestions", "service.go"), streamAssign)

	if got, want := drafts, pythonConst(t, "STREAM_NAME"); got != want {
		t.Errorf("drafts are enqueued on %q but the worker reads %q", got, want)
	}
	if got, want := suggestions, pythonConst(t, "FAST_STREAM_NAME"); got != want {
		t.Errorf("suggestions are enqueued on %q but the worker reads %q", got, want)
	}
}

func TestSuggestionsDoNotShareTheAudioStream(t *testing.T) {
	drafts := readOne(t, filepath.Join(moduleRoot(), "internal", "aidrafts", "service", "service.go"), streamAssign)
	suggestions := readOne(t, filepath.Join(moduleRoot(), "internal", "aisuggestions", "service.go"), streamAssign)

	if drafts == suggestions {
		t.Fatalf("both kinds enqueue on %q: a consumer group cannot route by content, "+
			"so this puts recaps back behind the audio", drafts)
	}
}

// TestEverySuggestionKindIsRoutedToTheFastStream guards the other half of the
// contract: the worker decides what a job is by its `kind`, and a kind core-api
// accepts but the worker does not list as a suggestion goes down the draft path,
// where it has no draft_id and is acked away as malformed.
func TestEverySuggestionKindIsRoutedToTheFastStream(t *testing.T) {
	body, err := os.ReadFile(filepath.Join(moduleRoot(), "internal", "aisuggestions", "service.go"))
	if err != nil {
		t.Fatal(err)
	}
	goKinds := regexp.MustCompile(`validKinds\s*=\s*map\[string\]bool\{([^}]*)\}`).FindStringSubmatch(string(body))
	if goKinds == nil {
		t.Fatal("could not find validKinds in aisuggestions/service.go")
	}
	kinds := regexp.MustCompile(`"([^"]+)"`).FindAllStringSubmatch(goKinds[1], -1)
	if len(kinds) == 0 {
		t.Fatal("validKinds parsed as empty")
	}

	worker := filepath.Join(moduleRoot(), "..", "ai-service", "src", "ai_service", "worker.py")
	workerBody, err := os.ReadFile(worker)
	if err != nil {
		t.Fatal(err)
	}
	pySet := regexp.MustCompile(`SUGGESTION_KINDS\s*=\s*frozenset\(\{([^}]*)\}\)`).FindStringSubmatch(string(workerBody))
	if pySet == nil {
		t.Fatal("could not find SUGGESTION_KINDS in worker.py")
	}
	known := map[string]bool{}
	for _, m := range regexp.MustCompile(`"([^"]+)"`).FindAllStringSubmatch(pySet[1], -1) {
		known[m[1]] = true
	}

	for _, k := range kinds {
		if !known[k[1]] {
			t.Errorf("core-api accepts kind %q but the worker does not treat it as a suggestion", k[1])
		}
	}
}
