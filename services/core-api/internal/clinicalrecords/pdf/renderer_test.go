package pdf

import (
	"strings"
	"testing"
)

func TestRenderWidgetValueSessionEvaluation(t *testing.T) {
	val := map[string]any{
		"axis":             []any{"emotional_processing"},
		"patient_feedback": "nn",
		"barriers":         []any{"omissions"},
	}
	got := renderWidgetValue("session_evaluation", val)

	if strings.Contains(got, "[") || strings.Contains(got, "]") {
		t.Fatalf("output still contains raw Go slice brackets: %q", got)
	}
	if !strings.Contains(got, "Procesamiento emocional") {
		t.Errorf("expected translated axis label, got: %q", got)
	}
	if !strings.Contains(got, "Olvidos u omisiones de datos") {
		t.Errorf("expected translated barrier label, got: %q", got)
	}
	if !strings.Contains(got, "Percepción del paciente: nn") {
		t.Errorf("expected patient_feedback line, got: %q", got)
	}
}

func TestRenderWidgetValueSPAHistoryFlat(t *testing.T) {
	val := map[string]any{
		"present": true,
		"alcohol": map[string]any{"present": true, "frequency": "fines de semana"},
		"tobacco": map[string]any{"present": false},
		"other":   map[string]any{"present": false},
	}
	got := renderWidgetValue("spa_history_flat", val)
	if !strings.Contains(got, "Alcohol (fines de semana)") {
		t.Errorf("expected alcohol line, got: %q", got)
	}
	if strings.Contains(got, "Tabaco") {
		t.Errorf("tobacco not present should not appear, got: %q", got)
	}
}

func TestRenderSectionsV2UsesAliasForClinicalFormulation(t *testing.T) {
	// clinical_formulation (integrated key) must route through the
	// formulation_5f case via integratedWidgetAlias, not fall through to the
	// generic %v fallback.
	val := map[string]any{
		"predisposition": map[string]any{"selected": []any{"family_mh"}, "notes": ""},
	}
	got := renderWidgetValue(integratedWidgetAlias["clinical_formulation"], val)
	if !strings.Contains(got, "Antecedentes familiares de SM") {
		t.Errorf("expected translated predisposition label, got: %q", got)
	}
}
