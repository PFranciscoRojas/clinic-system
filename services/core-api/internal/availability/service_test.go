package availability

import "testing"

func TestToMinutes(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"08:00", 480},
		{"19:30", 1170},
		{"00:00", 0},
		// End-of-day: not a valid time.Parse value but offered by the
		// schedule settings — must NOT fall back to -1 (which silently
		// capped a midnight-to-midnight schedule at the 19:00 default).
		{"24:00", 1440},
		{"", -1},
		{"25:00", -1},
		{"garbage", -1},
	}
	for _, c := range cases {
		if got := toMinutes(c.in); got != c.want {
			t.Errorf("toMinutes(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}
