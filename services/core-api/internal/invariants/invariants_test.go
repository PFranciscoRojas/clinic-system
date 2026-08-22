// Package invariants holds checks that read the source code itself rather than
// running it. They answer the question no unit test asks: "did something get in
// that nobody looked at?" — a patient's name on its way to a log file, a call
// to a host nobody decided to talk to.
//
// They are tests and not a CI grep so they run in `go test ./...`, which means
// they run in the pre-push hook and on a laptop too. A check that only exists
// in CI is a check you meet after you have already pushed.
//
// Everything here lives in _test.go files: this package ships no code.
package invariants

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"
)

// moduleRoot returns …/services/core-api, resolved from this file's own path so
// the checks work whatever the working directory is.
func moduleRoot() string {
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
}

func shortPath(path string) string {
	if r, err := filepath.Rel(moduleRoot(), path); err == nil {
		return r
	}
	return path
}

// goFiles walks the module and returns every .go file worth reading.
func goFiles(t *testing.T) []string {
	t.Helper()
	var out []string
	err := filepath.WalkDir(moduleRoot(), func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case "vendor", "node_modules", ".git", "testdata":
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(path, ".go") {
			out = append(out, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(out) < 50 {
		t.Fatalf("only found %d .go files — the walk is not seeing the module, "+
			"so this check would pass no matter what the code did", len(out))
	}
	sort.Strings(out)
	return out
}

// ─── Outbound hosts ──────────────────────────────────────────────────────────

// Every host this service is allowed to name. A new entry is a decision:
// something in here now talks to a third party, and the patient data that
// reaches it is governed by Colombian habeas data (Ley 1581) whether or not
// anyone thought about it at the time.
//
// The check is deliberately blunt — it matches URLs anywhere in the Go source,
// including email templates — because "somebody added a domain" is exactly the
// change that disappears in a diff you skim. Adding a line here costs ten
// seconds; noticing an exfiltration endpoint in a 900-line PR costs everything.
var allowedHosts = map[string]string{
	"api.mercadopago.com":   "payments (BC-6)",
	"api.resend.com":        "transactional email",
	"graph.facebook.com":    "WhatsApp Business API (currently disabled)",
	"www.googleapis.com":    "Google Calendar sync + OAuth userinfo",
	"oauth2.googleapis.com": "Google OAuth token exchange",
	"accounts.google.com":   "Google OAuth consent screen",
	"wa.me":                 "click-to-chat links in emails — no data leaves with the click",
	"chapni.com":            "our own marketing site",
	"www.chapni.com":        "our own marketing site",
	"app.chapni.com":        "our own app",
	// The pre-Chapni domain. Still served by Caddy: MercadoPago webhooks for
	// preapprovals created before the move, and the Google OAuth redirect
	// registered against it, still arrive here.
	"marcelachapues.com":     "legacy domain, still live",
	"api.marcelachapues.com": "legacy domain, still live",
	"app":                    "placeholder base URL in email-template fixtures",
	"app.test":               "test fixture",
	"ai-service:8000":        "internal, docker network only",
	"localhost":              "development",
	"127.0.0.1":              "development",
	"example.com":            "documentation and test fixtures",
	"test.local":             "test fixtures",
	"schemas.sghcp.dev":      "our own event-schema namespace, never dereferenced",
	"www.w3.org":             "XML/SVG namespace URI, never fetched",
	"pkg.go.dev":             "documentation links in comments",
	"github.com":             "source links in comments",
	"gophersource.com":       "attribution in a vendored snippet",
}

var urlPattern = regexp.MustCompile(`https?://([A-Za-z0-9._:-]+)`)

func TestNoUndeclaredOutboundHosts(t *testing.T) {
	offenders := map[string][]string{}

	for _, path := range goFiles(t) {
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		for _, m := range urlPattern.FindAllStringSubmatch(string(src), -1) {
			host := strings.TrimSuffix(m[1], ".")
			if _, ok := allowedHosts[host]; ok {
				continue
			}
			// localhost:5173, 127.0.0.1:8080 — the port is not part of the
			// decision for hosts we already trust.
			if h, _, found := strings.Cut(host, ":"); found {
				if _, ok := allowedHosts[h]; ok {
					continue
				}
			}
			offenders[host] = append(offenders[host], shortPath(path))
		}
	}

	for host, files := range offenders {
		t.Errorf("undeclared host %q in %s\n"+
			"\tIf this service should talk to it, add it to allowedHosts with the "+
			"reason. If it should not, that is the finding.",
			host, strings.Join(files, ", "))
	}
}

// ─── Direct dependencies ─────────────────────────────────────────────────────

// Every module this service depends on directly, and why. Adding one is the
// change that vanishes in a diff you skim — go.sum grows by twenty unreadable
// lines and nobody reads them — and it is also the highest-leverage way to get
// hostile code into a system that decrypts clinical histories.
//
// A dependency that cannot be justified in one line probably should not be
// here. That is the point of writing the line.
var directDependencies = map[string]string{
	"github.com/go-chi/chi/v5":                                     "HTTP router",
	"github.com/go-chi/cors":                                       "CORS middleware",
	"github.com/jackc/pgx/v5":                                      "Postgres driver",
	"github.com/redis/go-redis/v9":                                 "Redis client (sessions, streams, jobs)",
	"github.com/golang-jwt/jwt/v5":                                 "JWT signing and verification",
	"github.com/google/uuid":                                       "UUIDs",
	"github.com/go-pdf/fpdf":                                       "clinical-record and invoice PDFs",
	"golang.org/x/crypto":                                          "bcrypt",
	"golang.org/x/text":                                            "Unicode normalisation for search tokens",
	"golang.org/x/oauth2":                                          "Google Calendar OAuth",
	"google.golang.org/api":                                        "Google Calendar API",
	"github.com/alicebob/miniredis/v2":                             "test only: in-process Redis",
	"github.com/cucumber/godog":                                    "test only: Gherkin acceptance suite",
	"github.com/testcontainers/testcontainers-go":                  "test only: throwaway Postgres",
	"github.com/testcontainers/testcontainers-go/modules/postgres": "test only: throwaway Postgres",
}

func TestNoUndeclaredDependencies(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(moduleRoot(), "go.mod"))
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}

	declared := map[string]bool{}
	inBlock := false
	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "require ("):
			inBlock = true
			continue
		case inBlock && trimmed == ")":
			inBlock = false
			continue
		}
		if !inBlock || trimmed == "" || strings.HasPrefix(trimmed, "//") {
			continue
		}
		if strings.Contains(trimmed, "// indirect") {
			continue
		}
		module := strings.Fields(trimmed)[0]
		declared[module] = true
		if _, ok := directDependencies[module]; !ok {
			t.Errorf("undeclared direct dependency %q\n"+
				"\tAdd it to directDependencies with the one-line reason it is here, "+
				"in the same commit that introduces it. If you cannot write the line, "+
				"that is the answer.", module)
		}
	}

	if len(declared) == 0 {
		t.Fatal("parsed no direct requires from go.mod — this check is reading nothing")
	}
	for module := range directDependencies {
		if !declared[module] {
			t.Errorf("%q is listed here but is no longer a direct requirement; drop the line",
				module)
		}
	}
}

