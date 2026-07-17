package service

import (
	"testing"

	"sghcp/core-api/internal/aidrafts"
)

func detailByKey(fb aidrafts.DraftFeedback) map[string]aidrafts.FieldFeedback {
	m := make(map[string]aidrafts.FieldFeedback, len(fb.FieldDetail))
	for _, d := range fb.FieldDetail {
		m[d.Key] = d
	}
	return m
}

func TestComputeFeedbackClassification(t *testing.T) {
	draft := map[string]any{
		"subjective": "El paciente refiere tristeza persistente desde hace dos semanas.",
		"objective":  "Se observa afecto plano y discurso lento durante la sesión.",
		"assessment": "Sintomatología compatible con episodio depresivo moderado.",
		"plan":       "Continuar terapia cognitivo conductual semanal.",
		"deleted":    "Sección que el profesional borra.",
		"empty":      "",
	}
	final := map[string]any{
		// unchanged
		"subjective": "El paciente refiere tristeza persistente desde hace dos semanas.",
		// minor tweak (small word change)
		"objective": "Se observa afecto plano y discurso algo lento durante la sesión.",
		// full rewrite
		"assessment": "Impresión diagnóstica pendiente de confirmar en próximas sesiones con pruebas estandarizadas.",
		// unchanged
		"plan": "Continuar terapia cognitivo conductual semanal.",
		// added by the professional
		"risk_note": "Sin ideación suicida activa.",
	}

	fb := ComputeFeedback(draft, final)

	if fb.FieldsTotal != 6 {
		t.Fatalf("FieldsTotal = %d, want 6", fb.FieldsTotal)
	}
	want := map[string]string{
		"subjective": aidrafts.ChangeUnchanged,
		"objective":  aidrafts.ChangeMinor,
		"assessment": aidrafts.ChangeRewritten,
		"plan":       aidrafts.ChangeUnchanged,
		"deleted":    aidrafts.ChangeRemoved,
		"risk_note":  aidrafts.ChangeAdded,
	}
	got := detailByKey(fb)
	for k, change := range want {
		d, ok := got[k]
		if !ok {
			t.Fatalf("missing detail for %q", k)
		}
		if d.Change != change {
			t.Errorf("%q: change = %s (similarity %.2f), want %s", k, d.Change, d.Similarity, change)
		}
	}
	if _, ok := got["empty"]; ok {
		t.Errorf("empty draft section must be ignored, got %+v", got["empty"])
	}
	if fb.FieldsUnchanged != 2 || fb.FieldsMinor != 1 || fb.FieldsRewritten != 1 || fb.FieldsAdded != 1 || fb.FieldsRemoved != 1 {
		t.Errorf("counts = %+v", fb)
	}
}

func TestComputeFeedbackApproveAsIs(t *testing.T) {
	sections := map[string]any{
		"subjective": "Texto de la sesión.",
		"scale":      7,
		"tags":       []any{"ansiedad", "sueño"},
	}
	fb := ComputeFeedback(sections, sections)
	if fb.FieldsUnchanged != fb.FieldsTotal || fb.FieldsTotal != 3 {
		t.Fatalf("approve-as-is should be all unchanged, got %+v", fb)
	}
}

func TestComputeFeedbackHeterogeneousValues(t *testing.T) {
	draft := map[string]any{
		"tags":  []any{"ansiedad", "sueño"},
		"scale": float64(7),
		"grid":  map[string]any{"b": 1, "a": 2},
	}
	final := map[string]any{
		"tags":  []any{"ansiedad", "sueño", "apetito"},
		"scale": float64(7),
		// same object, different key order — must normalize equal
		"grid": map[string]any{"a": 2, "b": 1},
	}
	fb := ComputeFeedback(draft, final)
	got := detailByKey(fb)
	if got["scale"].Change != aidrafts.ChangeUnchanged {
		t.Errorf("scale: %s, want unchanged", got["scale"].Change)
	}
	if got["grid"].Change != aidrafts.ChangeUnchanged {
		t.Errorf("grid: %s, want unchanged (key order must not matter)", got["grid"].Change)
	}
	if got["tags"].Change == aidrafts.ChangeUnchanged {
		t.Errorf("tags: extended array must count as edited")
	}
}

func TestComputeFeedbackEmptyMaps(t *testing.T) {
	fb := ComputeFeedback(nil, nil)
	if fb.FieldsTotal != 0 || len(fb.FieldDetail) != 0 {
		t.Fatalf("nil maps should yield zero metrics, got %+v", fb)
	}
}

func TestSimilarityBounds(t *testing.T) {
	if s := similarity("abc", "abc"); s != 1 {
		t.Errorf("identical: %f", s)
	}
	if s := similarity("abc", "xyz"); s != 0 {
		t.Errorf("disjoint same-length: %f", s)
	}
	if s := similarity("", "abc"); s != 0 {
		t.Errorf("empty vs text: %f", s)
	}
}
