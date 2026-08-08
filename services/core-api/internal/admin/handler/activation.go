package handler

import (
	"log/slog"
	"net/http"
	"sort"
	"time"

	"sghcp/core-api/internal/shared/httputil"
)

// The activation funnel: where the clinics that sign themselves up stop.
//
// Chapni is sold without a salesperson — someone creates the account on the
// website, gets fourteen days and nobody walks them through it. Every step here
// is a fact already in the database, so measuring costs no tracking pixel, no
// extra table and nothing the tenant has to opt into.
//
// The counts are cumulative per step and NOT nested: an organization that
// registered a patient without ever completing onboarding counts in
// first_patient anyway. Forcing the steps into a strict funnel would hide
// exactly the interesting case — the people who skip the tour and go to work.

type activationStepDef struct {
	key   string
	label string
	// at extracts when the organization reached this step, or nil.
	at func(o orgActivation) *time.Time
}

// activationStepDefs is the order the funnel is read in, top to bottom.
var activationStepDefs = []activationStepDef{
	{"signup", "Creó la cuenta", func(o orgActivation) *time.Time { return &o.CreatedAt }},
	{"verified", "Verificó el correo", func(o orgActivation) *time.Time { return o.VerifiedAt }},
	{"onboarded", "Terminó la puesta en marcha", func(o orgActivation) *time.Time { return o.OnboardedAt }},
	{"first_patient", "Registró al primer paciente", func(o orgActivation) *time.Time { return o.FirstPatientAt }},
	{"first_appointment", "Agendó la primera cita", func(o orgActivation) *time.Time { return o.FirstAppointmentAt }},
	{"first_record", "Firmó la primera historia", func(o orgActivation) *time.Time { return o.FirstRecordAt }},
	{"first_ai_draft", "Usó el borrador con IA", func(o orgActivation) *time.Time { return o.FirstAIDraftAt }},
}

// paidStepKey is the last step and the only one without a timestamp: nothing
// records *when* a tenant started paying, only that it is paying now. Rather
// than invent a date, the step reports its count and leaves the median null.
const paidStepKey = "paid"

type orgActivation struct {
	OrgID              string     `json:"org_id"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	SubscriptionStatus string     `json:"subscription_status"`
	SignupSource       *string    `json:"signup_source"`
	CreatedAt          time.Time  `json:"created_at"`
	TrialEndsAt        *time.Time `json:"trial_ends_at"`
	CurrentPeriodEnd   *time.Time `json:"current_period_end"`
	VerifiedAt         *time.Time `json:"-"`
	OnboardedAt        *time.Time `json:"-"`
	FirstPatientAt     *time.Time `json:"-"`
	FirstAppointmentAt *time.Time `json:"-"`
	FirstRecordAt      *time.Time `json:"-"`
	FirstAIDraftAt     *time.Time `json:"-"`
	LastLoginAt        *time.Time `json:"last_login_at"`
	TotalPatients      int        `json:"total_patients"`
	TotalAppointments  int        `json:"total_appointments"`
	TotalRecords       int        `json:"total_records"`
	TotalAIDrafts      int        `json:"total_ai_drafts"`

	// Reached carries one entry per timestamped step, null when not reached, so
	// the console can render a row without knowing the step list.
	Reached map[string]*time.Time `json:"reached"`
	// Paid is the last step, tracked apart because it has no date.
	Paid bool `json:"paid"`
	// FurthestStep is the last step the organization reached.
	FurthestStep string `json:"furthest_step"`
}

type activationStep struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Orgs  int     `json:"orgs"`
	Pct   float64 `json:"pct"`
	// MedianHours is the median time from signup to this step, over the
	// organizations that reached it. Null for signup itself and for paid.
	MedianHours *float64 `json:"median_hours"`
}

type activationResponse struct {
	CohortTotal int              `json:"cohort_total"`
	Steps       []activationStep `json:"steps"`
	Orgs        []orgActivation  `json:"orgs"`
}

// GET /api/v1/admin/metrics/activation — SYSTEM_ADMIN.
//
// The cohort is every real tenant: internal fixtures and orgs flagged as tests
// are excluded, the same rule the rest of the console uses. Measuring the demo
// org would flatter every number in the funnel.
func (h *Handler) activationMetrics(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT org_id, name, slug, subscription_status, signup_source, created_at,
		       trial_ends_at, current_period_end, verified_at, onboarded_at,
		       first_patient_at, first_appointment_at, first_record_at,
		       first_ai_draft_at, last_login_at,
		       total_patients, total_appointments, total_records, total_ai_drafts
		FROM   platform_org_activation()
		WHERE  NOT is_internal AND NOT is_test
	`)
	if err != nil {
		slog.Error("admin.activation-metrics", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not read activation metrics")
		return
	}
	defer rows.Close()

	orgs := []orgActivation{}
	for rows.Next() {
		var o orgActivation
		if err := rows.Scan(&o.OrgID, &o.Name, &o.Slug, &o.SubscriptionStatus, &o.SignupSource,
			&o.CreatedAt, &o.TrialEndsAt, &o.CurrentPeriodEnd, &o.VerifiedAt, &o.OnboardedAt,
			&o.FirstPatientAt, &o.FirstAppointmentAt, &o.FirstRecordAt, &o.FirstAIDraftAt,
			&o.LastLoginAt, &o.TotalPatients, &o.TotalAppointments, &o.TotalRecords,
			&o.TotalAIDrafts); err != nil {
			slog.Error("admin.activation-metrics.scan", "err", err)
			httputil.WriteError(w, http.StatusInternalServerError, "scan error")
			return
		}
		o.Paid = o.SubscriptionStatus == "active"
		o.Reached = reachedSteps(o)
		o.FurthestStep = furthestStep(o)
		orgs = append(orgs, o)
	}
	if err := rows.Err(); err != nil {
		slog.Error("admin.activation-metrics.rows", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not read activation metrics")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, activationResponse{
		CohortTotal: len(orgs),
		Steps:       activationFunnel(orgs),
		Orgs:        orgs,
	})
}

