package invoicing

import (
	"strconv"
	"strings"
	"testing"
)

// CLAUDE.md rule 3: every financial calculation happens in PostgreSQL with
// NUMERIC, never a float. Go's job here is to validate the decimal string on
// the way in and to compare integer cents for the two guards that cannot wait
// for the database (discount+insurance > subtotal, and overpaying an invoice).
// These tests are about that boundary: what is accepted as money, and whether
// the cent arithmetic behind the guards is exact.

func TestNormalizeAmount(t *testing.T) {
	cases := []struct {
		name      string
		in        string
		allowZero bool
		want      string
		wantErr   bool
	}{
		{"plain integer", "50000", false, "50000", false},
		{"one decimal", "50000.5", false, "50000.5", false},
		{"two decimals", "50000.50", false, "50000.50", false},
		{"surrounding whitespace is trimmed", "  50000.50  ", false, "50000.50", false},
		{"one peso", "1", false, "1", false},
		{"one cent", "0.01", false, "0.01", false},
		{"eight integer digits, the maximum", "99999999.99", false, "99999999.99", false},

		{"empty defaults to zero when allowed", "", true, "0", false},
		{"empty is required when zero is not allowed", "", false, "", true},
		{"whitespace only is treated as empty", "   ", true, "0", false},
		{"explicit zero when allowed", "0", true, "0", false},
		{"zero with decimals when allowed", "0.00", true, "0.00", false},
		{"zero is rejected when not allowed", "0", false, "", true},
		{"0.00 is rejected when not allowed", "0.00", false, "", true},
		{"0.0 is rejected when not allowed", "0.0", false, "", true},

		// Everything below would reach `::numeric` as text if it slipped past.
		{"negative", "-100", true, "", true},
		{"three decimals", "100.001", true, "", true},
		{"nine integer digits", "100000000", true, "", true},
		{"trailing dot", "100.", true, "", true},
		{"leading dot", ".50", true, "", true},
		{"thousands separator", "50,000", true, "", true},
		{"currency symbol", "$50000", true, "", true},
		{"scientific notation", "5e4", true, "", true},
		{"letters", "cincuenta mil", true, "", true},
		{"plus sign", "+100", true, "", true},
		{"internal space", "50 000", true, "", true},
		{"two dots", "1.0.0", true, "", true},
		{"SQL fragment", "100; DROP TABLE invoices", true, "", true},
		{"NUMERIC special value", "NaN", true, "", true},
		{"infinity", "Infinity", true, "", true},
		{"unicode digits", "５００", true, "", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeAmount(tc.in, tc.allowZero)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("normalizeAmount(%q, %v) = %q, want an error", tc.in, tc.allowZero, got)
				}
				if got != "" {
					t.Errorf("a rejected amount still returned %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeAmount(%q, %v): %v", tc.in, tc.allowZero, err)
			}
			if got != tc.want {
				t.Errorf("normalizeAmount(%q, %v) = %q, want %q", tc.in, tc.allowZero, got, tc.want)
			}
		})
	}
}

// TestNormalizeAmountOutputIsAlwaysSafeForNumeric is the property that matters:
// whatever comes back is going into SQL as `::numeric`. It must always parse as
// a plain non-negative decimal, whatever was fed in.
func TestNormalizeAmountOutputIsAlwaysSafeForNumeric(t *testing.T) {
	inputs := []string{
		"", "   ", "0", "0.00", "1", "0.01", "99999999.99", "50000.5",
		"-1", "1e5", "NaN", "abc", "1.234", "1,5", "'; DROP TABLE--",
		"999999999", "\t42\n", "٣", "１２３",
	}
	for _, allowZero := range []bool{true, false} {
		for _, in := range inputs {
			got, err := normalizeAmount(in, allowZero)
			if err != nil {
				continue // rejected inputs are fine
			}
			if _, parseErr := strconv.ParseFloat(got, 64); parseErr != nil {
				t.Errorf("normalizeAmount(%q, %v) returned %q, which is not a decimal at all",
					in, allowZero, parseErr)
			}
			if strings.ContainsAny(got, "-+eE,$;' \t\n") {
				t.Errorf("normalizeAmount(%q, %v) = %q, which carries a character that "+
					"has no business reaching ::numeric", in, allowZero, got)
			}
		}
	}
}

