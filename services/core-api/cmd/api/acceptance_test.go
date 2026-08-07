package main

// Acceptance tests: the Gherkin specification in ../features run against the
// real router, over real HTTP, on a real Postgres with every migration applied.
//
// Why this lives in package main and not in internal/integration: buildRouter is
// a method on *app, and *app is package main. Testing the assembled router means
// being inside the package that assembles it. The alternative — moving the
// wiring into an importable package purely to make it testable — would be a
// production refactor in service of a test, and this way the suite exercises the
// exact same construction the deployed binary performs.
//
// What these tests are FOR: they are the specification a human reads. Everything
// else in the suite checks that the code does what the code says; these check
// that the product does what was promised. When one fails, the failure is a
// sentence in Spanish about a broken promise, not a stack trace.

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/cucumber/godog"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/gcal"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/hash"
	"sghcp/core-api/internal/testinfra"
	"sghcp/core-api/internal/whatsapp"
)

// Shared across the whole suite: booting Postgres and applying ~70 migrations
// takes seconds, and every scenario provisions its own tenants anyway.
var (
	acptDB     *testinfra.DB
	acptServer *httptest.Server
)

// world is the state of one scenario. Fresh per scenario, so nothing leaks from
// the previous one — the scenarios must be readable in any order.
type world struct {
	// tenants maps the email of a signed-up professional to their bearer token.
	tokens map[string]string
	// actor is whoever "inició sesión" most recently.
	actor string
	// lastPatientID is the patient created by the most recent registration step,
	// which is what "esa misma paciente" refers to.
	lastPatientID string
	// The rest of the trail one scenario leaves behind. A step says "esa cita"
	// or "la historia" and means the one the previous step produced — which is
	// the point of the end-to-end scenarios: the identifier has to survive the
	// hop from one bounded context to the next.
	lastAppointmentID string
	lastRecordID      string
	lastInvoiceID     string

	// userIDs caches what /auth/me reports per actor, so booking an appointment
	// does not re-ask on every step.
	userIDs map[string]string

	// scenarioTag disambiguates the email addresses written in the .feature.
	// One database serves every scenario, and an email is globally unique by
	// design (one person, one account), so two scenarios both signing up
	// "norte@ejemplo.co" would have the second correctly rejected. Rather than
	// clutter the specification with unique addresses, each scenario gets a
	// plus-address of the one it names. The organization names are left
	// colliding on purpose: two clinics called the same thing must both be able
	// to sign up, and that is a promise worth exercising on every run.
	scenarioTag string

	status int
	body   []byte
}

func TestAceptacion(t *testing.T) {
	if testing.Short() {
		t.Skip("acceptance test: requires Docker")
	}

	suite := godog.TestSuite{
		Name:                 "aceptacion",
		TestSuiteInitializer: initSuite,
		ScenarioInitializer:  initScenario,
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../features"},
			TestingT: t,
			Strict:   true, // an undefined or pending step fails the run
		},
	}
	if suite.Run() != 0 {
		t.Fatal("acceptance scenarios failed")
	}
}

func initSuite(ctx *godog.TestSuiteContext) {
	ctx.BeforeSuite(func() {
		db, err := testinfra.Start(context.Background())
		if err != nil {
			panic(fmt.Sprintf("acceptance: postgres: %v", err))
		}
		acptDB = db

		mr, err := miniredis.Run()
		if err != nil {
			panic(fmt.Sprintf("acceptance: redis: %v", err))
		}

		srv, err := buildTestServer(db.AppURL, mr.Addr())
		if err != nil {
			panic(fmt.Sprintf("acceptance: router: %v", err))
		}
		acptServer = srv
	})

	ctx.AfterSuite(func() {
		if acptServer != nil {
			acptServer.Close()
		}
		acptDB.Close()
	})
}

// buildTestServer assembles the production router with test infrastructure
// behind it. The dependencies that reach outside the process (Resend, WhatsApp,
// MercadoPago, Google Calendar) are left unconfigured, which is the same state
// they are in on a fresh install: the code paths degrade to no-ops rather than
// being stubbed out, so nothing here pretends an integration works.
func buildTestServer(databaseURL, redisAddr string) (*httptest.Server, error) {
	// 32 bytes as 64 hex chars, the same shape MASTER_KEY has in production.
	const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	km, err := crypto.NewKeyManager(testMasterKey)
	if err != nil {
		return nil, fmt.Errorf("key manager: %w", err)
	}
	// SEARCH_PEPPER has the same 64-hex-char shape, and a different value: the
	// two secrets are independent so either can rotate alone.
	if err := hash.Init("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"); err != nil {
		return nil, fmt.Errorf("search pepper: %w", err)
	}

	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		return nil, fmt.Errorf("app pool: %w", err)
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})

	cfg := config.Config{
		Environment:        "test",
		JWTSecret:          "acceptance-jwt-secret-not-a-real-one",
		JWTAccessTTLMin:    15,
		JWTRefreshTTLDays:  7,
		MasterKey:          testMasterKey,
		AppBaseURL:         "http://localhost:5173",
		CORSAllowedOrigins: []string{"*"},
		AudioDir:           os.TempDir(),
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	a := &app{cfg: cfg, pool: pool, rdb: rdb, km: km}
	a.wa = whatsapp.New(pool, km, logger)
	a.gcal = gcal.New(pool, km, "", "", cfg.AppBaseURL, []byte(cfg.JWTSecret), logger)

	return httptest.NewServer(a.buildRouter()), nil
}

