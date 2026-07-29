package invoicing

import (
	"strings"
	"testing"
)

// The money tables in money_test.go say what a human thought to try.
// These say what must hold for anything at all — which is the useful half,
// because the string being validated here comes from an HTTP body and is
// interpolated into SQL as ::numeric.

// FuzzNormalizeAmountNeverEmitsUnsafeText is the guard that matters: whatever
// normalizeAmount returns is going into a NUMERIC cast. If a single input can
// get a stray character past it, that character reaches Postgres.
func FuzzNormalizeAmountNeverEmitsUnsafeText(f *testing.F) {
	for _, seed := range []string{
		"", "0", "0.00", "1", "50000.50", "99999999.99",
		"-1", "1e5", "NaN", "Infinity", "1,5", "$100", " 100 ",
		"100; DROP TABLE invoices", "1.2.3", "١٢٣", "999999999",
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, s string) {
		for _, allowZero := range []bool{true, false} {
			got, err := normalizeAmount(s, allowZero)
			if err != nil {
				if got != "" {
					t.Fatalf("normalizeAmount(%q, %v) rejected the input but still returned %q",
						s, allowZero, got)
				}
				continue
			}

			// Accepted. It must be a plain decimal the pattern itself accepts —
			// the function's own contract, applied to its output.
			if !amountPattern.MatchString(got) {
				t.Fatalf("normalizeAmount(%q, %v) = %q, which its own pattern rejects",
					s, allowZero, got)
			}
			// And it must convert cleanly, because every guard downstream calls
			// cents() on it and a silent 0 would wave an overpayment through.
			if _, ok := toCents(got); !ok {
				t.Fatalf("normalizeAmount(%q, %v) = %q, which toCents cannot parse",
					s, allowZero, got)
			}
			// Belt and braces: no character that could change the meaning of
			// the surrounding SQL or of the numeric literal itself.
			if strings.ContainsAny(got, "-+eE,$; '\"\t\n\r\\()") {
				t.Fatalf("normalizeAmount(%q, %v) = %q, which carries a character that "+
					"must never reach ::numeric", s, allowZero, got)
			}
			// When zero is not allowed, the result must be strictly positive.
			if !allowZero {
				if c, _ := toCents(got); c <= 0 {
					t.Fatalf("normalizeAmount(%q, false) = %q, which is %d cents", s, got, c)
				}
			}
		}
	})
}

// FuzzNormalizeAmountIsIdempotent: re-validating an already accepted amount
// must return it unchanged. Anything else means a value can drift as it passes
// through layers.
func FuzzNormalizeAmountIsIdempotent(f *testing.F) {
	for _, seed := range []string{"0", "1", "  250.75  ", "99999999.99", "0.01"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, s string) {
		once, err := normalizeAmount(s, true)
		if err != nil {
			return
		}
		twice, err := normalizeAmount(once, true)
		if err != nil {
			t.Fatalf("normalizeAmount accepted %q as %q but then rejected its own output: %v",
				s, once, err)
		}
		if once != twice {
			t.Fatalf("normalizeAmount is not idempotent: %q -> %q -> %q", s, once, twice)
		}
	})
}

// FuzzToCentsAndBackIsLossless closes the loop between the two directions used
// on opposite sides of the receipt. Whatever survives validation must survive
// the round trip through integer cents unchanged in value.
func FuzzToCentsAndBackIsLossless(f *testing.F) {
	for _, seed := range []string{"0", "1", "1.5", "1.05", "0.01", "50000", "99999999.99"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, s string) {
		norm, err := normalizeAmount(s, true)
		if err != nil {
			return
		}
		c, ok := toCents(norm)
		if !ok {
			t.Fatalf("toCents(%q) failed on a validated amount", norm)
		}
		if c < 0 {
			t.Fatalf("toCents(%q) = %d — a validated amount can never be negative", norm, c)
		}

		back := itoaCents(c)
		again, ok := toCents(back)
		if !ok {
			t.Fatalf("toCents(itoaCents(%d)) = %q failed to parse", c, back)
		}
		if again != c {
			t.Fatalf("%q -> %d -> %q -> %d: the round trip lost value", norm, c, back, again)
		}

		// isZeroAmount is a second, independent implementation of "is this
		// nothing". The two must never disagree, because separate guards are
		// built on each.
		if isZeroAmount(norm) != (c == 0) {
			t.Fatalf("isZeroAmount(%q) = %v but toCents = %d", norm, isZeroAmount(norm), c)
		}
	})
}

// FuzzFormatMoneyNeverPanics: the receipt is rendered from values read back out
// of the database, so formatMoney sees whatever is stored — including rows
// written before a validation rule existed. It must not panic, and it must
// never silently drop a digit.
func FuzzFormatMoneyNeverPanics(f *testing.F) {
	for _, seed := range []string{"", "0", "80000.00", "-1500.25", "1", "99999999.99", "abc", "1.2.3"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, amount string) {
		for _, currency := range []string{"COP", "USD", ""} {
			out := formatMoney(amount, currency)

			// Every digit of the integer part must appear in the output; the
			// grouping separators are added, never substituted for a digit.
			intPart, _, _ := strings.Cut(strings.TrimPrefix(amount, "-"), ".")
			var digits, inOut int
			for _, r := range intPart {
				if r >= '0' && r <= '9' {
					digits++
				}
			}
			for _, r := range out {
				if r >= '0' && r <= '9' {
					inOut++
				}
			}
			if digits > inOut {
				t.Fatalf("formatMoney(%q, %q) = %q dropped digits (%d in, %d out)",
					amount, currency, out, digits, inOut)
			}
			// A negative amount must stay visibly negative.
			if strings.HasPrefix(amount, "-") && !strings.HasPrefix(out, "-") {
				t.Fatalf("formatMoney(%q, %q) = %q lost the minus sign", amount, currency, out)
			}
		}
	})
}
