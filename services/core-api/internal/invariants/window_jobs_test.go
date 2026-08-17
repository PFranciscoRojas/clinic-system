package invariants

import (
	"path/filepath"
	"regexp"
	"testing"
)

// core-api enqueues the window jobs of Fase 4 and the Python worker runs them.
// Neither of the two things they have to agree on can be checked by a compiler,
// and neither fails loudly when it drifts.

// TestTheWorkerAndCoreAPIAgreeOnPartFilenames pins the shape of a part on disk.
//
// core-api writes `<upload_id>.<index>.chunk` and sends the worker the directory
// and a count; the worker rebuilds the names. Rename the suffix on one side and
// every window job finds no parts at all, logs "a part has not arrived yet", and
// returns — quietly, forever, because that message is also what a healthy race
// with a slow upload looks like. The sessions still get transcribed at
// "Finalizar", so the only symptom is that the feature does nothing.
func TestTheWorkerAndCoreAPIAgreeOnPartFilenames(t *testing.T) {
	goSuffix := goStringConst(t,
		filepath.Join(moduleRoot(), "internal", "aidrafts", "service", "parts.go"),
		"partSuffix")
	pySuffix := pyStringConst(t,
		filepath.Join(moduleRoot(), "..", "ai-service", "src", "ai_service",
			"transcription", "windows.py"),
		"PART_SUFFIX")

	if goSuffix != pySuffix {
		t.Fatalf("core-api names parts %q but the worker looks for %q: "+
			"every window job would find nothing and say so as if the upload were slow",
			goSuffix, pySuffix)
	}
}

// TestTheWindowStreamHasTheSameNameOnBothSides pins the third lane's stream.
//
// A consumer group only ever sees the stream it was opened on. Misspell it on
// the producer and the jobs pile up in a stream nobody reads: no error, no
// consumer, and a Redis key growing for as long as the flag stays on.
func TestTheWindowStreamHasTheSameNameOnBothSides(t *testing.T) {
	goStream := goStringConst(t,
		filepath.Join(moduleRoot(), "internal", "aidrafts", "service", "service.go"),
		"windowStream")
	pyStream := pyStringConst(t,
		filepath.Join(moduleRoot(), "..", "ai-service", "src", "ai_service", "worker.py"),
		"WINDOW_STREAM_NAME")

	if goStream != pyStream {
		t.Fatalf("core-api enqueues window jobs on %q and the worker reads %q: "+
			"the jobs would accumulate in a stream with no consumer", goStream, pyStream)
	}
}

func goStringConst(t *testing.T, path, name string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s*` + name + `\s*=\s*"([^"]*)"`)
	return matchOne(t, path, re)[1]
}

func pyStringConst(t *testing.T, path, name string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^` + name + `(?::\s*str)?\s*=\s*"([^"]*)"`)
	return matchOne(t, path, re)[1]
}