func TestToCents(t *testing.T) {
	cases := []struct {
		in   string
		want int64
		ok   bool
	}{
		{"0", 0, true},
		{"0.00", 0, true},
		{"1", 100, true},
		{"1.00", 100, true},
		{"1.5", 150, true},  // one fraction digit is tenths, not hundredths
		{"1.05", 105, true}, // and a leading zero in the fraction is not dropped
		{"1.50", 150, true},
		{"0.01", 1, true},
		{"0.1", 10, true},
		{"50000", 5000000, true},
		{"99999999.99", 9999999999, true},

		// toCents also accepts a leading minus, even though amountPattern never
		// produces one. The subtraction in RecordPayment relies on signed cents.
		{"-1", -100, true},
		{"-0.01", -1, true},
		{"-0", 0, true},

		{"abc", 0, false},
		{"", 0, false},
		{"1.2.3", 0, false},
	}

	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, ok := toCents(tc.in)
			if ok != tc.ok {
				t.Fatalf("toCents(%q) ok = %v, want %v", tc.in, ok, tc.ok)
			}
			if got != tc.want {
				t.Errorf("toCents(%q) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

// TestToCentsIsExactForEveryCent walks every hundredth of a peso across a few
// whole values. This is the shape of bug a float would introduce — 0.1 + 0.2
// style drift — and the reason rule 3 exists at all.
func TestToCentsIsExactForEveryCent(t *testing.T) {
	for _, whole := range []int64{0, 1, 7, 99, 12345} {
		for frac := int64(0); frac < 100; frac++ {
			s := strconv.FormatInt(whole, 10) + "." + pad2(frac)
			want := whole*100 + frac
			got, ok := toCents(s)
			if !ok {
				t.Fatalf("toCents(%q) failed", s)
			}
			if got != want {
				t.Errorf("toCents(%q) = %d, want %d", s, got, want)
			}
		}
	}
}

func pad2(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) == 1 {
		return "0" + s
	}
	return s
}

// TestCentsRoundTripsThroughNormalizeAmount: the two functions are used
// together — normalizeAmount validates, cents compares — so the pairing must
// never silently turn an accepted amount into 0.
func TestCentsRoundTripsThroughNormalizeAmount(t *testing.T) {
	inputs := []string{"1", "0.01", "0.1", "1.5", "1.05", "50000", "99999999.99", "  250.75  "}
	for _, in := range inputs {
		norm, err := normalizeAmount(in, false)
		if err != nil {
			t.Fatalf("normalizeAmount(%q): %v", in, err)
		}
		if cents(norm) == 0 {
			t.Errorf("normalizeAmount accepted %q as %q but cents() reads it as zero", in, norm)
		}
	}
}

func TestIsZeroAmount(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"0", true},
		{"0.0", true},
		{"0.00", true},
		{"00", true},
		{"000.000", true},
		{"", true},

		{"1", false},
		{"0.01", false},
		{"0.1", false},
		{"10", false},
		{"0.10", false},
		{"100.00", false},
		{"0.09", false},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := isZeroAmount(tc.in); got != tc.want {
				t.Errorf("isZeroAmount(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// TestIsZeroAmountAgreesWithToCents: the two are separate implementations of
// "is this nothing". If they ever disagree, one of the guards built on them is
// wrong.
func TestIsZeroAmountAgreesWithToCents(t *testing.T) {
	inputs := []string{
		"0", "0.0", "0.00", "00", "000.000", "1", "0.01", "0.1",
		"10", "0.10", "100.00", "0.09", "99999999.99",
	}
	for _, in := range inputs {
		c, ok := toCents(in)
		if !ok {
			t.Fatalf("toCents(%q) failed", in)
		}
		if isZeroAmount(in) != (c == 0) {
			t.Errorf("isZeroAmount(%q) = %v but toCents = %d", in, isZeroAmount(in), c)
		}
	}
}

func TestNormalizeCurrency(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "COP"},
		{"   ", "COP"},
		{"cop", "COP"},
		{"CoP", "COP"},
		{"  usd  ", "USD"},
		{"EUR", "EUR"},
		// Length is checked by the caller, not here — normalizeCurrency only
		// upper-cases and trims, so a bad code passes through to be rejected.
		{"PESOS", "PESOS"},
		{"C", "C"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := normalizeCurrency(tc.in); got != tc.want {
				t.Errorf("normalizeCurrency(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
