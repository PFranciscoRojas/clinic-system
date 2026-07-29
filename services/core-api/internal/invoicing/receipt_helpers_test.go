package invoicing

import (
	"testing"
	"time"
)

// The receipt is the document the patient keeps and the accountant reads. A
// wrong figure here is wrong on paper, so the formatting and the balance
// arithmetic get the same treatment as the validation.

func TestFormatMoney(t *testing.T) {
	cases := []struct {
		name     string
		amount   string
		currency string
		want     string
	}{
		{"a round thousand", "80000.00", "COP", "$80.000 COP"},
		{"trailing zeros are dropped", "80000.50", "COP", "$80.000,5 COP"},
		{"cents are kept when they are not zero", "80000.05", "COP", "$80.000,05 COP"},
		{"no decimals at all", "80000", "COP", "$80.000 COP"},
		{"under a thousand", "500", "COP", "$500 COP"},
		{"exactly a thousand", "1000", "COP", "$1.000 COP"},
		{"three digits stay ungrouped", "999", "COP", "$999 COP"},
		{"four digits get one separator", "9999", "COP", "$9.999 COP"},
		{"millions", "12345678", "COP", "$12.345.678 COP"},
		{"zero", "0", "COP", "$0 COP"},
		{"zero with decimals", "0.00", "COP", "$0 COP"},
		{"one cent", "0.01", "COP", "$0,01 COP"},

		// Only COP gets the peso sign; anything else prints the code alone.
		{"another currency has no symbol", "1500.00", "USD", "1.500 USD"},
		{"euros", "1500", "EUR", "1.500 EUR"},

		// The balance can go negative when an invoice is overpaid or credited.
		{"negative", "-1500.00", "COP", "-$1.500 COP"},
		{"negative with cents", "-1500.25", "COP", "-$1.500,25 COP"},

		{"empty is treated as zero", "", "COP", "$0 COP"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := formatMoney(tc.amount, tc.currency); got != tc.want {
				t.Errorf("formatMoney(%q, %q) = %q, want %q", tc.amount, tc.currency, got, tc.want)
			}
		})
	}
}

