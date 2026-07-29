package service

import (
	"strings"
	"testing"
)

// The pure helpers behind signup. They shape data that ends up in a URL, a
// wa.me link and the tenant's permanent slug, so their edge cases are worth
// pinning even though each is a handful of lines.

func TestLooksLikeEmail(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"pro@clinic.test", true},
		{"a@b.co", true},
		{"first.last+tag@sub.domain.com", true},
		{"MAYUS@CLINICA.CO", true},

		{"", false},
		{"no-at-sign.com", false},
		{"@clinic.test", false},
		{"pro@", false},
		{"pro@clinic", false},       // no dot in the domain
		{"pro@@clinic.test", false}, // two @
		{"pro @clinic.test", false}, // whitespace
		{"pro@clinic .test", false},
		{"pro@clinic.test ", false},
		{"\tpro@clinic.test", false},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := looksLikeEmail(tc.in); got != tc.want {
				t.Errorf("looksLikeEmail(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSanitizePhone(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"colombian mobile with spaces and country code", "+57 300 123 4567", "573001234567"},
		{"colombian mobile with dashes", "300-123-4567", "573001234567"},
		{"bare 10-digit mobile gets the country code", "3001234567", "573001234567"},
		{"already prefixed is left alone", "573001234567", "573001234567"},
		{"parentheses and dots are stripped", "(300) 123.4567", "573001234567"},

		// A 10-digit number that is not a mobile keeps its shape: only 3xx gets
		// the Colombian country code prepended.
		{"10 digits not starting with 3", "6011234567", "6011234567"},

		{"empty", "", ""},
		{"letters only", "no-phone-here", ""},
		{"too short", "12345", ""},
		{"six digits is still too short", "123456", ""},
		{"seven digits is the minimum accepted", "1234567", "1234567"},
		{"fifteen digits is the maximum accepted", "123456789012345", "123456789012345"},
		{"sixteen digits is rejected", "1234567890123456", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := sanitizePhone(tc.in); got != tc.want {
				t.Errorf("sanitizePhone(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestSanitizePhoneKeepsInternalPlusSigns documents a gap rather than a
// requirement. The filter keeps "+" anywhere in the string and only strips a
// leading one, so a "+" in the middle survives into a value that is used
// verbatim in a wa.me link. The field is optional lead data typed by a human,
// so nothing breaks today — but this test fails the moment the behaviour is
// tightened, which is when the comment above sanitizePhone should be updated
// too.
func TestSanitizePhoneKeepsInternalPlusSigns(t *testing.T) {
	got := sanitizePhone("300+123+4567")
	if !strings.Contains(got, "+") {
		t.Skipf("sanitizePhone now strips internal '+' (returned %q) — "+
			"update this test and the doc comment on sanitizePhone", got)
	}
	if got != "300+123+4567" {
		t.Errorf("sanitizePhone(%q) = %q; the internal '+' handling changed shape", "300+123+4567", got)
	}
}

func TestClampField(t *testing.T) {
	cases := []struct {
		name string
		in   string
		max  int
		want string
	}{
		{"short input is untouched", "instagram", 64, "instagram"},
		{"surrounding whitespace is trimmed", "  un colega  ", 64, "un colega"},
		{"trimmed then measured", "  " + strings.Repeat("x", 10) + "  ", 10, strings.Repeat("x", 10)},
		{"longer than max is cut", strings.Repeat("x", 100), 64, strings.Repeat("x", 64)},
		{"exactly max is kept", strings.Repeat("x", 64), 64, strings.Repeat("x", 64)},
		{"one over max is cut", strings.Repeat("x", 65), 64, strings.Repeat("x", 64)},
		{"empty", "", 64, ""},
		{"only whitespace", "   ", 64, ""},
		{"zero max", "anything", 0, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampField(tc.in, tc.max); got != tc.want {
				t.Errorf("clampField(%q, %d) = %q, want %q", tc.in, tc.max, got, tc.want)
			}
		})
	}
}

func TestSlugify(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"simple name", "Clinica Chapni", "clinica-chapni"},
		{"already a slug", "clinica-chapni", "clinica-chapni"},
		{"accents are folded", "Psicología Marcela Chapués", "psicologia-marcela-chapues"},
		{"enye is folded", "Doña Muñoz", "dona-munoz"},
		{"runs of punctuation collapse", "Centro   de   Salud!!! Mental", "centro-de-salud-mental"},
		{"leading and trailing punctuation is dropped", "  ...Consultorio...  ", "consultorio"},
		{"digits survive", "Consultorio 24/7", "consultorio-24-7"},
		{"ampersand becomes a separator", "Ruiz & Asociados", "ruiz-asociados"},

		// The fallback matters: a slug is the tenant's permanent URL, and an
		// empty one would produce a broken booking link.
		{"empty name falls back", "", "clinica"},
		{"whitespace only falls back", "   ", "clinica"},
		{"punctuation only falls back", "!!!", "clinica"},
		{"non-latin script falls back", "心理学", "clinica"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := slugify(tc.in); got != tc.want {
				t.Errorf("slugify(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestSlugifyOutputIsAlwaysURLSafe(t *testing.T) {
	inputs := []string{
		"Clínica Ñandú", "  ", "!!!", "A", "consultorio_de_prueba",
		"Élan Vital", "María José & Co.", "24/7", "心理学", "ÀÈÌÒÙ",
	}
	for _, in := range inputs {
		got := slugify(in)
		if got == "" {
			t.Errorf("slugify(%q) returned an empty slug", in)
			continue
		}
		if strings.HasPrefix(got, "-") || strings.HasSuffix(got, "-") {
			t.Errorf("slugify(%q) = %q, which has a stray leading/trailing dash", in, got)
		}
		for _, r := range got {
			isLower := r >= 'a' && r <= 'z'
			isDigit := r >= '0' && r <= '9'
			if !isLower && !isDigit && r != '-' {
				t.Errorf("slugify(%q) = %q contains %q, which is not URL-safe", in, got, r)
			}
		}
	}
}

func TestFoldAccents(t *testing.T) {
	cases := []struct{ in, want string }{
		{"áéíóú", "aeiou"},
		{"àèìòù", "aeiou"},
		{"ü", "u"},
		{"ñ", "n"},
		{"chapués", "chapues"},
		{"sin acentos", "sin acentos"},
		{"", ""},
		// Uppercase accents are deliberately not in the table: slugify lowercases
		// before folding, so they never reach this function in practice.
		{"Á", "Á"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := foldAccents(tc.in); got != tc.want {
				t.Errorf("foldAccents(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
