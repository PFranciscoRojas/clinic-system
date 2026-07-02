package integration

import (
	"context"
	"errors"
	"strings"
	"testing"

	"sghcp/core-api/internal/invoicing"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/dbctx"
)

// scopedCtx returns a context whose queries run on the tenant-pinned
// connection, the way every request behind TenantScope does.
func scopedCtx(t *testing.T, orgID string) context.Context {
	t.Helper()
	return dbctx.WithQuerier(context.Background(), asOrg(t, orgID))
}

func newInvoicingService(t *testing.T) *invoicing.Service {
	t.Helper()
	km, err := crypto.NewKeyManager(strings.Repeat("cd", 32))
	if err != nil {
		t.Fatalf("key manager: %v", err)
	}
	return invoicing.NewService(invoicing.NewRepository(appPool), km)
}

// TestInvoicePaymentArithmetic proves money stays exact end-to-end: NUMERIC in
// Postgres, decimal strings in Go. The amounts are chosen to break float64
// (1333.43 × 3 = 4000.290000000000064… as doubles) — if any layer converted
// through floats, the balance and the PAID transition would misfire.
func TestInvoicePaymentArithmetic(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "money")
	ctx := scopedCtx(t, tn.OrgID)
	svc := newInvoicingService(t)

	inv, err := svc.CreateInvoice(ctx, tn.OrgID, tn.UserID, invoicing.InvoiceInput{
		PatientID: tn.PatientID,
		Subtotal:  "4000.40",
		Discount:  "0.10",
	})
	if err != nil {
		t.Fatalf("create invoice: %v", err)
	}
	if inv.TotalDue != "4000.30" {
		t.Fatalf("total_due = %q, want 4000.30 (subtotal - discount)", inv.TotalDue)
	}
	if inv.Status != "DRAFT" {
		t.Fatalf("status = %q, want DRAFT", inv.Status)
	}

	if _, err := svc.RecordPayment(ctx, tn.OrgID, tn.UserID, inv.ID,
		invoicing.PaymentInput{Amount: "1.00", PaymentMethod: "CASH"}); !errors.Is(err, invoicing.ErrNotPayable) {
		t.Fatalf("payment on DRAFT: got %v, want ErrNotPayable", err)
	}

	if _, err := svc.IssueInvoice(ctx, tn.OrgID, inv.ID, nil); err != nil {
		t.Fatalf("issue: %v", err)
	}

	// Three equal installments of 1333.43 leave exactly 0.01 due.
	var got invoicing.Invoice
	for i := 0; i < 3; i++ {
		got, err = svc.RecordPayment(ctx, tn.OrgID, tn.UserID, inv.ID,
			invoicing.PaymentInput{Amount: "1333.43", PaymentMethod: "NEQUI"})
		if err != nil {
			t.Fatalf("payment %d: %v", i+1, err)
		}
		if got.Status != "PARTIAL" {
			t.Fatalf("after payment %d: status = %q, want PARTIAL", i+1, got.Status)
		}
	}
	if got.TotalPaid != "4000.29" {
		t.Fatalf("total_paid = %q, want exactly 4000.29", got.TotalPaid)
	}

	// Overpaying the remaining cent must be rejected, not rounded away.
	if _, err := svc.RecordPayment(ctx, tn.OrgID, tn.UserID, inv.ID,
		invoicing.PaymentInput{Amount: "0.02", PaymentMethod: "CASH"}); !errors.Is(err, invoicing.ErrInvalidInput) {
		t.Fatalf("overpayment: got %v, want ErrInvalidInput", err)
	}

	got, err = svc.RecordPayment(ctx, tn.OrgID, tn.UserID, inv.ID,
		invoicing.PaymentInput{Amount: "0.01", PaymentMethod: "CASH"})
	if err != nil {
		t.Fatalf("final cent: %v", err)
	}
	if got.Status != "PAID" || got.TotalPaid != "4000.30" {
		t.Fatalf("after final cent: status=%q total_paid=%q, want PAID / 4000.30", got.Status, got.TotalPaid)
	}

	// The ledger agrees with the header: SUM(payments) == total_paid, in SQL.
	var sum string
	if err := adminPool.QueryRow(context.Background(),
		`SELECT SUM(amount)::text FROM payments WHERE invoice_id = $1`, inv.ID,
	).Scan(&sum); err != nil {
		t.Fatal(err)
	}
	if sum != "4000.30" {
		t.Fatalf("SUM(payments) = %q, want 4000.30", sum)
	}

	// Nothing further can be paid.
	if _, err := svc.RecordPayment(ctx, tn.OrgID, tn.UserID, inv.ID,
		invoicing.PaymentInput{Amount: "0.01", PaymentMethod: "CASH"}); !errors.Is(err, invoicing.ErrNotPayable) {
		t.Fatalf("payment on PAID: got %v, want ErrNotPayable", err)
	}
}

func TestInvoiceInputValidation(t *testing.T) {
	skipIfShort(t)

	tn := seedTenant(t, "money-val")
	ctx := scopedCtx(t, tn.OrgID)
	svc := newInvoicingService(t)

	cases := []struct {
		name string
		in   invoicing.InvoiceInput
	}{
		{"discount exceeds subtotal", invoicing.InvoiceInput{PatientID: tn.PatientID, Subtotal: "100.00", Discount: "100.01"}},
		{"zero subtotal", invoicing.InvoiceInput{PatientID: tn.PatientID, Subtotal: "0"}},
		{"negative subtotal", invoicing.InvoiceInput{PatientID: tn.PatientID, Subtotal: "-5.00"}},
		{"too many decimals", invoicing.InvoiceInput{PatientID: tn.PatientID, Subtotal: "10.001"}},
		{"missing patient", invoicing.InvoiceInput{Subtotal: "10.00"}},
	}
	for _, tc := range cases {
		if _, err := svc.CreateInvoice(ctx, tn.OrgID, tn.UserID, tc.in); !errors.Is(err, invoicing.ErrInvalidInput) {
			t.Errorf("%s: got %v, want ErrInvalidInput", tc.name, err)
		}
	}
}
