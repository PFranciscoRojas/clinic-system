package main

// Steps for activacion.feature — the operator's view of where new clinics stop.
//
// Everything here goes through the same HTTP surface the operator console uses,
// with a real SYSTEM_ADMIN bearer token, because the promise being tested is
// "the operator can see it", not "the numbers exist somewhere in the database".

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/cucumber/godog"
)

func registerActivacionSteps(reg *godog.ScenarioContext, w *world) {
	reg.Given(`^que existe el operador de la plataforma$`, w.existeElOperador)
	reg.When(`^el operador consulta el embudo de activación$`, w.elOperadorConsultaElEmbudo)
	reg.When(`^el operador consulta la consola de organizaciones$`, w.elOperadorConsultaLaConsola)
	reg.When(`^consulta el embudo de activación$`, w.consultaElEmbudo)
	reg.Then(`^"([^"]*)" aparece en el embudo$`, w.apareceEnElEmbudo)
	reg.Then(`^"([^"]*)" todavía no registró a su primer paciente$`, w.todaviaNoTienePrimerPaciente)
	reg.Then(`^"([^"]*)" ya registró a su primer paciente$`, w.yaTienePrimerPaciente)
	reg.Then(`^"([^"]*)" ya firmó su primera historia clínica$`, w.yaFirmoPrimeraHistoria)
	reg.Then(`^"([^"]*)" aparece con (\d+) paciente$`, w.apareceConPacientes)
	reg.When(`^el operador activa "([^"]*)" por (\d+) mes$`, w.elOperadorActiva)
	reg.Then(`^"([^"]*)" figura como activado a mano$`, w.figuraComoActivadoAMano)
	reg.Then(`^el embudo no reporta ningún pago cobrado$`, w.sinPagosCobrados)
}

// ── El operador ───────────────────────────────────────────────────────────────

// existeElOperador provisions the SaaS operator the way production has it: a
// real account, in an organization flagged internal so it never counts as one
// of the clinics being measured, carrying the SYSTEM_ADMIN role on top of the
// one signup gives it. Going through the signup endpoint rather than hand-
// building the rows keeps the fixture honest — the operator logs in with the
// same code path everyone else does.
func (w *world) existeElOperador() error {
	email := w.addr("operador@chapni.co")
	if err := w.do(http.MethodPost, "/api/v1/auth/signup", map[string]any{
		"org_name":        "Operación Chapni",
		"full_name":       "Operador de la plataforma",
		"email":           email,
		"password":        "una-contrasena-larga",
		"accepted_terms":  true,
		"terms_version":   "v1",
		"is_professional": false,
	}); err != nil {
		return err
	}
	if w.status != http.StatusCreated {
		return fmt.Errorf("crear la cuenta del operador devolvió %d: %s", w.status, w.body)
	}

	ctx := context.Background()
	if _, err := acptDB.Admin.Exec(ctx, `
		UPDATE organizations SET is_internal = true
		WHERE id = (SELECT organization_id FROM users WHERE email = $1)`, email); err != nil {
		return fmt.Errorf("marcar la organización del operador como interna: %w", err)
	}
	if _, err := acptDB.Admin.Exec(ctx, `
		INSERT INTO user_roles (organization_id, user_id, role_id)
		SELECT u.organization_id, u.id, r.id
		FROM users u, roles r
		WHERE u.email = $1 AND r.name = 'SYSTEM_ADMIN'
		ON CONFLICT DO NOTHING`, email); err != nil {
		return fmt.Errorf("dar el rol SYSTEM_ADMIN al operador: %w", err)
	}
	if _, err := acptDB.Admin.Exec(ctx,
		`UPDATE users SET email_verified_at = NOW() WHERE email = $1`, email); err != nil {
		return fmt.Errorf("marcar el correo del operador verificado: %w", err)
	}

	// The role is read from the token, so it has to be minted after the grant.
	previous := w.actor
	if err := w.iniciaSesion("operador@chapni.co"); err != nil {
		return err
	}
	w.operator = email
	w.actor = previous
	return nil
}

// ── Respuestas del embudo ─────────────────────────────────────────────────────

type acptActivacionOrg struct {
	Name          string                `json:"name"`
	Reached       map[string]*time.Time `json:"reached"`
	TotalPatients int                   `json:"total_patients"`
	Paid          bool                  `json:"paid"`
	PaidSource    string                `json:"paid_source"`
}

type acptActivacion struct {
	CohortTotal int `json:"cohort_total"`
	Steps       []struct {
		Key   string `json:"key"`
		Label string `json:"label"`
		Orgs  int    `json:"orgs"`
	} `json:"steps"`
	Orgs []acptActivacionOrg `json:"orgs"`
	Paid struct {
		Charged  int `json:"charged"`
		Checkout int `json:"checkout"`
		Manual   int `json:"manual"`
	} `json:"paid_breakdown"`
}

func (w *world) elOperadorConsultaElEmbudo() error {
	if w.operator == "" {
		return fmt.Errorf("el operador de la plataforma no existe en este escenario")
	}
	w.actor = w.operator
	return w.do(http.MethodGet, "/api/v1/admin/metrics/activation", nil)
}

// consultaElEmbudo is the same request made by whoever is logged in, which in
// the scenario that uses it is a clinical professional.
func (w *world) consultaElEmbudo() error {
	return w.do(http.MethodGet, "/api/v1/admin/metrics/activation", nil)
}

