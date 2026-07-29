package recordtemplates

import (
	"strings"
	"testing"
)

// ParseMarkdown turns what a professional typed into the schema their clinical
// records are stored against. It is the one parser in the system fed free text
// by a human, and a template that parses "successfully" into the wrong shape is
// worse than one that fails: the records written against it are wrong too, and
// nothing says so.

func FuzzParseMarkdownNeverPanics(f *testing.F) {
	for _, seed := range []string{
		"",
		"# Plantilla\n## Motivo de consulta\nQué trae al paciente",
		"## Ánimo {scale:0-10}",
		"## Riesgo {select:Bajo|Medio|Alto}",
		"## Síntomas {multiselect:Ansiedad|Insomnio|Apetito} {allow_other}",
		"## Notas {required} {collapsed}",
		"## Antecedentes {checklist}",
		"## Roto {scale:10-0}",
		"## Uno {select:Solo}",
		"## A ## B",
		"##  ",
		"## {required}",
		strings.Repeat("## Campo\n", 200),
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, src string) {
		sections, _, err := ParseMarkdown(src)

		if err != nil {
			if sections != nil {
				t.Fatalf("ParseMarkdown returned an error and %d sections; callers "+
					"that ignore the error would persist a half-parsed schema", len(sections))
			}
			return
		}

		if len(sections) == 0 {
			t.Fatal("ParseMarkdown succeeded with no sections — an empty schema stores nothing")
		}

		keys := make(map[string]struct{}, len(sections))
		for i, s := range sections {
			if s.Label == "" {
				t.Fatalf("section %d has an empty label", i)
			}
			if s.Key == "" {
				t.Fatalf("section %d (%q) has an empty key — it is a JSON field name", i, s.Label)
			}
			// Duplicate keys silently merge two fields into one when the record
			// is written, and the professional loses whichever came first.
			if _, dup := keys[s.Key]; dup {
				t.Fatalf("two sections share the key %q (label %q) — the record data "+
					"is keyed by this", s.Key, s.Label)
			}
			keys[s.Key] = struct{}{}

			switch s.Type {
			case FieldScale:
				if s.ScaleMin == nil || s.ScaleMax == nil {
					t.Fatalf("scale section %q has nil bounds", s.Label)
				}
				if *s.ScaleMin >= *s.ScaleMax {
					t.Fatalf("scale section %q has min %d >= max %d", s.Label, *s.ScaleMin, *s.ScaleMax)
				}
			case FieldSelect, FieldMultiselect:
				if len(s.Options) < 2 {
					t.Fatalf("%s section %q has %d options, want at least 2",
						s.Type, s.Label, len(s.Options))
				}
			}

			// The hint check is the reason this parser fails closed: a "##" left
			// inside a description means several fields were jammed onto one
			// line and silently absorbed.
			if strings.Contains(s.Hint, "##") {
				t.Fatalf("section %q kept a %q marker in its hint — those are fields "+
					"that were swallowed", s.Label, "##")
			}
		}
	})
}

// FuzzParseMarkdownIsDeterministic: the same template text must always produce
// the same schema. A template is parsed once on save and again on any re-import,
// and a drift between the two would orphan the records in between.
func FuzzParseMarkdownIsDeterministic(f *testing.F) {
	for _, seed := range []string{
		"## Uno\n## Dos",
		"# Nombre\n## Campo {required}",
		"## Escala {scale:1-5}",
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, src string) {
		first, nameA, errA := ParseMarkdown(src)
		second, nameB, errB := ParseMarkdown(src)

		if (errA == nil) != (errB == nil) {
			t.Fatalf("ParseMarkdown(%q) failed once and succeeded once", src)
		}
		if nameA != nameB {
			t.Fatalf("suggested name differs between runs: %q vs %q", nameA, nameB)
		}
		if len(first) != len(second) {
			t.Fatalf("section count differs between runs: %d vs %d", len(first), len(second))
		}
		for i := range first {
			if first[i].Key != second[i].Key || first[i].Type != second[i].Type {
				t.Fatalf("section %d differs between runs: %+v vs %+v", i, first[i], second[i])
			}
		}
	})
}

// FuzzSlugifyProducesAUsableKey: the key becomes a JSON field name in every
// stored clinical record, so it must always be non-empty and made only of
// characters that survive a round trip through JSON and SQL unquoted.
func FuzzSlugifyProducesAUsableKey(f *testing.F) {
	for _, seed := range []string{
		"Motivo de consulta", "Evolución", "ÁÉÍÓÚ", "李", "", "   ",
		"___", "a-b-c", "1234", "Riesgo (auto/hetero)",
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, label string) {
		key := slugify(label)

		if key == "" {
			t.Fatalf("slugify(%q) returned an empty key", label)
		}
		if strings.HasPrefix(key, "_") || strings.HasSuffix(key, "_") {
			t.Errorf("slugify(%q) = %q has a stray leading/trailing underscore", label, key)
		}
		for _, r := range key {
			ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_'
			if !ok {
				t.Fatalf("slugify(%q) = %q contains %q, which is not snake_case ASCII", label, key, r)
			}
		}
		// Idempotent: slugifying a key must not change it, or a re-import would
		// rename every field and orphan the stored data.
		if again := slugify(key); again != key {
			t.Fatalf("slugify is not idempotent: %q -> %q -> %q", label, key, again)
		}
	})
}
