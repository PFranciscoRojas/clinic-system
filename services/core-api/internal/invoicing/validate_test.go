package invoicing

import (
	"context"
	"errors"
	"testing"
)

// Service.validate is the gate on billing_rates, and the discount guard in
// CreateInvoice is the gate on invoices. Neither touches the database on the
// rejection path, which is exactly what lets them be unit-tested here — and
// also what makes them the right place to stop bad money before it reaches
// NUMERIC.

func ptrTo(s string) *string { return &s }

func TestValidateRate(t *testing.T) {
	svc := &Service{} // validate touches neither the repository nor the key manager

	base := RateInput{Name: "Consulta individual", Amount: "80000"}

	t.Run("normalizes a valid rate", func(t *testing.T) {
		in := base
		in.Name = "  Consulta individual  "
		in.Description = "  50 minutos  "
		in.Amount = "  80000.00  "
		in.Currency = "  cop  "
		in.Modality = ptrTo("  virtual  ")
		in.StaffID = ptrTo("  staff-1  ")

		got, err := svc.validate(in)
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if got.Name != "Consulta individual" || got.Description != "50 minutos" {
			t.Errorf("text fields were not trimmed: %+v", got)
		}
		if got.Amount != "80000.00" {
			t.Errorf("Amount = %q, want it trimmed", got.Amount)
		}
		if got.Currency != "COP" {
			t.Errorf("Currency = %q, want COP", got.Currency)
		}
		if got.Modality == nil || *got.Modality != "VIRTUAL" {
			t.Errorf("Modality = %v, want VIRTUAL", got.Modality)
		}
		if got.StaffID == nil || *got.StaffID != "staff-1" {
			t.Errorf("StaffID = %v, want staff-1", got.StaffID)
		}
	})

	t.Run("an empty currency defaults to COP", func(t *testing.T) {
		in := base
		got, err := svc.validate(in)
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if got.Currency != "COP" {
			t.Errorf("Currency = %q, want COP", got.Currency)
		}
	})

	// A blank optional pointer must come back nil, not as a pointer to "": the
	// repository treats nil as "org-wide" and "" as a staff id that matches
	// nobody.
	t.Run("blank optional pointers become nil", func(t *testing.T) {
		in := base
		in.Modality = ptrTo("   ")
		in.StaffID = ptrTo("   ")

		got, err := svc.validate(in)
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if got.Modality != nil {
			t.Errorf("Modality = %v, want nil", *got.Modality)
		}
		if got.StaffID != nil {
			t.Errorf("StaffID = %q, want nil — an empty staff id matches no one", *got.StaffID)
		}
	})

	t.Run("every modality is accepted, case-insensitively", func(t *testing.T) {
		for _, m := range []string{"IN_PERSON", "in_person", "VIRTUAL", "virtual", "HYBRID", "Hybrid"} {
			in := base
			in.Modality = ptrTo(m)
			got, err := svc.validate(in)
			if err != nil {
				t.Errorf("modality %q was rejected: %v", m, err)
				continue
			}
			if got.Modality == nil {
				t.Errorf("modality %q came back nil", m)
			}
		}
	})

	t.Run("rejections", func(t *testing.T) {
		cases := []struct {
			name   string
			mutate func(*RateInput)
		}{
			{"empty name", func(in *RateInput) { in.Name = "" }},
			{"whitespace name", func(in *RateInput) { in.Name = "   " }},
			{"empty amount", func(in *RateInput) { in.Amount = "" }},
			{"zero amount", func(in *RateInput) { in.Amount = "0" }},
			{"zero with decimals", func(in *RateInput) { in.Amount = "0.00" }},
			{"negative amount", func(in *RateInput) { in.Amount = "-80000" }},
			{"three decimals", func(in *RateInput) { in.Amount = "80000.001" }},
			{"thousands separator", func(in *RateInput) { in.Amount = "80,000" }},
			{"nine integer digits", func(in *RateInput) { in.Amount = "100000000" }},
			{"currency too short", func(in *RateInput) { in.Currency = "CO" }},
			{"currency too long", func(in *RateInput) { in.Currency = "PESOS" }},
			{"unknown modality", func(in *RateInput) { in.Modality = ptrTo("TELEPATHIC") }},
			{"modality that is nearly right", func(in *RateInput) { in.Modality = ptrTo("IN-PERSON") }},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				in := base
				tc.mutate(&in)

				got, err := svc.validate(in)
				if err == nil {
					t.Fatalf("validate accepted %+v", in)
				}
				if !errors.Is(err, ErrInvalidInput) {
					t.Errorf("err = %v, want it to wrap ErrInvalidInput (the handler maps it to 400)", err)
				}
				if got.Name != "" || got.Amount != "" {
					t.Errorf("a rejected input still returned data: %+v", got)
				}
			})
		}
	})
}

