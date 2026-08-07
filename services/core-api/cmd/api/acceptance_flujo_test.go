package main

// Steps for consulta_completa.feature — the end-to-end business flow.
//
// Separate file from acceptance_test.go on purpose: that one owns the harness
// (the server, the world, the tenant plumbing) and stays readable as the number
// of features grows. This one owns nothing but steps, and reads top to bottom in
// the same order as the scenario it serves.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

// registerFlujoSteps is called from initScenario alongside the isolation steps.
func registerFlujoSteps(reg *godog.ScenarioContext, w *world) {
	reg.When(`^le agenda una cita presencial para mañana$`, w.agendaCita)
	reg.Then(`^la cita queda agendada$`, w.laCitaQuedaAgendada)
	reg.When(`^marca la cita como atendida$`, w.marcaCitaAtendida)
	reg.When(`^abre la historia clínica de la sesión$`, w.abreHistoria)
	reg.When(`^la firma$`, w.firmaHistoria)
	reg.Then(`^la historia queda firmada$`, w.laHistoriaQuedaFirmada)
	reg.When(`^la cierra$`, w.cierraHistoria)
	reg.When(`^intenta reescribir la historia$`, w.reescribeHistoria)
	reg.When(`^añade una adenda a la historia$`, w.anadeAdenda)
	reg.Then(`^la adenda queda registrada$`, w.laAdendaQuedaRegistrada)
	reg.When(`^emite una factura de "([^"]*)" por esa cita$`, w.emiteFactura)
	reg.Then(`^la factura queda pendiente de cobro por "([^"]*)"$`, w.laFacturaQuedaPendiente)
	reg.When(`^registra el pago completo$`, w.registraPagoCompleto)
	reg.Then(`^la factura queda pagada$`, w.laFacturaQuedaPagada)
}

// ── Agenda ────────────────────────────────────────────────────────────────────

// agendaCita books tomorrow rather than a fixed date so the scenario cannot
// start failing on a calendar boundary, and rather than "now" so it is never
// ambiguous whether the appointment is already in the past.
func (w *world) agendaCita() error {
	staffID, err := w.currentUserID()
	if err != nil {
		return err
	}
	if w.lastPatientID == "" {
		return fmt.Errorf("ninguna paciente fue registrada antes de agendar")
	}

	if err := w.do(http.MethodPost, "/api/v1/appointments", map[string]any{
		"patient_id":   w.lastPatientID,
		"staff_id":     staffID,
		"scheduled_at": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		"duration_min": 50,
		"modality":     "IN_PERSON",
	}); err != nil {
		return err
	}

	var out struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.body, &out)
	w.lastAppointmentID = out.ID
	return nil
}

func (w *world) laCitaQuedaAgendada() error {
	if w.status != http.StatusCreated {
		return fmt.Errorf("agendar la cita devolvió %d: %s", w.status, w.body)
	}
	if w.lastAppointmentID == "" {
		return fmt.Errorf("la respuesta no trae el identificador de la cita: %s", w.body)
	}
	return nil
}

func (w *world) marcaCitaAtendida() error {
	if w.lastAppointmentID == "" {
		return fmt.Errorf("ninguna cita fue agendada antes de marcarla")
	}
	if err := w.do(http.MethodPatch,
		"/api/v1/appointments/"+w.lastAppointmentID+"/status",
		map[string]any{"status": "COMPLETED"}); err != nil {
		return err
	}
	if w.status != http.StatusNoContent {
		return fmt.Errorf("marcar la cita como atendida devolvió %d: %s", w.status, w.body)
	}
	return nil
}

// ── Historia clínica ──────────────────────────────────────────────────────────

