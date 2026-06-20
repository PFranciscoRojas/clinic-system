package clinicalrecords

// Template v2 — psychology-native section formats per record type.
// Sections travel as a JSON object and are stored as one encrypted blob
// (sections_enc); only the keys listed here are accepted, so a future
// format change is a new template version, never a schema migration.

// RiskLevel maps the risk_level ENUM. Required on every v2 record:
// documented risk assessment is the practitioner's primary legal protection.
type RiskLevel string

const (
	RiskNone     RiskLevel = "NONE"
	RiskIdeation RiskLevel = "IDEATION"
	RiskPlan     RiskLevel = "PLAN"
	RiskAttempt  RiskLevel = "ATTEMPT"
)

// DischargeReason maps the discharge_reason ENUM (DISCHARGE records only).
type DischargeReason string

const (
	DischargeTherapeutic     DischargeReason = "THERAPEUTIC_DISCHARGE"
	DischargeDropout         DischargeReason = "DROPOUT"
	DischargeReferral        DischargeReason = "REFERRAL"
	DischargeMutualAgreement DischargeReason = "MUTUAL_AGREEMENT"
)

// MentalExamDomains are the ten checklist domains of the intake mental exam.
// The frontend pre-marks every domain as normal; the JSON value per domain is
// {"status": "NORMAL"|"ALTERED", "note": "..."}.
var MentalExamDomains = []string{
	"appearance", "consciousness_orientation", "attention", "memory",
	"language", "thought", "affect", "perception", "judgment", "insight",
}

// templateSections lists allowed (and which required) section keys per
// record type for template v2.
var templateSections = map[RecordType]struct {
	required []string
	optional []string
}{
	RecordTypeInitial: {
		required: []string{"consultation_reason", "current_problem", "mental_exam"},
		optional: []string{
			"personal_history", "family_history", "risk_note", "diagnostic_impression",
			// III. Historia de vida subsections
			"family_dynamics", "academic_history", "relational_history",
			// backward-compat keys
			"psychosocial_context", "initial_plan", "complaint_verbatim",
			// structured fields
			"distress_level", "spa_history", "family_mental_health", "clinical_formulation",
		},
	},
	RecordTypeEvolution: {
		required: []string{"session_development"},
		optional: []string{
			"interventions", "patient_response", "risk_note",
			"plan_tasks",
			// structured additions from Formato 3
			"distress_level", "task_adherence", "session_axis",
			"session_evaluation", "task_checklist",
			// Formato 2 fields (plan session — is_plan_session:true)
			"is_plan_session", "functional_analysis",
			"therapeutic_goal_1", "therapeutic_goal_2", "therapeutic_goal_3", "therapeutic_goal_4",
			"therapeutic_goals", "clinical_hypothesis", "achievement_indicators", "techniques",
		},
	},
	RecordTypeDischarge: {
		required: []string{"discharge_summary", "final_state"},
		optional: []string{
			"goals_achieved", "recommendations", "referral", "risk_note",
			// structured additions from Formato 4
			"functionality", "functionality_level", "referral_destination",
		},
	},
}

func validRiskLevel(r RiskLevel) bool {
	switch r {
	case RiskNone, RiskIdeation, RiskPlan, RiskAttempt:
		return true
	}
	return false
}

func validDischargeReason(d DischargeReason) bool {
	switch d {
	case DischargeTherapeutic, DischargeDropout, DischargeReferral, DischargeMutualAgreement:
		return true
	}
	return false
}

// ValidateTemplateV2 checks a v2 payload: known record type, only allowed
// section keys, all required sections present and non-empty, a valid risk
// level, and a valid discharge reason when (and only when) the record is a
// DISCHARGE. The section contents themselves stay free-form.
func ValidateTemplateV2(rt RecordType, sections map[string]any, risk RiskLevel, reason DischargeReason) error {
	tpl, ok := templateSections[rt]
	if !ok {
		return ErrInvalidInput // INTERCONSULTATION has no v2 template yet
	}
	if !validRiskLevel(risk) {
		return ErrRiskRequired
	}
	if rt == RecordTypeDischarge {
		if !validDischargeReason(reason) {
			return ErrInvalidInput
		}
	} else if reason != "" {
		return ErrInvalidInput
	}

	allowed := make(map[string]bool, len(tpl.required)+len(tpl.optional))
	for _, k := range tpl.required {
		allowed[k] = true
	}
	for _, k := range tpl.optional {
		allowed[k] = true
	}
	for k := range sections {
		if !allowed[k] {
			return ErrInvalidInput
		}
	}
	for _, k := range tpl.required {
		if isEmptySection(sections[k]) {
			return ErrMissingSection
		}
	}
	return nil
}

func isEmptySection(v any) bool {
	switch s := v.(type) {
	case nil:
		return true
	case string:
		return s == ""
	case map[string]any:
		return len(s) == 0
	case []any:
		return len(s) == 0
	}
	return false
}
