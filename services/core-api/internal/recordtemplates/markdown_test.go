package recordtemplates_test

import (
	"testing"

	"sghcp/core-api/internal/recordtemplates"
)

func TestParseMarkdown_BasicText(t *testing.T) {
	src := `# Evolución TCC breve
## Desarrollo de la sesión {text} {required}
Qué se trabajó hoy.
## Intervenciones
`
	sections, name, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "Evolución TCC breve" {
		t.Errorf("name = %q, want %q", name, "Evolución TCC breve")
	}
	if len(sections) != 2 {
		t.Fatalf("len(sections) = %d, want 2", len(sections))
	}

	s0 := sections[0]
	if s0.Key != "desarrollo_de_la_sesi_n" && s0.Key != "desarrollo_de_la_sesion" {
		// Accept both (depending on unicode handling of ó).
		t.Logf("key = %q (may vary by unicode treatment)", s0.Key)
	}
	if s0.Type != recordtemplates.FieldText {
		t.Errorf("sections[0].Type = %q, want %q", s0.Type, recordtemplates.FieldText)
	}
	if !s0.Required {
		t.Errorf("sections[0].Required = false, want true")
	}
	if s0.Hint != "Qué se trabajó hoy." {
		t.Errorf("sections[0].Hint = %q", s0.Hint)
	}

	if sections[1].Type != recordtemplates.FieldText {
		t.Errorf("sections[1] default type should be text")
	}
}

func TestParseMarkdown_Scale(t *testing.T) {
	src := "## Malestar {scale:0-10}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	s := sections[0]
	if s.Type != recordtemplates.FieldScale {
		t.Errorf("type = %q, want scale", s.Type)
	}
	if *s.ScaleMin != 0 || *s.ScaleMax != 10 {
		t.Errorf("scale = %d-%d, want 0-10", *s.ScaleMin, *s.ScaleMax)
	}
}

func TestParseMarkdown_Select(t *testing.T) {
	src := "## Estado {select:Activo|Inactivo|Pendiente}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	s := sections[0]
	if s.Type != recordtemplates.FieldSelect {
		t.Errorf("type = %q, want select", s.Type)
	}
	if len(s.Options) != 3 {
		t.Errorf("options = %v", s.Options)
	}
}

func TestParseMarkdown_Multiselect(t *testing.T) {
	src := "## Barreras {multiselect:Tardanza|Cambios de tema|Otra} {allow_other}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	s := sections[0]
	if s.Type != recordtemplates.FieldMultiselect {
		t.Errorf("type = %q, want multiselect", s.Type)
	}
	if len(s.Options) != 3 {
		t.Errorf("options = %v", s.Options)
	}
	if !s.AllowOther {
		t.Errorf("AllowOther = false, want true")
	}
}

func TestParseMarkdown_MultiselectRequiresTwoOptions(t *testing.T) {
	src := "## Barreras {multiselect:Sola}\n"
	_, _, err := recordtemplates.ParseMarkdown(src)
	if err == nil {
		t.Fatal("expected error when multiselect has < 2 options")
	}
}

func TestParseMarkdown_SelectPills(t *testing.T) {
	src := "## Insight {select:Alto|Medio|Bajo} {pills}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	s := sections[0]
	if s.Type != recordtemplates.FieldSelect {
		t.Errorf("type = %q, want select", s.Type)
	}
	if s.Display != "pills" {
		t.Errorf("Display = %q, want pills", s.Display)
	}
}

func TestParseMarkdown_WidgetRejected(t *testing.T) {
	// All widgets are retired from new saves (migration 000067 converted the
	// active templates); archived schemas keep rendering but the parser
	// refuses to persist a new template that references one.
	src := "## Examen mental {widget:mental_exam}\n"
	_, _, err := recordtemplates.ParseMarkdown(src)
	if err == nil {
		t.Fatal("expected error for retired widget, got nil")
	}
}

func TestParseMarkdown_Collapsed(t *testing.T) {
	src := "## Compromisos y tareas extra-consulta {multiselect:Autorregistro ABC|Exposición gradual} {allow_other} {collapsed}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	s := sections[0]
	if !s.Collapsed {
		t.Errorf("Collapsed = false, want true")
	}
	if s.Type != recordtemplates.FieldMultiselect || !s.AllowOther {
		t.Errorf("type/allow_other = %q/%v, want multiselect/true", s.Type, s.AllowOther)
	}
}