// TestCreateInvoiceRejectsBadMoneyBeforeTouchingTheDatabase: every case below
// returns before the repository or the key manager is used, which is why a
// zero-valued Service is enough. If a future change moves the guard after the
// DEK is minted, this test panics on the nil key manager — a loud failure
// rather than a silent extra round trip on invalid input.
func TestCreateInvoiceRejectsBadMoneyBeforeTouchingTheDatabase(t *testing.T) {
	svc := &Service{}
	ctx := context.Background()

	valid := InvoiceInput{PatientID: "patient-1", Subtotal: "100000"}

	cases := []struct {
		name   string
		mutate func(*InvoiceInput)
	}{
		{"no patient", func(in *InvoiceInput) { in.PatientID = "" }},
		{"whitespace patient", func(in *InvoiceInput) { in.PatientID = "   " }},

		{"missing subtotal", func(in *InvoiceInput) { in.Subtotal = "" }},
		{"zero subtotal", func(in *InvoiceInput) { in.Subtotal = "0" }},
		{"negative subtotal", func(in *InvoiceInput) { in.Subtotal = "-100000" }},
		{"subtotal with three decimals", func(in *InvoiceInput) { in.Subtotal = "100000.001" }},

		{"negative discount", func(in *InvoiceInput) { in.Discount = "-1" }},
		{"malformed discount", func(in *InvoiceInput) { in.Discount = "diez mil" }},
		{"negative insurance", func(in *InvoiceInput) { in.InsuranceCovered = "-1" }},

		// The guard that stops an invoice from totalling a negative amount.
		{"discount alone exceeds the subtotal", func(in *InvoiceInput) { in.Discount = "100000.01" }},
		{"insurance alone exceeds the subtotal", func(in *InvoiceInput) { in.InsuranceCovered = "100000.01" }},
		{"discount plus insurance exceed the subtotal", func(in *InvoiceInput) {
			in.Discount = "60000"
			in.InsuranceCovered = "60000"
		}},
		{"they exceed it by a single cent", func(in *InvoiceInput) {
			in.Discount = "50000"
			in.InsuranceCovered = "50000.01"
		}},

		{"currency too short", func(in *InvoiceInput) { in.Currency = "CO" }},
		{"currency too long", func(in *InvoiceInput) { in.Currency = "PESOS" }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := valid
			tc.mutate(&in)

			_, err := svc.CreateInvoice(ctx, "org-1", "user-1", in)
			if err == nil {
				t.Fatalf("CreateInvoice accepted %+v", in)
			}
			if !errors.Is(err, ErrInvalidInput) {
				t.Errorf("err = %v, want it to wrap ErrInvalidInput", err)
			}
		})
	}
}

// TestCreateInvoiceAllowsExactlyZeroingOutTheSubtotal is the other side of the
// same boundary: a fully discounted or fully insured consultation is a real
// case (courtesy sessions, EPS coverage) and must not be rejected.
func TestCreateInvoiceAllowsTheSubtotalToBeFullyCovered(t *testing.T) {
	svc := &Service{}
	ctx := context.Background()

	cases := []struct {
		name      string
		discount  string
		insurance string
	}{
		{"fully discounted", "100000", "0"},
		{"fully insured", "0", "100000"},
		{"split exactly", "40000", "60000"},
		{"split to the cent", "50000.01", "49999.99"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := InvoiceInput{
				PatientID: "patient-1", Subtotal: "100000",
				Discount: tc.discount, InsuranceCovered: tc.insurance,
			}
			// A zero-valued Service cannot mint a DEK, so getting past validation
			// ends in a panic on the nil key manager. Either outcome is fine here
			// — the only failure is being turned away as invalid input.
			err := createInvoiceOutcome(svc, ctx, in)
			if errors.Is(err, ErrInvalidInput) {
				t.Errorf("a fully covered subtotal was rejected as invalid input: %v", err)
			}
		})
	}
}

// createInvoiceOutcome runs CreateInvoice and reports the error it returned, or
// nil if it panicked past validation on the zero-valued Service. It exists so
// the tests above can assert "this was not rejected as invalid input" without
// the assertion living inside a deferred recover, where a t.Errorf is easy to
// misread and easy to skip.
func createInvoiceOutcome(svc *Service, ctx context.Context, in InvoiceInput) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = nil // reached the DEK step, i.e. validation passed
		}
	}()
	_, err = svc.CreateInvoice(ctx, "org-1", "user-1", in)
	return err
}