// ─── PII in logs ─────────────────────────────────────────────────────────────

// Log calls, by the method name. Receivers vary (slog, s.logger, e.logger), so
// the check keys on the method and requires the receiver to mention "log".
var logCall = regexp.MustCompile(
	`(?i)\b([A-Za-z0-9_.]*log[A-Za-z0-9_.]*)\.(Debug|Info|Warn|Error)(Context)?\(`)

// Field names that are plaintext PII in this codebase's vocabulary. CLAUDE.md
// rule 4: names, documents, phones and SOAP are encrypted at rest — writing
// them to stdout hands them to whoever reads the container logs, in the clear,
// forever, outside the encryption boundary the whole design rests on.
var piiTokens = []string{
	"firstname", "lastname", "fullname", "patientname",
	"documentnumber", "birthdate", "phone", "address",
	"subjective", "objective", "assessment", "transcript",
	"diagnosis", "signaturepng", "plaindek", "password",
}

// Suffixes that make a value safe: a hash is not the datum, an ID is not a
// person, and a length or a count says nothing about who.
var safeSuffixes = []string{"hash", "id", "ids", "len", "count", "err", "error"}

// stringLiteral strips double-quoted text so the scan reads the values being
// logged, not the message describing them. Without this, the log line for a
// failed password change ("auth.change-password") reads as a leaked password.
var stringLiteral = regexp.MustCompile(`"[^"]*"`)