func (w *world) elOperadorConsultaLaConsola() error {
	if w.operator == "" {
		return fmt.Errorf("el operador de la plataforma no existe en este escenario")
	}
	w.actor = w.operator
	return w.do(http.MethodGet, "/api/v1/admin/orgs", nil)
}

func (w *world) embudo() (*acptActivacion, error) {
	if w.status != http.StatusOK {
		return nil, fmt.Errorf("consultar el embudo devolvió %d: %s", w.status, w.body)
	}
	var out acptActivacion
	if err := json.Unmarshal(w.body, &out); err != nil {
		return nil, fmt.Errorf("leer el embudo: %w (%s)", err, w.body)
	}
	return &out, nil
}

func (w *world) orgEnElEmbudo(nombre string) (*acptActivacionOrg, error) {
	f, err := w.embudo()
	if err != nil {
		return nil, err
	}
	for i := range f.Orgs {
		if f.Orgs[i].Name == nombre {
			return &f.Orgs[i], nil
		}
	}
	return nil, fmt.Errorf("%q no figura en el embudo (%d consultorios medidos)", nombre, len(f.Orgs))
}

func (w *world) apareceEnElEmbudo(nombre string) error {
	_, err := w.orgEnElEmbudo(nombre)
	return err
}

func (w *world) todaviaNoTienePrimerPaciente(nombre string) error {
	org, err := w.orgEnElEmbudo(nombre)
	if err != nil {
		return err
	}
	if org.Reached["first_patient"] != nil {
		return fmt.Errorf("%q figura con su primer paciente registrado el %s, y todavía no ha registrado a nadie",
			nombre, org.Reached["first_patient"])
	}
	return nil
}

func (w *world) yaTienePrimerPaciente(nombre string) error {
	org, err := w.orgEnElEmbudo(nombre)
	if err != nil {
		return err
	}
	if org.Reached["first_patient"] == nil {
		return fmt.Errorf("%q registró una paciente y el embudo sigue diciendo que no tiene ninguna", nombre)
	}
	return nil
}

func (w *world) yaFirmoPrimeraHistoria(nombre string) error {
	org, err := w.orgEnElEmbudo(nombre)
	if err != nil {
		return err
	}
	if org.Reached["first_record"] == nil {
		return fmt.Errorf("%q firmó una historia clínica y el embudo sigue diciendo que no ha firmado ninguna", nombre)
	}
	return nil
}

func (w *world) figuraComoActivadoAMano(nombre string) error {
	o, err := w.orgEnElEmbudo(nombre)
	if err != nil {
		return err
	}
	if !o.Paid {
		return fmt.Errorf("%q se activó y el embudo no lo cuenta como pagando", nombre)
	}
	if o.PaidSource != "manual" {
		return fmt.Errorf("el embudo dice que %q paga por %q, y lo activó el operador a mano", nombre, o.PaidSource)
	}
	return nil
}

func (w *world) sinPagosCobrados() error {
	f, err := w.embudo()
	if err != nil {
		return err
	}
	if f.Paid.Charged != 0 {
		return fmt.Errorf("el embudo reporta %d pagos cobrados y no se ha cobrado ninguno", f.Paid.Charged)
	}
	return nil
}

// ── Consola de organizaciones ─────────────────────────────────────────────────

// elOperadorActiva does what the operator does for a clinic that pays out of
// band (cash, Nequi, transfer): looks it up in the console and switches it on.
func (w *world) elOperadorActiva(nombre string, meses int) error {
	if err := w.elOperadorConsultaLaConsola(); err != nil {
		return err
	}
	if w.status != http.StatusOK {
		return fmt.Errorf("consultar la consola devolvió %d: %s", w.status, w.body)
	}
	var orgs []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(w.body, &orgs); err != nil {
		return fmt.Errorf("leer la consola: %w (%s)", err, w.body)
	}
	for _, o := range orgs {
		if o.Name != nombre {
			continue
		}
		if err := w.do(http.MethodPost, "/api/v1/admin/orgs/"+o.ID+"/activate",
			map[string]any{"months": meses}); err != nil {
			return err
		}
		if w.status != http.StatusOK {
			return fmt.Errorf("activar %q devolvió %d: %s", nombre, w.status, w.body)
		}
		return nil
	}
	return fmt.Errorf("%q no aparece en la consola de organizaciones", nombre)
}

func (w *world) apareceConPacientes(nombre string, esperados int) error {
	if w.status != http.StatusOK {
		return fmt.Errorf("consultar la consola devolvió %d: %s", w.status, w.body)
	}
	var orgs []struct {
		Name          string `json:"name"`
		TotalPatients int    `json:"total_patients"`
	}
	if err := json.Unmarshal(w.body, &orgs); err != nil {
		return fmt.Errorf("leer la consola: %w (%s)", err, w.body)
	}
	for _, o := range orgs {
		if o.Name != nombre {
			continue
		}
		if o.TotalPatients != esperados {
			return fmt.Errorf("la consola muestra %q con %d pacientes y tiene %d",
				nombre, o.TotalPatients, esperados)
		}
		return nil
	}
	return fmt.Errorf("%q no aparece en la consola de organizaciones", nombre)
}