// TestFormatMoneyGroupsEveryLength walks each digit count so an off-by-one in
// the grouping loop cannot hide between the sampled cases above.
func TestFormatMoneyGroupsEveryLength(t *testing.T) {
	cases := []struct{ in, want string }{
		{"1", "$1 COP"},
		{"12", "$12 COP"},
		{"123", "$123 COP"},
		{"1234", "$1.234 COP"},
		{"12345", "$12.345 COP"},
		{"123456", "$123.456 COP"},
		{"1234567", "$1.234.567 COP"},
		{"12345678", "$12.345.678 COP"},
	}
	for _, tc := range cases {
		if got := formatMoney(tc.in, "COP"); got != tc.want {
			t.Errorf("formatMoney(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestBalance(t *testing.T) {
	cases := []struct {
		name string
		due  string
		paid string
		want string
	}{
		{"nothing paid", "80000.00", "0", "80000.00"},
		{"paid in full", "80000.00", "80000.00", "0.00"},
		{"partially paid", "80000.00", "30000.00", "50000.00"},
		{"paid to the cent", "80000.00", "79999.99", "0.01"},
		{"one cent outstanding the other way", "80000.01", "80000.00", "0.01"},
		{"overpaid", "80000.00", "90000.00", "-10000.00"},
		{"overpaid by a cent", "80000.00", "80000.01", "-0.01"},
		{"both zero", "0", "0", "0.00"},
		{"cents only", "0.75", "0.25", "0.50"},
		{"a due with one decimal digit", "100.5", "0.5", "100.00"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := balance(Invoice{TotalDue: tc.due, TotalPaid: tc.paid})
			if got != tc.want {
				t.Errorf("balance(due=%q paid=%q) = %q, want %q", tc.due, tc.paid, got, tc.want)
			}
		})
	}
}

// TestBalanceIsExactAcrossCents is the float-drift guard on the receipt side:
// every cent of a payment against a fixed total must produce the exact
// remainder, with no rounding artefacts.
func TestBalanceIsExactAcrossCents(t *testing.T) {
	for c := int64(0); c <= 100; c++ {
		paid := itoaCents(c)
		got := balance(Invoice{TotalDue: "1.00", TotalPaid: paid})
		want := itoaCents(100 - c)
		if got != want {
			t.Errorf("balance(due=1.00 paid=%s) = %q, want %q", paid, got, want)
		}
	}
}

func TestItoaCents(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0.00"},
		{1, "0.01"},
		{9, "0.09"},
		{10, "0.10"},
		{99, "0.99"},
		{100, "1.00"},
		{101, "1.01"},
		{110, "1.10"},
		{5000000, "50000.00"},
		{9999999999, "99999999.99"},
	}
	for _, tc := range cases {
		t.Run(tc.want, func(t *testing.T) {
			if got := itoaCents(tc.in); got != tc.want {
				t.Errorf("itoaCents(%d) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestItoaCentsRoundTripsThroughToCents closes the loop: the two conversions
// are used on opposite sides of the receipt, so they have to agree exactly.
func TestItoaCentsRoundTripsThroughToCents(t *testing.T) {
	for _, c := range []int64{0, 1, 9, 10, 99, 100, 101, 12345, 5000000, 9999999999} {
		s := itoaCents(c)
		back, ok := toCents(s)
		if !ok {
			t.Fatalf("toCents(itoaCents(%d)) = %q failed to parse", c, s)
		}
		if back != c {
			t.Errorf("%d -> %q -> %d, want the original", c, s, back)
		}
	}
}

func TestItoa(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0"},
		{1, "1"},
		{9, "9"},
		{10, "10"},
		{1234567890, "1234567890"},
	}
	for _, tc := range cases {
		if got := itoa(tc.in); got != tc.want {
			t.Errorf("itoa(%d) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestStatusES(t *testing.T) {
	// A known status must be translated; an unknown one must fall through
	// unchanged rather than print an empty cell on the receipt.
	for _, s := range []string{"DRAFT", "ISSUED", "PARTIAL", "PAID", "CANCELLED"} {
		if got := statusES(s); got == "" {
			t.Errorf("statusES(%q) returned empty", s)
		}
	}
	for _, s := range []string{"UNKNOWN_STATUS", "", "issued"} {
		if got := statusES(s); got != s {
			t.Errorf("statusES(%q) = %q, want it echoed back unchanged", s, got)
		}
	}
}

func TestMethodES(t *testing.T) {
	known := []string{
		"CASH", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER", "NEQUI",
		"DAVIPLATA", "BREB", "PSE", "INSURANCE_EPS", "INSURANCE_PRIVATE", "OTHER",
	}
	for _, m := range known {
		if got := methodES(m); got == "" {
			t.Errorf("methodES(%q) returned empty", m)
		}
	}
	for _, m := range []string{"BITCOIN", "", "cash"} {
		if got := methodES(m); got != m {
			t.Errorf("methodES(%q) = %q, want it echoed back unchanged", m, got)
		}
	}
}

func TestOrDash(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Marcela", "Marcela"},
		{"", "—"},
		{"   ", "—"},
		{"\t\n", "—"},
		{" 0 ", " 0 "}, // a real value with padding is not blank
	}
	for _, tc := range cases {
		if got := orDash(tc.in); got != tc.want {
			t.Errorf("orDash(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestShortID(t *testing.T) {
	cases := []struct{ in, want string }{
		{"a1b2c3d4-e5f6-7890-abcd-ef1234567890", "A1B2C3D4"},
		{"abcdefgh", "ABCDEFGH"},
		{"abcdefg", "ABCDEFG"}, // shorter than 8 is used whole
		{"ab", "AB"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := shortID(tc.in); got != tc.want {
			t.Errorf("shortID(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestInvoiceRef(t *testing.T) {
	n := 42
	if got := invoiceRef(Invoice{InvoiceNumber: &n}); got != "F-000042" {
		t.Errorf("invoiceRef with number 42 = %q, want F-000042", got)
	}
	big := 1234567
	if got := invoiceRef(Invoice{InvoiceNumber: &big}); got != "F-1234567" {
		t.Errorf("invoiceRef with a 7-digit number = %q, want it not truncated", got)
	}
	// A draft has no consecutive number yet, so it falls back to the id.
	if got := invoiceRef(Invoice{ID: "a1b2c3d4-e5f6"}); got != "A1B2C3D4" {
		t.Errorf("invoiceRef without a number = %q, want the short id", got)
	}
}

func TestFmtDateOr(t *testing.T) {
	fallback := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	primary := time.Date(2026, 7, 28, 15, 30, 0, 0, time.UTC)

	if got := fmtDateOr(&primary, fallback); got != "2026-07-28" {
		t.Errorf("fmtDateOr with a primary = %q, want 2026-07-28", got)
	}
	if got := fmtDateOr(nil, fallback); got != "2026-07-01" {
		t.Errorf("fmtDateOr without a primary = %q, want the fallback 2026-07-01", got)
	}
}