func initScenario(ctx *godog.ScenarioContext) {
	w := &world{}

	ctx.Before(func(ctx context.Context, sc *godog.Scenario) (context.Context, error) {
		*w = world{
			tokens:      map[string]string{},
			userIDs:     map[string]string{},
			scenarioTag: scenarioTag(sc),
		}
		return ctx, nil
	})

	ctx.Given(`^un consultorio "([^"]*)" con la profesional "([^"]*)"$`, w.unConsultorio)
	ctx.Given(`^que "([^"]*)" inició sesión$`, w.iniciaSesion)
	ctx.When(`^"([^"]*)" inicia sesión$`, w.iniciaSesion)
	ctx.When(`^registra a la paciente "([^"]*)" "([^"]*)" con documento "([^"]*)"$`, w.registraPaciente)
	ctx.Then(`^la paciente queda registrada$`, w.laPacienteQuedaRegistrada)
	ctx.When(`^consulta la lista de pacientes$`, w.consultaListaPacientes)
	ctx.When(`^busca pacientes por "([^"]*)"$`, w.buscaPacientesPor)
	ctx.When(`^pide esa misma paciente por su identificador$`, w.pidePacientePorID)
	ctx.When(`^alguien consulta la lista de pacientes sin haber iniciado sesión$`, w.consultaSinSesion)
	ctx.Then(`^la lista no contiene a "([^"]*)"$`, w.laListaNoContiene)
	ctx.Then(`^la respuesta es (\d+)$`, w.laRespuestaEs)

	registerFlujoSteps(ctx, w)
}

// scenarioTag derives a short stable token from the scenario's own identity, so
// a rerun of the same scenario reuses the same addresses and a failure is
// reproducible in isolation.
func scenarioTag(sc *godog.Scenario) string {
	sum := sha256.Sum256([]byte(sc.Uri + sc.Name))
	return hex.EncodeToString(sum[:4])
}

// clientIP derives a stable per-scenario address from the scenario tag, inside
// TEST-NET-3 (203.0.113.0/24, reserved for documentation by RFC 5737) so it can
// never collide with anything real.
func (w *world) clientIP() string {
	b, err := hex.DecodeString(w.scenarioTag)
	if err != nil || len(b) == 0 {
		return "203.0.113.1"
	}
	// .0 and .255 are the network and broadcast addresses; keep out of both.
	// Two scenarios colliding on the same octet is harmless — they would share
	// a bucket that allows twenty requests a minute and neither makes five.
	return fmt.Sprintf("203.0.113.%d", int(b[0])%254+1)
}

// addr turns the address written in the .feature into the one actually used.
func (w *world) addr(email string) string {
	local, domain, ok := strings.Cut(email, "@")
	if !ok {
		return email
	}
	return local + "+" + w.scenarioTag + "@" + domain
}

// ── HTTP plumbing ─────────────────────────────────────────────────────────────

func (w *world) do(method, path string, body any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, acptServer.URL+path, rdr)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if tok := w.tokens[w.actor]; tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	// Arrive the way a request arrives in production: through Caddy, which
	// appends the client's address to X-Forwarded-For. ClientIPFromXFF takes
	// the rightmost entry, so this is not spoofing — the harness IS the proxy
	// here, exactly as in the middleware's own tests (PR #250).
	//
	// Without it every scenario looks like the same visitor and they share one
	// rate-limit bucket: the signup limiter (20/min per IP) started answering
	// 429 as soon as the suite grew past a handful of scenarios. Giving each
	// scenario its own address is both the fix and the more faithful model —
	// these are different clinics signing up, not one clinic signing up seven
	// times, and the limiter is left exactly as production has it.
	req.Header.Set("X-Forwarded-For", w.clientIP())

	resp, err := acptServer.Client().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	w.status = resp.StatusCode
	w.body, err = io.ReadAll(resp.Body)
	return err
}

// ── Steps ─────────────────────────────────────────────────────────────────────

