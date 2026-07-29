package invoicing

import (
	"testing"
	"time"

	"sghcp/core-api/internal/shared/token"
)

// billingStaffScope decides whether a caller sees the whole organization's
// billing or only the patients assigned to them (need-to-know, Res. 1995/1999
// Art. 14). Returning "" when it should have returned a user id exposes every
// patient's financial history to a professional who is not treating them, so
// every role combination is spelled out rather than sampled.

func TestBillingStaffScope(t *testing.T) {
	const me = "user-me"

	cases := []struct {
		name  string
		roles []string
		perms []string
		want  string
	}{
		// Clinical staff without the reports permission see only their own.
		{"professional", []string{"PROFESSIONAL"}, []string{"billing:read"}, me},
		{"intern", []string{"INTERN"}, []string{"billing:read"}, me},
		{"professional with no permissions at all", []string{"PROFESSIONAL"}, nil, me},
		{"professional who is also a receptionist", []string{"PROFESSIONAL", "RECEPTIONIST"}, []string{"billing:read"}, me},

		// billing:reports is the org-wide grant.
		{"owner: professional plus reports", []string{"PROFESSIONAL"}, []string{"billing:reports"}, ""},
		{"intern with reports", []string{"INTERN"}, []string{"billing:read", "billing:reports"}, ""},

		// Non-clinical roles are front desk or admin: org-wide by construction.
		{"clinic admin", []string{"CLINIC_ADMIN"}, []string{"billing:reports"}, ""},
		{"clinic admin without reports", []string{"CLINIC_ADMIN"}, []string{"billing:read"}, ""},
		{"receptionist", []string{"RECEPTIONIST"}, []string{"billing:read"}, ""},
		{"no roles at all", nil, nil, ""},

		// The permission is matched exactly: a near-miss must not widen the scope.
		{"professional with a look-alike permission", []string{"PROFESSIONAL"}, []string{"billing:report"}, me},
		{"professional with a prefixed permission", []string{"PROFESSIONAL"}, []string{"billing:reports:all"}, me},
		{"professional with the permission uppercased", []string{"PROFESSIONAL"}, []string{"BILLING:REPORTS"}, me},

		// And the role is matched exactly too, in the other direction: an
		// unknown role must not be treated as clinical and narrowed by accident.
		{"unknown role", []string{"AUDITOR"}, []string{"billing:read"}, ""},
		{"lowercase professional is not a clinical role", []string{"professional"}, []string{"billing:read"}, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			claims := &token.Claims{UserID: me, Roles: tc.roles, Permissions: tc.perms}
			if got := billingStaffScope(claims); got != tc.want {
				t.Errorf("billingStaffScope(roles=%v perms=%v) = %q, want %q",
					tc.roles, tc.perms, got, tc.want)
			}
		})
	}
}

func TestHasPerm(t *testing.T) {
	cases := []struct {
		name  string
		perms []string
		code  string
		want  bool
	}{
		{"present", []string{"billing:read", "billing:reports"}, "billing:reports", true},
		{"only entry", []string{"billing:reports"}, "billing:reports", true},
		{"absent", []string{"billing:read"}, "billing:reports", false},
		{"empty list", nil, "billing:reports", false},
		{"empty slice", []string{}, "billing:reports", false},
		{"prefix is not a match", []string{"billing:report"}, "billing:reports", false},
		{"superstring is not a match", []string{"billing:reports:all"}, "billing:reports", false},
		{"case differs", []string{"BILLING:REPORTS"}, "billing:reports", false},
		{"empty code against an empty entry", []string{""}, "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := hasPerm(tc.perms, tc.code); got != tc.want {
				t.Errorf("hasPerm(%v, %q) = %v, want %v", tc.perms, tc.code, got, tc.want)
			}
		})
	}
}

func TestParseTime(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		wantOK  bool
		wantNil bool
	}{
		{"empty means no bound", "", true, true},
		{"RFC3339 UTC", "2026-07-28T10:00:00Z", true, false},
		{"RFC3339 with an offset", "2026-07-28T10:00:00-05:00", true, false},
		{"date only is not RFC3339", "2026-07-28", false, true},
		{"garbage", "not-a-date", false, true},
		{"almost RFC3339, missing the zone", "2026-07-28T10:00:00", false, true},
		{"unix timestamp", "1785312000", false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseTime(tc.in)
			if ok != tc.wantOK {
				t.Fatalf("parseTime(%q) ok = %v, want %v", tc.in, ok, tc.wantOK)
			}
			if (got == nil) != tc.wantNil {
				t.Errorf("parseTime(%q) = %v, wantNil = %v", tc.in, got, tc.wantNil)
			}
		})
	}

	// A parsed instant must survive the conversion unchanged; a listing bounded
	// by the wrong instant silently reports the wrong revenue.
	got, ok := parseTime("2026-07-28T10:00:00Z")
	if !ok || got == nil {
		t.Fatal("a valid RFC3339 timestamp was rejected")
	}
	if !got.Equal(time.Date(2026, 7, 28, 10, 0, 0, 0, time.UTC)) {
		t.Errorf("parseTime returned %v, want 2026-07-28T10:00:00Z", got)
	}
}

func TestPeriodBounds(t *testing.T) {
	for _, period := range []string{"week", "month", "quarter", "year"} {
		t.Run(period+" is bounded", func(t *testing.T) {
			from, to := periodBounds(period)
			if from == nil || to == nil {
				t.Fatalf("periodBounds(%q) = (%v, %v), want both set", period, from, to)
			}
			if !from.Before(*to) {
				t.Errorf("periodBounds(%q) = [%v, %v), which is empty or inverted", period, from, to)
			}
		})
	}

	for _, period := range []string{"", "all", "unknown", "MONTH", "día"} {
		t.Run(period+" is unbounded", func(t *testing.T) {
			from, to := periodBounds(period)
			if from != nil || to != nil {
				t.Errorf("periodBounds(%q) = (%v, %v), want both nil", period, from, to)
			}
		})
	}
}

