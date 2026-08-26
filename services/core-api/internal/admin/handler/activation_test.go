package handler

import (
	"testing"
	"time"
)

func at(base time.Time, hours float64) *time.Time {
	t := base.Add(time.Duration(hours * float64(time.Hour)))
	return &t
}

// org builds a tenant that signed up at base and reached the milestones given
// in hours since signup; a nil entry means "never got there".
func org(base time.Time, verified, onboarded, patient, appointment, record, draft *time.Time) orgActivation {
	return orgActivation{
		CreatedAt:          base,
		VerifiedAt:         verified,
		OnboardedAt:        onboarded,
		FirstPatientAt:     patient,
		FirstAppointmentAt: appointment,
		FirstRecordAt:      record,
		FirstAIDraftAt:     draft,
	}
}

func TestFurthestStep(t *testing.T) {
	base := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)

	cases := []struct {
		name string
		o    orgActivation
		want string
	}{
		{
			"signed up and did nothing else",
			org(base, nil, nil, nil, nil, nil, nil),
			"signup",
		},
		{
			"verified the email and stopped",
			org(base, at(base, 1), nil, nil, nil, nil, nil),
			"verified",
		},
		{
			// The point of not nesting the steps: someone who skipped the tour
			// and registered a patient is further along than someone who only
			// finished onboarding, and the funnel has to say so.
			"skipped onboarding and registered a patient",
			org(base, at(base, 1), nil, at(base, 4), nil, nil, nil),
			"first_patient",
		},
		{
			"signed the first record",
			org(base, at(base, 1), at(base, 2), at(base, 4), at(base, 5), at(base, 30), nil),
			"first_record",
		},
		{
			"used the AI draft",
			org(base, at(base, 1), at(base, 2), at(base, 4), at(base, 5), at(base, 30), at(base, 29)),
			"first_ai_draft",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := furthestStep(tc.o); got != tc.want {
				t.Errorf("furthestStep = %q, want %q", got, tc.want)
			}
		})
	}
}

// Paying is the end of the funnel whatever else the tenant did or skipped: a
// clinic that pays without ever having touched the AI is converted, and the
// console must not file it under "stalled at the first patient".
func TestFurthestStepPaidWins(t *testing.T) {
	base := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)
	o := org(base, at(base, 1), nil, at(base, 4), nil, nil, nil)
	o.Paid = true
	if got := furthestStep(o); got != paidStepKey {
		t.Errorf("furthestStep = %q, want %q", got, paidStepKey)
	}
}

func TestActivationFunnelCountsAndMedians(t *testing.T) {
	base := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)

	a := org(base, at(base, 1), at(base, 2), at(base, 3), nil, nil, nil)
	b := org(base, at(base, 3), nil, at(base, 9), nil, nil, nil)
	c := org(base, nil, nil, nil, nil, nil, nil)
	c.SubscriptionStatus = "active"
	c.Paid = true

	steps := activationFunnel([]orgActivation{a, b, c})

	byKey := map[string]activationStep{}
	for _, s := range steps {
		byKey[s.Key] = s
	}

	if got := byKey["signup"].Orgs; got != 3 {
		t.Errorf("signup counted %d organizations, want 3", got)
	}
	if got := byKey["signup"].Pct; got != 100 {
		t.Errorf("signup pct = %v, want 100", got)
	}
	// Signup is its own origin: reporting a median of zero hours would be noise.
	if byKey["signup"].MedianHours != nil {
		t.Errorf("signup reported a median (%v); it has no elapsed time to report", *byKey["signup"].MedianHours)
	}

	if got := byKey["verified"].Orgs; got != 2 {
		t.Errorf("verified counted %d organizations, want 2", got)
	}
	if got := byKey["verified"].MedianHours; got == nil || *got != 2 {
		t.Errorf("verified median = %v, want 2 hours (the mean of 1 and 3)", got)
	}

	// Not nested: b never completed onboarding and still counts here.
	if got := byKey["first_patient"].Orgs; got != 2 {
		t.Errorf("first_patient counted %d organizations, want 2", got)
	}
	if got := byKey["first_patient"].MedianHours; got == nil || *got != 6 {
		t.Errorf("first_patient median = %v, want 6 hours", got)
	}

	if got := byKey["first_record"].Orgs; got != 0 {
		t.Errorf("first_record counted %d organizations, want 0", got)
	}
	// Nobody reached it, which is not the same as everybody reaching it instantly.
	if byKey["first_record"].MedianHours != nil {
		t.Errorf("first_record reported a median with an empty sample: %v", *byKey["first_record"].MedianHours)
	}

	if got := byKey[paidStepKey].Orgs; got != 1 {
		t.Errorf("paid counted %d organizations, want 1", got)
	}
}

// An empty cohort must not divide by zero, and must not report 100% of nothing.
func TestActivationFunnelEmptyCohort(t *testing.T) {
	for _, s := range activationFunnel(nil) {
		if s.Orgs != 0 || s.Pct != 0 {
			t.Errorf("step %q on an empty cohort reports %d orgs / %v%%", s.Key, s.Orgs, s.Pct)
		}
	}
}