// sesionInicial is the intake payload. consultation_reason, current_problem and
// mental_exam are the three sections the INITIAL template requires; the mental
// exam carries all ten domains because that is what the form submits, and a
// scenario that sends less would be testing a shape no professional produces.
func sesionInicial() map[string]any {
	exam := map[string]any{}
	for _, domain := range []string{
		"appearance", "consciousness_orientation", "attention", "memory",
		"language", "thought", "affect", "perception", "judgment", "insight",
	} {
		exam[domain] = map[string]any{"status": "NORMAL"}
	}
	return map[string]any{
		"consultation_reason": "Consulta por episodios de ansiedad en el trabajo.",
		"current_problem":     "Comenzaron hace tres meses, con dificultad para dormir.",
		"mental_exam":         exam,
	}
}

func (w *world) abreHistoria() error {
	if w.lastPatientID == "" {
		return fmt.Errorf("ninguna paciente fue registrada antes de abrir la historia")
	}
	body := map[string]any{
		"record_type":  "INITIAL",
		"session_date": time.Now().UTC().Format("2006-01-02"),
		"sections":     sesionInicial(),
		"risk_level":   "NONE",
	}
	if w.lastAppointmentID != "" {
		body["appointment_id"] = w.lastAppointmentID
	}

	if err := w.do(http.MethodPost,
		"/api/v1/patients/"+w.lastPatientID+"/records", body); err != nil {
		return err
	}
	if w.status != http.StatusCreated {
		return fmt.Errorf("abrir la historia devolvió %d: %s", w.status, w.body)
	}

	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.body, &out); err != nil {
		return fmt.Errorf("leer la respuesta de la historia: %w", err)
	}
	w.lastRecordID = out.ID
	if w.lastRecordID == "" {
		return fmt.Errorf("la respuesta no trae el identificador de la historia: %s", w.body)
	}
	return nil
}

func (w *world) firmaHistoria() error {
	if w.lastRecordID == "" {
		return fmt.Errorf("ninguna historia fue abierta antes de firmarla")
	}
	return w.do(http.MethodPost,
		"/api/v1/clinical-records/"+w.lastRecordID+"/finalize", map[string]any{
			"sections":   sesionInicial(),
			"risk_level": "NONE",
		})
}

func (w *world) laHistoriaQuedaFirmada() error {
	if w.status != http.StatusNoContent {
		return fmt.Errorf("firmar la historia devolvió %d: %s", w.status, w.body)
	}
	return w.laAPIReportaLaHistoriaFirmada()
}

// laAPIReportaLaHistoriaFirmada is what makes "firmada" mean something. finalize
// answers 204 with no body, so asserting on the status code alone would pass
// against a handler that did nothing at all. The evidence is what the API says
// about the record afterwards — which is also what the professional sees on the
// screen, and the only thing they can act on.
//
// This assertion is the one that found the bug: it read `finalized: false` on a
// record the database had stamped, because the read path dropped the field.
func (w *world) laAPIReportaLaHistoriaFirmada() error {
	if err := w.do(http.MethodGet, "/api/v1/clinical-records/"+w.lastRecordID, nil); err != nil {
		return err
	}
	if w.status != http.StatusOK {
		return fmt.Errorf("releer la historia devolvió %d: %s", w.status, w.body)
	}
	var out struct {
		Finalized   bool    `json:"finalized"`
		FinalizedAt *string `json:"finalized_at"`
	}
	if err := json.Unmarshal(w.body, &out); err != nil {
		return fmt.Errorf("leer la historia: %w", err)
	}
	if !out.Finalized || out.FinalizedAt == nil {
		return fmt.Errorf("la API sigue reportando la historia como no firmada: %s", w.body)
	}
	return nil
}

// cierraHistoria approves the record. Signing and closing are two acts in this
// product: finalize writes the content and stamps the session, approve is the
// professional taking responsibility for it — and only then does it stop being
// editable.
func (w *world) cierraHistoria() error {
	if w.lastRecordID == "" {
		return fmt.Errorf("ninguna historia fue abierta antes de cerrarla")
	}
	if err := w.do(http.MethodPost,
		"/api/v1/clinical-records/"+w.lastRecordID+"/approve", nil); err != nil {
		return err
	}
	if w.status != http.StatusNoContent {
		return fmt.Errorf("cerrar la historia devolvió %d: %s", w.status, w.body)
	}
	return nil
}