// periodRange drives every figure on the billing dashboard, including the
// "vs. previous period" deltas. It is pinned against a fixed instant so the
// assertions are about the arithmetic, not about when the test happens to run.
func TestPeriodRange(t *testing.T) {
	// Tuesday 28 July 2026, 15:30 Bogotá.
	now := time.Date(2026, 7, 28, 15, 30, 0, 0, colombia)

	t.Run("week starts on Monday", func(t *testing.T) {
		from, to, prevFrom, prevTo, hasDelta := periodRange("week", now)
		want := time.Date(2026, 7, 27, 0, 0, 0, 0, colombia)
		if !from.Equal(want) {
			t.Errorf("from = %v, want Monday %v", from, want)
		}
		if !to.Equal(now) {
			t.Errorf("to = %v, want now", to)
		}
		if !prevFrom.Equal(want.AddDate(0, 0, -7)) {
			t.Errorf("prevFrom = %v, want the Monday before", prevFrom)
		}
		// The comparison window must be the same length, or the delta compares
		// a full week against a partial one.
		if to.Sub(from) != prevTo.Sub(prevFrom) {
			t.Errorf("current window %v vs previous %v — the delta compares unequal spans",
				to.Sub(from), prevTo.Sub(prevFrom))
		}
		if !hasDelta {
			t.Error("week should report a delta")
		}
	})

	t.Run("week when today is Monday", func(t *testing.T) {
		monday := time.Date(2026, 7, 27, 9, 0, 0, 0, colombia)
		from, _, _, _, _ := periodRange("week", monday)
		want := time.Date(2026, 7, 27, 0, 0, 0, 0, colombia)
		if !from.Equal(want) {
			t.Errorf("from = %v, want the same day at midnight", from)
		}
	})

	t.Run("week when today is Sunday", func(t *testing.T) {
		sunday := time.Date(2026, 7, 26, 9, 0, 0, 0, colombia)
		from, _, _, _, _ := periodRange("week", sunday)
		// Sunday belongs to the week that began the previous Monday.
		want := time.Date(2026, 7, 20, 0, 0, 0, 0, colombia)
		if !from.Equal(want) {
			t.Errorf("from = %v, want %v — Sunday must close the week, not open it", from, want)
		}
	})

	t.Run("month starts on the first", func(t *testing.T) {
		from, to, prevFrom, prevTo, hasDelta := periodRange("month", now)
		want := time.Date(2026, 7, 1, 0, 0, 0, 0, colombia)
		if !from.Equal(want) {
			t.Errorf("from = %v, want %v", from, want)
		}
		if !prevFrom.Equal(time.Date(2026, 6, 1, 0, 0, 0, 0, colombia)) {
			t.Errorf("prevFrom = %v, want 1 June", prevFrom)
		}
		if to.Sub(from) != prevTo.Sub(prevFrom) {
			t.Error("the month delta compares unequal spans")
		}
		if !hasDelta {
			t.Error("month should report a delta")
		}
	})

	t.Run("an unknown period falls back to month", func(t *testing.T) {
		fallback, _, _, _, _ := periodRange("fortnight", now)
		month, _, _, _, _ := periodRange("month", now)
		if !fallback.Equal(month) {
			t.Errorf("unknown period gave %v, want the month window %v", fallback, month)
		}
	})

	t.Run("quarter covers three months back to the first", func(t *testing.T) {
		from, _, prevFrom, _, _ := periodRange("quarter", now)
		if !from.Equal(time.Date(2026, 5, 1, 0, 0, 0, 0, colombia)) {
			t.Errorf("from = %v, want 1 May (July minus two months)", from)
		}
		if !prevFrom.Equal(time.Date(2026, 2, 1, 0, 0, 0, 0, colombia)) {
			t.Errorf("prevFrom = %v, want 1 February", prevFrom)
		}
	})

	t.Run("year starts on 1 January", func(t *testing.T) {
		from, _, prevFrom, _, _ := periodRange("year", now)
		if !from.Equal(time.Date(2026, 1, 1, 0, 0, 0, 0, colombia)) {
			t.Errorf("from = %v, want 1 Jan 2026", from)
		}
		if !prevFrom.Equal(time.Date(2025, 1, 1, 0, 0, 0, 0, colombia)) {
			t.Errorf("prevFrom = %v, want 1 Jan 2025", prevFrom)
		}
	})

	t.Run("all spans everything and reports no delta", func(t *testing.T) {
		from, to, _, _, hasDelta := periodRange("all", now)
		if !from.IsZero() {
			t.Errorf("from = %v, want the zero time", from)
		}
		if !to.After(now) {
			t.Errorf("to = %v, want a time far in the future", to)
		}
		if hasDelta {
			t.Error("\"all\" has no previous period to compare against")
		}
	})

	// The window is computed in Bogotá regardless of the server's clock: a
	// month boundary evaluated in UTC would put late-night sales in the wrong
	// month, and the dashboard would not add up to the invoices.
	t.Run("the window is anchored to Bogota, not to the input zone", func(t *testing.T) {
		// 1 August 2026, 02:00 UTC is still 31 July, 21:00 in Bogotá.
		utcInstant := time.Date(2026, 8, 1, 2, 0, 0, 0, time.UTC)
		from, _, _, _, _ := periodRange("month", utcInstant)
		if !from.Equal(time.Date(2026, 7, 1, 0, 0, 0, 0, colombia)) {
			t.Errorf("from = %v, want 1 July — the instant is still July in Bogota", from)
		}
	})
}