// A tenant the operator switched on by hand is not a sale. Counting it as one
// is the difference between "we have a paying customer" and "we comped one",
// and with a cohort of three that difference is the whole reading.
func TestPaidSource(t *testing.T) {
	cases := []struct {
		name     string
		status   string
		provider bool
		charge   bool
		want     string
	}{
		{"trialing tenant is not paying", "trialing", false, false, paidNone},
		{"canceled tenant is not paying, even with a past charge", "canceled", true, true, paidNone},
		{"activated by hand from the console", "active", false, false, paidManual},
		{"charged by a payment webhook", "active", true, true, paidCharged},
		// The MercadoPago preapproval activates the tenant without writing a
		// payment id; only the recurring charge does. Without the provider
		// column a fresh subscriber would read as manual for a month.
		{"subscribed through MercadoPago, first charge not in yet", "active", true, false, paidCheckout},
		// Defensive: a charge recorded with no provider id should still read as
		// money that moved, not as a comp.
		{"charge recorded without a provider id", "active", false, true, paidCharged},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			o := orgActivation{
				SubscriptionStatus: tc.status,
				HasBillingProvider: tc.provider,
				HasRecordedCharge:  tc.charge,
			}
			if got := paidSource(o); got != tc.want {
				t.Errorf("paidSource = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestSplitPaid(t *testing.T) {
	orgs := []orgActivation{
		{PaidSource: paidManual},
		{PaidSource: paidManual},
		{PaidSource: paidCharged},
		{PaidSource: paidCheckout},
		{PaidSource: paidNone},
	}
	got := splitPaid(orgs)
	if got.Manual != 2 || got.Charged != 1 || got.Checkout != 1 {
		t.Errorf("splitPaid = %+v, want 2 manual / 1 charged / 1 checkout", got)
	}
}

func TestMedian(t *testing.T) {
	cases := []struct {
		name string
		in   []float64
		want *float64
	}{
		{"empty sample has no median", nil, nil},
		{"single value", []float64{7}, ptr(7)},
		{"odd count takes the middle", []float64{9, 1, 5}, ptr(5)},
		{"even count averages the two middles", []float64{1, 2, 4, 10}, ptr(3)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := median(tc.in)
			switch {
			case tc.want == nil && got != nil:
				t.Errorf("median = %v, want nil", *got)
			case tc.want != nil && got == nil:
				t.Errorf("median = nil, want %v", *tc.want)
			case tc.want != nil && *got != *tc.want:
				t.Errorf("median = %v, want %v", *got, *tc.want)
			}
		})
	}
}

// median sorts a copy: the caller's slice is a funnel sample that may be reused.
func TestMedianDoesNotReorderItsInput(t *testing.T) {
	in := []float64{9, 1, 5}
	_ = median(in)
	if in[0] != 9 || in[1] != 1 || in[2] != 5 {
		t.Errorf("median reordered its input: %v", in)
	}
}

func ptr(f float64) *float64 { return &f }

func boolp(b bool) *bool { return &b }

// TestSplitOnboarding pins the distinction the funnel was missing. Before
// 000081 both ways of closing the wizard stamped the same column, so the
// console reported a tenant who clicked "Omitir por ahora" 26 seconds after
// logging in — the first organic signup, 2026-08-25 — as one that had set the
// product up.
func TestSplitOnboarding(t *testing.T) {
	base := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)
	done := at(base, 2)

	cases := []struct {
		name string
		orgs []orgActivation
		want onboardingBreakdown
	}{
		{
			"finishing and skipping are not the same tenant",
			[]orgActivation{
				{CreatedAt: base, OnboardedAt: done, OnboardingSkipped: boolp(false)},
				{CreatedAt: base, OnboardedAt: done, OnboardingSkipped: boolp(true)},
			},
			onboardingBreakdown{Completed: 1, Skipped: 1},
		},
		{
			// The whole point of the nullable column: these tenants closed the
			// wizard before anyone recorded how, and calling them completed
			// would make up the number this test exists to protect.
			"tenants from before the distinction count as unknown",
			[]orgActivation{{CreatedAt: base, OnboardedAt: done, OnboardingSkipped: nil}},
			onboardingBreakdown{Unknown: 1},
		},
		{
			// Never reaching the step is not an outcome. Counting it as unknown
			// would inflate the bucket that reads as "we lost this one".
			"a tenant that never reached onboarding is not counted",
			[]orgActivation{
				{CreatedAt: base, VerifiedAt: at(base, 1)},
				{CreatedAt: base},
			},
			onboardingBreakdown{},
		},
		{
			"empty cohort",
			nil,
			onboardingBreakdown{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := splitOnboarding(tc.orgs); got != tc.want {
				t.Errorf("splitOnboarding = %+v, want %+v", got, tc.want)
			}
		})
	}
}

// The onboarding step counts both outcomes, so its label must not claim the
// tenant finished anything. The split lives in onboarding_breakdown.
func TestOnboardingStepLabelDoesNotClaimCompletion(t *testing.T) {
	for _, s := range activationStepDefs {
		if s.key != "onboarded" {
			continue
		}
		if s.label != "Cerró la puesta en marcha" {
			t.Errorf("label = %q; the step counts skips too, so it cannot say the tenant finished", s.label)
		}
		return
	}
	t.Fatal("the onboarded step disappeared from the funnel")
}
