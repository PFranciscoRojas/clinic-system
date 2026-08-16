package invariants

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"
)

// The queue ETA reads a recording's length out of its size on disk, and that
// conversion is only valid because the recorder encodes at one fixed bitrate.
//
// Nothing breaks when the two drift. The browser records at the new bitrate,
// core-api keeps dividing by the old one, and every professional is quoted a
// wait that is wrong by exactly the ratio — silently, and in the direction
// nobody checks, since a draft that arrives early is never reported as a bug.
// Halving the bitrate to save bandwidth would double every estimate on screen.
func TestTheRecorderBitrateTheETAAssumesIsTheOneTheRecorderUses(t *testing.T) {
	goBytes := goConstExpr(t,
		filepath.Join(moduleRoot(), "internal", "aidrafts", "service", "eta.go"),
		"recorderBytesPerSecond")
	tsBits := tsConst(t,
		filepath.Join(moduleRoot(), "..", "frontend", "src", "lib", "recording.ts"),
		"AUDIO_BITS_PER_SECOND")

	if goBytes*8 != tsBits {
		t.Fatalf("core-api converts audio at %d bits/s (recorderBytesPerSecond = %d) "+
			"but the recorder captures at %d bits/s: every queue ETA is off by %.2fx",
			goBytes*8, goBytes, tsBits, float64(tsBits)/float64(goBytes*8))
	}
}

// goConstExpr reads `name = <int> / <int>` or `name = <int>`, the two forms the
// constant is allowed to take. Deliberately not a full expression parser: a
// constant this load-bearing should stay readable at a glance.
func goConstExpr(t *testing.T, path, name string) int {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s*` + name + `\s*=\s*([\d_]+)(?:\s*/\s*([\d_]+))?\s*$`)
	m := matchOne(t, path, re)
	n := atoi(t, m[1])
	if m[2] != "" {
		n /= atoi(t, m[2])
	}
	return n
}

func tsConst(t *testing.T, path, name string) int {
	t.Helper()
	re := regexp.MustCompile(`(?m)^export const ` + name + `\s*=\s*([\d_]+)`)
	return atoi(t, matchOne(t, path, re)[1])
}

func matchOne(t *testing.T, path string, re *regexp.Regexp) []string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	m := re.FindAllStringSubmatch(string(body), -1)
	if len(m) != 1 {
		t.Fatalf("%s: expected exactly one match for %s, got %d", shortPath(path), re, len(m))
	}
	return m[0]
}

func atoi(t *testing.T, s string) int {
	t.Helper()
	n, err := strconv.Atoi(regexp.MustCompile(`_`).ReplaceAllString(s, ""))
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return n
}
