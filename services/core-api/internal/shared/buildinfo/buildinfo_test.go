package buildinfo

import "testing"

// The default matters: an operator who sees "dev" in the console is looking at a
// binary that never went through CI, and that is exactly the moment to be told
// rather than shown a plausible-looking hash.
func TestVersionDefaultsToDev(t *testing.T) {
	if Version == "" {
		t.Fatal("Version must never be empty — an empty version reads as 'no data' rather than 'not built by CI'")
	}
}

func TestShort(t *testing.T) {
	cases := []struct{ in, want string }{
		{"12d6fd0bfbab5c78eef9d4124b9bdf28a7a89939", "12d6fd0"},
		{"12d6fd0", "12d6fd0"},
		// Not a SHA, so there is nothing to shorten. Truncating it would turn a
		// meaningful word into a fragment that looks like a hash.
		{"dev", "dev"},
		{"", ""},
	}
	for _, c := range cases {
		if got := Short(c.in); got != c.want {
			t.Errorf("Short(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestColourFallsBackToUnknown(t *testing.T) {
	t.Setenv("CORE_API_COLOUR", "")
	if got := Colour(); got != "unknown" {
		t.Errorf("Colour() with no env = %q, want \"unknown\"", got)
	}
	t.Setenv("CORE_API_COLOUR", "green")
	if got := Colour(); got != "green" {
		t.Errorf("Colour() = %q, want \"green\"", got)
	}
}
