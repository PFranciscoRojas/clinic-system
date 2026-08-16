package invariants

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The ai-service container must declare what it may take from the box.
//
// This is not tidiness. The box is 2 vCPU and 1915 MB, shared with Postgres,
// Redis, Caddy and core-api, and Whisper takes every core it is offered. While
// transcription only ran between sessions that was harmless: nobody was waiting
// on the box. Transcribing during the session (fase 4) puts it in direct
// competition with the professional who is recording right now.
//
// Without the limits nothing here fails loudly. Requests get slower, a part
// upload times out, the kernel picks a victim among the running containers, and
// none of it points back at the transcription that caused it. A missing line in
// a compose file is exactly the kind of regression a review does not catch.
func TestTheAIServiceDeclaresItsCPUAndMemoryLimits(t *testing.T) {
	block := composeService(t, "ai-service")

	for _, key := range []string{"cpus", "mem_limit"} {
		if !regexp.MustCompile(`(?m)^\s{4}` + key + `:`).MatchString(block) {
			t.Fatalf("docker-compose.yml: the ai-service has no %s. Whisper will take "+
				"every core on a box that is also serving the session being recorded", key)
		}
	}

	// Below 2 would still let it take the whole box; the point of the limit is
	// that something is left for core-api and Postgres.
	cpus := regexp.MustCompile(`(?m)^\s{4}cpus:\s*"?([\d.]+)"?`).FindStringSubmatch(block)
	if cpus == nil {
		t.Fatal("docker-compose.yml: ai-service cpus is not a number")
	}
	if cpus[1] >= "2" {
		t.Fatalf("ai-service cpus = %s on a 2-vCPU box: that is not a limit", cpus[1])
	}
}

// composeService returns the body of one service block from docker-compose.yml.
func composeService(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join(moduleRoot(), "..", "..", "docker-compose.yml")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	lines := strings.Split(string(body), "\n")
	start := -1
	for i, l := range lines {
		if strings.HasPrefix(l, "  "+name+":") {
			start = i + 1
			break
		}
	}
	if start < 0 {
		t.Fatalf("docker-compose.yml has no service %q", name)
	}
	for i := start; i < len(lines); i++ {
		// The next service starts at two spaces of indentation.
		if regexp.MustCompile(`^  \S`).MatchString(lines[i]) {
			return strings.Join(lines[start:i], "\n")
		}
	}
	return strings.Join(lines[start:], "\n")
}