// reescribeHistoria attempts the edit the scenario says must be refused. The
// payload is deliberately valid: a rejection caused by a malformed body would
// prove nothing about immutability.
func (w *world) reescribeHistoria() error {
	if w.lastRecordID == "" {
		return fmt.Errorf("ninguna historia fue abierta antes de reescribirla")
	}
	sections := sesionInicial()
	sections["consultation_reason"] = "Otra cosa completamente distinta."
	return w.do(http.MethodPatch, "/api/v1/clinical-records/"+w.lastRecordID,
		map[string]any{"sections": sections, "risk_level": "NONE"})
}

func (w *world) anadeAdenda() error {
	if w.lastRecordID == "" {
		return fmt.Errorf("ninguna historia fue abierta antes de la adenda")
	}
	return w.do(http.MethodPost, "/api/v1/clinical-records/"+w.lastRecordID+"/addenda",
		map[string]any{"content": "Se corrige la fecha de inicio: fueron cuatro meses, no tres."})
}

func (w *world) laAdendaQuedaRegistrada() error {
	if w.status != http.StatusCreated {
		return fmt.Errorf("añadir la adenda devolvió %d: %s", w.status, w.body)
	}
	if err := w.do(http.MethodGet, "/api/v1/clinical-records/"+w.lastRecordID+"/addenda", nil); err != nil {
		return err
	}
	if w.status != http.StatusOK {
		return fmt.Errorf("listar las adendas devolvió %d: %s", w.status, w.body)
	}
	var out struct {
		Addenda []struct {
			Content string `json:"content"`
		} `json:"items"`
	}
	if err := json.Unmarshal(w.body, &out); err != nil {
		return fmt.Errorf("leer las adendas: %w", err)
	}
	if len(out.Addenda) != 1 {
		return fmt.Errorf("se esperaba una adenda y hay %d: %s", len(out.Addenda), w.body)
	}
	// The addendum has to carry the correction. A row whose content did not
	// survive the round trip is the same as no addendum at all — and the
	// content is encrypted at rest, so this also exercises the decrypt path.
	if !strings.Contains(out.Addenda[0].Content, "cuatro meses") {
		return fmt.Errorf("la adenda no conserva el texto escrito: %s", w.body)
	}
	return nil
}

// ── Facturación ───────────────────────────────────────────────────────────────

// emiteFactura creates the invoice and issues it. "Emitir" is one act for the
// professional and two calls for the API — the draft exists so an amount can be
// corrected before the patient ever sees it — and the .feature speaks the
// professional's language.
//
// The amount travels as a string all the way down, never as a float: money is
// NUMERIC in Postgres (CLAUDE.md rule 3) and a JSON number would be a float64
// the moment Go decoded it.
func (w *world) emiteFactura(monto string) error {
	if w.lastPatientID == "" || w.lastAppointmentID == "" {
		return fmt.Errorf("hace falta una paciente y una cita antes de facturar")
	}

	if err := w.do(http.MethodPost, "/api/v1/invoices", map[string]any{
		"patient_id":     w.lastPatientID,
		"appointment_id": w.lastAppointmentID,
		"currency":       "COP",
		"subtotal":       monto,
		"due_at":         time.Now().Add(15 * 24 * time.Hour).UTC().Format(time.RFC3339),
	}); err != nil {
		return err
	}
	if w.status != http.StatusCreated {
		return fmt.Errorf("crear la factura devolvió %d: %s", w.status, w.body)
	}

	var inv struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.body, &inv); err != nil {
		return fmt.Errorf("leer la factura: %w", err)
	}
	w.lastInvoiceID = inv.ID

	return w.do(http.MethodPost, "/api/v1/invoices/"+w.lastInvoiceID+"/issue", nil)
}