// unConsultorio provisions a tenant through the real signup endpoint, so the
// organization, the owner user, their role and the trial are wired exactly as
// they are for a customer who signs up on the website.
//
// The one shortcut: the email is marked verified with a direct UPDATE instead of
// following the link. The raw verification token only ever exists inside the
// email body (Redis stores just its hash), so reproducing the click here would
// mean stubbing the mailer — and the click itself already has its own test. Any
// other setup step would have to hand-build the tenant, which is the failure
// mode where the fixture drifts from what production actually creates.
func (w *world) unConsultorio(nombre, logicalEmail string) error {
	email := w.addr(logicalEmail)
	if err := w.do(http.MethodPost, "/api/v1/auth/signup", map[string]any{
		"org_name":        nombre,
		"full_name":       "Profesional " + nombre,
		"email":           email,
		"password":        "una-contrasena-larga",
		"accepted_terms":  true,
		"terms_version":   "v1",
		"is_professional": true,
	}); err != nil {
		return err
	}
	if w.status != http.StatusCreated {
		return fmt.Errorf("crear el consultorio %q devolvió %d: %s", nombre, w.status, w.body)
	}

	if _, err := acptDB.Admin.Exec(context.Background(),
		`UPDATE users SET email_verified_at = NOW() WHERE email = $1`, email); err != nil {
		return fmt.Errorf("marcar el correo verificado: %w", err)
	}
	return nil
}

func (w *world) iniciaSesion(logicalEmail string) error {
	email := w.addr(logicalEmail)
	// Log in as nobody: a stale bearer token would make the login itself look
	// authenticated and hide a broken public route.
	w.actor = ""
	if err := w.do(http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email":    email,
		"password": "una-contrasena-larga",
	}); err != nil {
		return err
	}
	if w.status != http.StatusOK {
		return fmt.Errorf("el inicio de sesión de %q devolvió %d: %s", email, w.status, w.body)
	}

	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(w.body, &out); err != nil {
		return fmt.Errorf("leer la respuesta del login: %w", err)
	}
	if out.AccessToken == "" {
		return fmt.Errorf("el login de %q no devolvió access_token: %s", email, w.body)
	}

	w.tokens[email] = out.AccessToken
	w.actor = email
	return nil
}

func (w *world) registraPaciente(nombre, apellido, documento string) error {
	if err := w.do(http.MethodPost, "/api/v1/patients", map[string]any{
		"document_type_code": "CC",
		"first_name":         nombre,
		"paternal_last_name": apellido,
		"document_number":    documento,
		"birth_date":         "1990-05-14",
	}); err != nil {
		return err
	}

	var out struct {
		ID string `json:"id"`
	}
	// A failed registration is reported by the next step, not swallowed here:
	// some scenarios are about the registration being refused.
	_ = json.Unmarshal(w.body, &out)
	w.lastPatientID = out.ID
	return nil
}

func (w *world) laPacienteQuedaRegistrada() error {
	if w.status != http.StatusCreated {
		return fmt.Errorf("registrar la paciente devolvió %d: %s", w.status, w.body)
	}
	if w.lastPatientID == "" {
		return fmt.Errorf("la respuesta no trae el identificador de la paciente: %s", w.body)
	}
	return nil
}

func (w *world) consultaListaPacientes() error {
	return w.do(http.MethodGet, "/api/v1/patients", nil)
}

func (w *world) buscaPacientesPor(termino string) error {
	return w.do(http.MethodGet, "/api/v1/patients?q="+termino, nil)
}

func (w *world) pidePacientePorID() error {
	if w.lastPatientID == "" {
		return fmt.Errorf("ningún paciente fue registrado antes de este paso")
	}
	return w.do(http.MethodGet, "/api/v1/patients/"+w.lastPatientID, nil)
}

func (w *world) consultaSinSesion() error {
	w.actor = ""
	return w.do(http.MethodGet, "/api/v1/patients", nil)
}

// laListaNoContiene checks the rendered response, not the database: the promise
// is about what the other tenant can SEE, and the only thing they see is this
// body. Searching the raw JSON also catches a leak through any field — an error
// message, a related record — not just the name column.
func (w *world) laListaNoContiene(nombre string) error {
	if w.status != http.StatusOK {
		return fmt.Errorf("consultar la lista devolvió %d: %s", w.status, w.body)
	}
	if strings.Contains(string(w.body), nombre) {
		return fmt.Errorf("la respuesta menciona a %q, que pertenece a otro consultorio: %s", nombre, w.body)
	}
	return nil
}

func (w *world) laRespuestaEs(codigo int) error {
	if w.status != codigo {
		return fmt.Errorf("la respuesta fue %d y se esperaba %d: %s", w.status, codigo, w.body)
	}
	return nil
}
