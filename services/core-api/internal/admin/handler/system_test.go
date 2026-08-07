package handler

import "testing"

// The operator console counted tenants by subscription_status alone, so a
// clinic whose paid period had lapsed (status still 'active', period ended
// twelve days ago) was counted among the "activos" while the SubscriptionGate
// was already answering it 402. The dashboard has to bucket tenants by the same
// rule the gate enforces.
func TestTenantBucket(t *testing.T) {
	cases := []struct {
		name    string
		status  string
		current bool
		want    string
	}{
		{"paid period still running", "active", true, "active"},
		{"paid period lapsed", "active", false, "expired"},
		{"trial still running", "trialing", true, "trialing"},
		{"trial lapsed", "trialing", false, "expired"},
		// A non-entitled status is never rescued by a future date: a canceled
		// tenant with a paid period left on the clock is still canceled.
		{"canceled with time left", "canceled", true, "canceled"},
		{"suspended with time left", "suspended", true, "suspended"},
		{"past due", "past_due", false, "past_due"},
		{"unknown status is not counted anywhere", "weird", true, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tenantBucket(tc.status, tc.current); got != tc.want {
				t.Errorf("tenantBucket(%q, %v) = %q, want %q", tc.status, tc.current, got, tc.want)
			}
		})
	}
}