// invoice re-reads the invoice so an assertion is always made against what the
// API reports, never against the response of the call that changed it.
func (w *world) invoice() (struct {
	Status   string `json:"status"`
	TotalDue string `json:"total_due"`
}, error) {
	var out struct {
		Status   string `json:"status"`
		TotalDue string `json:"total_due"`
	}
	if w.lastInvoiceID == "" {
		return out, fmt.Errorf("ninguna factura fue emitida")
	}
	if err := w.do(http.MethodGet, "/api/v1/invoices/"+w.lastInvoiceID, nil); err != nil {
		return out, err
	}
	if w.status != http.StatusOK {
		return out, fmt.Errorf("consultar la factura devolvió %d: %s", w.status, w.body)
	}
	if err := json.Unmarshal(w.body, &out); err != nil {
		return out, fmt.Errorf("leer la factura: %w", err)
	}
	return out, nil
}

func (w *world) laFacturaQuedaPendiente(monto string) error {
	inv, err := w.invoice()
	if err != nil {
		return err
	}
	if inv.Status != "ISSUED" {
		return fmt.Errorf("la factura está en %q y se esperaba ISSUED: %s", inv.Status, w.body)
	}
	if !sameAmount(inv.TotalDue, monto) {
		return fmt.Errorf("la factura es por %q y se esperaba %q", inv.TotalDue, monto)
	}
	return nil
}

func (w *world) registraPagoCompleto() error {
	inv, err := w.invoice()
	if err != nil {
		return err
	}
	return w.do(http.MethodPost, "/api/v1/invoices/"+w.lastInvoiceID+"/payments",
		map[string]any{
			"amount":         inv.TotalDue,
			"payment_method": "CASH",
			"paid_at":        time.Now().UTC().Format(time.RFC3339),
		})
}

func (w *world) laFacturaQuedaPagada() error {
	if w.status != http.StatusOK {
		return fmt.Errorf("registrar el pago devolvió %d: %s", w.status, w.body)
	}
	inv, err := w.invoice()
	if err != nil {
		return err
	}
	if inv.Status != "PAID" {
		return fmt.Errorf("la factura está en %q y se esperaba PAID: %s", inv.Status, w.body)
	}
	return nil
}

// sameAmount compares two NUMERIC-shaped strings without parsing them as
// floats. "150000" and "150000.00" are the same money; == would say otherwise,
// and strconv.ParseFloat would introduce exactly the arithmetic CLAUDE.md
// rule 3 forbids.
func sameAmount(a, b string) bool {
	return normalizeMoney(a) == normalizeMoney(b)
}

func normalizeMoney(s string) string {
	whole, frac, _ := cutMoney(s)
	for len(frac) > 0 && frac[len(frac)-1] == '0' {
		frac = frac[:len(frac)-1]
	}
	if frac == "" {
		return whole
	}
	return whole + "." + frac
}

func cutMoney(s string) (whole, frac string, hasFrac bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			return s[:i], s[i+1:], true
		}
	}
	return s, "", false
}

// currentUserID asks the API who the actor is, rather than reading the JWT or
// the database. Every other step goes through HTTP; this one doing the same
// keeps the suite honest about what a client can actually know.
func (w *world) currentUserID() (string, error) {
	if id := w.userIDs[w.actor]; id != "" {
		return id, nil
	}
	if err := w.do(http.MethodGet, "/api/v1/auth/me", nil); err != nil {
		return "", err
	}
	if w.status != http.StatusOK {
		return "", fmt.Errorf("consultar la identidad devolvió %d: %s", w.status, w.body)
	}
	var me struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal(w.body, &me); err != nil {
		return "", fmt.Errorf("leer la identidad: %w", err)
	}
	if me.UserID == "" {
		return "", fmt.Errorf("/auth/me no devolvió user_id: %s", w.body)
	}
	w.userIDs[w.actor] = me.UserID
	return me.UserID, nil
}
