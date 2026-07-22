package recordtemplates_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sghcp/core-api/internal/recordtemplates"
)

// The four clinical formats in docs/formatos/reconstruidos/ were rebuilt from
// the originals in docs/formatos/ after the stored source_markdown lost its
// newlines and collapsed seven fields into one hint. This guards the rebuild:
// every format must parse, and no field may end up as free text while still
// carrying an annotation in its label or hint — that combination is exactly
// what the corruption looked like.
func TestReconstructedFormatsParseCleanly(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "docs", "formatos", "reconstruidos")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("reading %s: %v", dir, err)
	}

	found := 0
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".md" {
			continue
		}
		found++

		t.Run(e.Name(), func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
			if err != nil {
				t.Fatalf("reading format: %v", err)
			}

			sections, _, err := recordtemplates.ParseMarkdown(string(raw))
			if err != nil {
				t.Fatalf("format does not parse: %v", err)
			}
			if len(sections) == 0 {
				t.Fatal("format parsed to zero fields")
			}

			for _, s := range sections {
				if strings.ContainsAny(s.Label, "{}") {
					t.Errorf("field %q kept an annotation in its label", s.Label)
				}
				if strings.Contains(s.Hint, "{") || strings.Contains(s.Hint, "##") {
					t.Errorf("field %q kept markup in its hint: %q", s.Label, s.Hint)
				}
				switch s.Type {
				case recordtemplates.FieldSelect, recordtemplates.FieldMultiselect:
					if len(s.Options) < 2 {
						t.Errorf("field %q is %s with %d options", s.Label, s.Type, len(s.Options))
					}
				case recordtemplates.FieldWidget:
					t.Errorf("field %q uses a retired widget", s.Label)
				}
			}
		})
	}

	if found != 4 {
		t.Errorf("expected the 4 reconstructed formats, found %d", found)
	}
}
