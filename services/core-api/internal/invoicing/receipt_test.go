package invoicing

import (
	"bytes"
	"testing"
	"time"
)

func TestRenderReceipt(t *testing.T) {
	issued := time.Date(2026, 6, 18, 10, 0, 0, 0, time.UTC)
	d := ReceiptData{
		Org:         OrgLetterhead{Name: "Consultorio Marcela Chapués", NIT: "900123456-7", Phone: "+57 300 000 0000", Email: "hola@marcelachapues.com"},
		PatientName: "Juan Pérez Gómez",
		PatientDoc:  "1234567890",
		GeneratedAt: issued,
		Invoice: Invoice{
			ID: "abcdef12-3456-7890-abcd-ef1234567890", Currency: "COP",
			Subtotal: "80000.00", Discount: "10000.00", InsuranceCovered: "0.00",
			TotalDue: "70000.00", TotalPaid: "70000.00", Status: "PAID",
			IssuedAt: &issued,
			Payments: []Payment{
				{ID: "p1", Amount: "30000.00", Currency: "COP", PaymentMethod: "NEQUI", Reference: "TX-001", PaidAt: issued},
				{ID: "p2", Amount: "40000.00", Currency: "COP", PaymentMethod: "CASH", PaidAt: issued},
			},
		},
	}
	var buf bytes.Buffer
	if err := RenderReceipt(&buf, d); err != nil {
		t.Fatalf("render: %v", err)
	}
	if got := buf.Bytes(); len(got) < 1000 || !bytes.HasPrefix(got, []byte("%PDF")) {
		t.Fatalf("unexpected output: %d bytes, prefix %q", len(got), got[:min(8, len(got))])
	}
}

func TestFormatMoney(t *testing.T) {
	cases := map[string]string{
		"80000.00": "$80.000 COP",
		"1234567":  "$1.234.567 COP",
		"70000.50": "$70.000,5 COP",
		"0":        "$0 COP",
	}
	for in, want := range cases {
		if got := formatMoney(in, "COP"); got != want {
			t.Errorf("formatMoney(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBalance(t *testing.T) {
	if got := balance(Invoice{TotalDue: "70000.00", TotalPaid: "30000.00"}); got != "40000.00" {
		t.Errorf("balance = %q, want 40000.00", got)
	}
}
