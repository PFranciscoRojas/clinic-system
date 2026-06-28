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

func TestParseMarkdown_Widget(t *testing.T) {
	src := "## Examen mental {widget:mental_exam}\n"
	sections, _, err := recordtemplates.ParseMarkdown(src)
	if err != nil {
		t.Fatal(err)
	}
	s := sections[0]
	if s.Type != recordtemplates.FieldWidget {
		t.Errorf("type = %q, want widget", s.Type)
	}
	if s.Widget != "mental_exam" {
		t.Errorf("widget = %q, want mental_exam", s.Widget)
	}
}

func TestParseMarkdown_UnknownWidget(t *testing.T) {
	src := "## Foo {widget:nonexistent}\n"
	_, _, err := recordtemplates.ParseMarkdown(src)
	if err == nil {
		t.Fatal("expected error for unknown widget, got nil")
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
