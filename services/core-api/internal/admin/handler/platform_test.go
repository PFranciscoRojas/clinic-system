package handler

import "testing"

// The operator set the plan to $1.000 in the console on 2026-08-18 and the
// console took it. Nothing said no until somebody with their card out pressed
// pay: MercadoPago answered "Cannot pay an amount lower than $ 1600.00", which
// left core-api with a 400 it could only report as a 502, and the customer with
// "no se pudo iniciar el pago" and no idea why.
//
// The console is where a wrong price is cheap to catch. The checkout is where
// it is most expensive.
func TestPlanAmountIsRefusedBeforeAnyoneTriesToPayIt(t *testing.T) {
	cases := []struct {
		name    string
		amount  int
		refused bool
	}{
		{"the real price", 180000, false},
		{"a small but chargeable test price", 2000, false},
		{"exactly the floor", 1600, false},
		{"the amount that broke production", 1000, true},
		{"one peso under the floor", 1599, true},
		// Zero and negatives never reach MercadoPago's floor rule at all; they
		// are their own kind of wrong and were equally unguarded.
		{"free", 0, true},
		{"negative", -5000, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := planAmountError(tc.amount)
			if tc.refused && got == "" {
				t.Fatalf("amount %d was accepted; MercadoPago will refuse it at checkout", tc.amount)
			}
			if !tc.refused && got != "" {
				t.Fatalf("amount %d was refused with %q", tc.amount, got)
			}
		})
	}
}

// A refusal that does not say the number leaves the operator guessing, which is
// the same place the 502 left them.
func TestTheRefusalNamesTheFloor(t *testing.T) {
	msg := planAmountError(1000)
	if msg == "" {
		t.Fatal("1000 was accepted")
	}
	if !contains(msg, "1600") {
		t.Fatalf("the message does not say what the floor is: %q", msg)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