// reachedSteps flattens the timestamped milestones into the map the console
// reads, one entry per step so a missing key is a bug and not "not reached".
func reachedSteps(o orgActivation) map[string]*time.Time {
	out := make(map[string]*time.Time, len(activationStepDefs))
	for _, s := range activationStepDefs {
		out[s.key] = s.at(o)
	}
	return out
}

// furthestStep is the last step in the funnel's order that the organization
// reached — what tells a stalled trial apart from one that is simply young.
func furthestStep(o orgActivation) string {
	if o.Paid {
		return paidStepKey
	}
	furthest := ""
	for _, s := range activationStepDefs {
		if s.at(o) != nil {
			furthest = s.key
		}
	}
	return furthest
}

// activationFunnel counts, per step, how many organizations of the cohort
// reached it, and how long the median one took from signing up.
func activationFunnel(orgs []orgActivation) []activationStep {
	out := make([]activationStep, 0, len(activationStepDefs)+1)

	for _, def := range activationStepDefs {
		var elapsed []float64
		count := 0
		for _, o := range orgs {
			at := def.at(o)
			if at == nil {
				continue
			}
			count++
			elapsed = append(elapsed, at.Sub(o.CreatedAt).Hours())
		}
		step := activationStep{
			Key:   def.key,
			Label: def.label,
			Orgs:  count,
			Pct:   pctOf(count, len(orgs)),
		}
		// Signup is its own origin, so its median is zero by construction and
		// says nothing; reporting it would be noise in the console.
		if def.key != "signup" {
			step.MedianHours = median(elapsed)
		}
		out = append(out, step)
	}

	paid := 0
	for _, o := range orgs {
		if o.Paid {
			paid++
		}
	}
	out = append(out, activationStep{
		Key:   paidStepKey,
		Label: "Activó el pago",
		Orgs:  paid,
		Pct:   pctOf(paid, len(orgs)),
	})
	return out
}

func pctOf(n, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(n) * 100 / float64(total)
}

// median returns nil for an empty sample rather than zero: "no organization got
// this far" and "every one got there instantly" must not render the same.
func median(xs []float64) *float64 {
	if len(xs) == 0 {
		return nil
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	mid := len(s) / 2
	m := s[mid]
	if len(s)%2 == 0 {
		m = (s[mid-1] + s[mid]) / 2
	}
	return &m
}