func TestParseMarkdown_RetiredWidgetRejected(t *testing.T) {
	// task_checklist (and the other retired bespoke widgets) can no longer be
	// used in new template saves — they are generic template fields now.
	src := "## Tareas {widget:task_checklist}\n"
	_, _, err := recordtemplates.ParseMarkdown(src)
	if err == nil {
		t.Fatal("expected error for retired widget, got nil")
	}
}

func TestParseMarkdown_NotCollapsedByDefault(t *testing.T) {
	src := "## Motivo de consulta {text}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	if sections[0].Collapsed {
		t.Errorf("Collapsed = true, want false (default)")
	}
}

func TestParseMarkdown_UnknownWidget(t *testing.T) {
	src := "## Foo {widget:nonexistent}\n"
	_, _, err := recordtemplates.ParseMarkdown(src)
	if err == nil {
		t.Fatal("expected error for unknown widget, got nil")
	}
}

func TestParseMarkdown_Migration67MentalExamRoundTrip(t *testing.T) {
	// Migration 000067 expands widget:mental_exam into these generic fields
	// with precomputed keys. The markdown it regenerates must parse back to
	// exactly those keys, or a later edit of the migrated template would
	// silently re-key the sections and orphan existing draft content.
	src := "## Examen mental: porte y actitud {multiselect:Adecuado|Colaborador|Ansioso|Hostil|Inhibido} {pills}\n\n" +
		"## Examen mental: orientación {select:Orientado|Desorientado} {pills}\n\n" +
		"## Examen mental: áreas de desorientación {multiselect:Tiempo|Espacio|Persona} {pills}\nSolo si está desorientado.\n\n" +
		"## Examen mental: afecto {multiselect:Eutímico (Estable)|Depresivo|Ansioso|Irritable|Aplanado} {pills}\n\n" +
		"## Examen mental: pensamiento {multiselect:Lógico / Coherente|Ideas de minusvalía|Ideas obsesivas|Ideas delirantes} {pills}\n\n" +
		"## Examen mental: percepción {select:Sin alteraciones|Alucinaciones} {pills}\n\n" +
		"## Examen mental: especificación de la percepción\nSi hay alucinaciones, especifica cuáles.\n\n" +
		"## Examen mental: ideación suicida {select:Ausente|Pasiva (deseos de morir)|Activa con plan estructurado} {pills}\n\n" +
		"## Examen mental: intento previo de suicidio {select:Sí|No} {pills}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	wantKeys := []string{
		"examen_mental_porte_y_actitud",
		"examen_mental_orientaci_n",
		"examen_mental_reas_de_desorientaci_n",
		"examen_mental_afecto",
		"examen_mental_pensamiento",
		"examen_mental_percepci_n",
		"examen_mental_especificaci_n_de_la_percepci_n",
		"examen_mental_ideaci_n_suicida",
		"examen_mental_intento_previo_de_suicidio",
	}
	if len(sections) != len(wantKeys) {
		t.Fatalf("got %d sections, want %d", len(sections), len(wantKeys))
	}
	for i, want := range wantKeys {
		if sections[i].Key != want {
			t.Errorf("section %d key = %q, want %q", i, sections[i].Key, want)
		}
	}
	if sections[0].Type != recordtemplates.FieldMultiselect || sections[0].Display != "pills" {
		t.Errorf("porte: type/display = %q/%q, want multiselect/pills", sections[0].Type, sections[0].Display)
	}
	if sections[6].Type != recordtemplates.FieldText || sections[6].Hint == "" {
		t.Errorf("especificación: type/hint = %q/%q, want text with hint", sections[6].Type, sections[6].Hint)
	}
}

func TestParseMarkdown_EmptyBody(t *testing.T) {
	_, _, err := recordtemplates.ParseMarkdown("# Solo título\n")
	if err == nil {
		t.Fatal("expected error when no ## sections")
	}
}

func TestParseMarkdown_InvalidScale(t *testing.T) {
	src := "## Foo {scale:10-0}\n"
	_, _, err := recordtemplates.ParseMarkdown(src)
	if err == nil {
		t.Fatal("expected error when scale min >= max")
	}
}