var identifier = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]*`)

// piiIdentifiersIn returns the names on a line that look like plaintext PII.
func piiIdentifiersIn(line string) []string {
	var found []string
	for _, ident := range identifier.FindAllString(stringLiteral.ReplaceAllString(line, `""`), -1) {
		low := strings.ToLower(ident)
		safe := false
		for _, s := range safeSuffixes {
			if strings.HasSuffix(low, s) {
				safe = true
				break
			}
		}
		if safe {
			continue
		}
		for _, tok := range piiTokens {
			if strings.Contains(low, tok) {
				found = append(found, ident)
				break
			}
		}
	}
	return found
}

func TestNoPIIInLogCalls(t *testing.T) {
	for _, path := range goFiles(t) {
		if strings.HasSuffix(path, "_test.go") {
			continue // fixtures are invented people
		}
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		for i, line := range strings.Split(string(src), "\n") {
			if !logCall.MatchString(line) {
				continue
			}
			for _, ident := range piiIdentifiersIn(line) {
				t.Errorf("%s:%d logs %q, which is encrypted at rest:\n\t%s\n"+
					"\tLog an identifier instead. If this really is not PII, "+
					"rename it or add its suffix to safeSuffixes.",
					shortPath(path), i+1, ident, strings.TrimSpace(line))
			}
		}
	}
}

// The check above is worthless if the pattern stops matching how this codebase
// writes a log call, and nothing else would ever tell us — it would simply
// find nothing and pass. So: prove it still recognises the real forms, and
// prove it still catches a violation.
func TestThePIICheckStillWorks(t *testing.T) {
	recognised := []string{
		`slog.Error("boom", "err", err)`,
		`s.logger.Info("started", "interval", d)`,
		`slog.WarnContext(ctx, "slow", "ms", n)`,
		`e.logger.Warn("retry", "attempt", i)`,
	}
	for _, line := range recognised {
		if !logCall.MatchString(line) {
			t.Errorf("the log-call pattern no longer matches %q — the PII check is "+
				"passing because it is looking at nothing", line)
		}
	}
	if logCall.MatchString(`h.svc.Info("not a logger")`) {
		t.Error("the pattern matches a non-logger call; it will produce false positives")
	}

	// And the scan itself: real leaks caught, ordinary lines left alone.
	leaks := []string{
		`slog.Info("created", "firstName", p.FirstName)`,
		`s.logger.Error("send failed", "phone", patient.Phone)`,
		`slog.Warn("draft", "soap", draft.Subjective)`,
	}
	for _, line := range leaks {
		if len(piiIdentifiersIn(line)) == 0 {
			t.Errorf("%s is not detected as a leak", line)
		}
	}
	clean := []string{
		`slog.Error("auth.change-password", "err", err)`, // the word is in the message
		`slog.Info("patient created", "patient_id", id)`,
		`slog.Info("login", "email_hash", emailHash)`,
	}
	for _, line := range clean {
		if got := piiIdentifiersIn(line); len(got) > 0 {
			t.Errorf("%s is flagged as a leak (%v); false positives are how a "+
				"check like this gets deleted", line, got)
		}
	}
}

// ─── Redis streams have a ceiling ────────────────────────────────────────────

// xAddArgs matches a Redis stream producer: the composite literal handed to
// XAdd. Every one of them must set MaxLen.
//
// XACK does not delete. It takes an entry off the consumer group's pending list
// and leaves the entry in the stream for ever, so a queue that is working
// perfectly grows without bound and never once looks wrong. The three AI lanes
// held 120 KB the day this check was written — small enough that nothing would
// have noticed for a year, which is why it is capped now rather than after.
//
// The reason it is a source check and not a unit test on the four call sites we
// happen to have today: the failure is a *new* producer added later without a
// ceiling, by someone who has no reason to know any of this. A test that names
// the existing four would keep passing while the fifth one leaked.
var xAddArgs = regexp.MustCompile(`XAdd\((?:ctx|context\.\w+\(\))?[^,]*,\s*&redis\.XAddArgs\{`)

func TestEveryRedisStreamIsCapped(t *testing.T) {
	producers := 0
	for _, path := range goFiles(t) {
		if strings.HasSuffix(path, "_test.go") {
			continue // a test's stream dies with its container
		}
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		text := string(src)
		for _, loc := range xAddArgs.FindAllStringIndex(text, -1) {
			producers++
			// The literal ends at the first closing brace at its own nesting
			// depth; Values is a nested map, so counting is the only honest way
			// to find where the arguments stop.
			body, ok := literalBody(text[loc[1]:])
			if !ok {
				t.Errorf("%s:%d has an XAddArgs literal this check cannot read to the end of",
					shortPath(path), 1+strings.Count(text[:loc[0]], "\n"))
				continue
			}
			if !strings.Contains(body, "MaxLen:") {
				t.Errorf("%s:%d adds to a Redis stream without a MaxLen.\n"+
					"\tXACK does not delete — an uncapped stream grows for ever, and the\n"+
					"\tsuggestion lane's entries carry patient_id and org_id in the clear,\n"+
					"\tso the tail becomes a permanent unencrypted record of which patient\n"+
					"\thad clinical activity and when. Add:\n"+
					"\t\tMaxLen: redisstream.MaxLen,\n\t\tApprox: true,",
					shortPath(path), 1+strings.Count(text[:loc[0]], "\n"))
			}
		}
	}
	// Same guard as everywhere else here: a regexp that stops matching passes
	// silently and for ever.
	if producers < 4 {
		t.Fatalf("only found %d XAddArgs literals — the pattern has stopped matching "+
			"how this codebase enqueues, so this check is looking at nothing", producers)
	}
}

// literalBody returns the contents of a composite literal whose opening brace
// has already been consumed.
func literalBody(s string) (string, bool) {
	depth := 1
	for i, r := range s {
		switch r {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[:i], true
			}
		}
	}
	return "", false
}
