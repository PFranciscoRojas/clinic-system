package leadbooking

import (
	"reflect"
	"testing"
	"time"
)

// service_test.go already covers the happy path and the two busy cases. What is
// added here are the edges: a slot that would run past closing time, the
// fallbacks when the settings are nonsense, and the exact boundaries of the
// overlap check — this is the public lead-booking page, so an over-generous
// slot list books a stranger onto a busy calendar.

func testTZ(t *testing.T) *time.Location {
	t.Helper()
	return loadTZ("America/Bogota")
}

// slotsOn runs daySlots for a Monday far enough ahead that nothing is past.
func slotsOn(t *testing.T, cfg Settings, busy []busyInterval) []string {
	t.Helper()
	tz := testTZ(t)
	day := time.Date(2999, 1, 4, 0, 0, 0, 0, tz) // a Monday
	past := time.Date(2999, 1, 1, 0, 0, 0, 0, tz)
	return daySlots(day, cfg, tz, busy, past)
}

// TestDaySlotsNeverRunsPastClosingTime: the loop condition is `m+dur <= end`,
// not `m < end`, so a session that would spill past the end hour is not
// offered at all.
func TestDaySlotsNeverRunsPastClosingTime(t *testing.T) {
	cfg := testSettings()
	cfg.StartHour, cfg.EndHour = "09:00", "10:00"
	cfg.SlotStepMin, cfg.DurationMin = 30, 45

	got := slotsOn(t, cfg, nil)
	// 09:00 ends at 09:45 and fits. 09:30 would end at 10:15 and does not.
	want := []string{"09:00"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v — a session must never run past the end hour", got, want)
	}
}

func TestDaySlotsExactFitAtTheEnd(t *testing.T) {
	cfg := testSettings()
	cfg.StartHour, cfg.EndHour = "09:00", "10:00"
	cfg.SlotStepMin, cfg.DurationMin = 30, 30

	got := slotsOn(t, cfg, nil)
	want := []string{"09:00", "09:30"} // 09:30–10:00 lands exactly on closing
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v — a session ending exactly at closing must be offered", got, want)
	}
}

func TestDaySlotsRejectsAnImpossibleWindow(t *testing.T) {
	cases := []struct {
		name       string
		start, end string
	}{
		{"end before start", "18:00", "09:00"},
		{"end equal to start", "09:00", "09:00"},
		{"unparseable start", "morning", "18:00"},
		{"empty start", "", "18:00"},
		{"unparseable end", "09:00", "evening"},
		{"empty end", "09:00", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := testSettings()
			cfg.StartHour, cfg.EndHour = tc.start, tc.end
			if got := slotsOn(t, cfg, nil); got != nil {
				t.Errorf("slots = %v, want none — the window makes no sense", got)
			}
		})
	}
}

func TestDaySlotsFallbacks(t *testing.T) {
	t.Run("a zero step falls back to 30 minutes", func(t *testing.T) {
		cfg := testSettings()
		cfg.StartHour, cfg.EndHour = "09:00", "11:00"
		cfg.SlotStepMin, cfg.DurationMin = 0, 30

		got := slotsOn(t, cfg, nil)
		want := []string{"09:00", "09:30", "10:00", "10:30"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("slots = %v, want %v", got, want)
		}
	})

	t.Run("a negative step falls back too", func(t *testing.T) {
		cfg := testSettings()
		cfg.StartHour, cfg.EndHour = "09:00", "10:00"
		cfg.SlotStepMin, cfg.DurationMin = -15, 30
		got := slotsOn(t, cfg, nil)
		if len(got) != 2 {
			t.Errorf("slots = %v, want 2 — a negative step must not loop forever or collapse", got)
		}
	})

	t.Run("a zero duration falls back to the step", func(t *testing.T) {
		cfg := testSettings()
		cfg.StartHour, cfg.EndHour = "09:00", "10:00"
		cfg.SlotStepMin, cfg.DurationMin = 30, 0

		got := slotsOn(t, cfg, nil)
		want := []string{"09:00", "09:30"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("slots = %v, want %v", got, want)
		}
	})

	t.Run("a midnight to midnight window is honoured", func(t *testing.T) {
		cfg := testSettings()
		cfg.StartHour, cfg.EndHour = "00:00", "24:00"
		cfg.SlotStepMin, cfg.DurationMin = 60, 60

		got := slotsOn(t, cfg, nil)
		if len(got) != 24 {
			t.Errorf("got %d slots, want 24 — 24:00 must parse as end of day", len(got))
		}
	})
}

func TestDaySlotsSkipsThePast(t *testing.T) {
	tz := testTZ(t)
	cfg := testSettings() // 09:00–11:00, 30/30

	day := time.Date(2999, 1, 4, 0, 0, 0, 0, tz)
	now := time.Date(2999, 1, 4, 9, 45, 0, 0, tz)

	got := daySlots(day, cfg, tz, nil, now)
	want := []string{"10:00", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v", got, want)
	}

	// The boundary: a slot starting exactly now is not offered.
	exact := time.Date(2999, 1, 4, 10, 0, 0, 0, tz)
	got = daySlots(day, cfg, tz, nil, exact)
	if len(got) == 0 || got[0] != "10:30" {
		t.Errorf("slots = %v, want the first at 10:30 — 10:00 is exactly now", got)
	}
}

func TestOverlapsBusyBoundaries(t *testing.T) {
	tz := testTZ(t)
	on := func(h, m int) time.Time { return time.Date(2999, 1, 4, h, m, 0, 0, tz) }

	busy := []busyInterval{{start: on(10, 0), end: on(11, 0)}}

	cases := []struct {
		name       string
		start, end time.Time
		want       bool
	}{
		{"before", on(8, 0), on(9, 0), false},
		{"after", on(12, 0), on(13, 0), false},
		{"ends exactly when it starts", on(9, 0), on(10, 0), false},
		{"starts exactly when it ends", on(11, 0), on(12, 0), false},
		{"identical", on(10, 0), on(11, 0), true},
		{"contained", on(10, 15), on(10, 45), true},
		{"containing", on(9, 0), on(12, 0), true},
		{"overlapping the start", on(9, 30), on(10, 30), true},
		{"overlapping the end", on(10, 30), on(11, 30), true},
		{"one minute of overlap", on(9, 0), on(10, 1), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := overlapsBusy(tc.start, tc.end, busy); got != tc.want {
				t.Errorf("overlapsBusy(%s, %s) = %v, want %v",
					tc.start.Format("15:04"), tc.end.Format("15:04"), got, tc.want)
			}
		})
	}

	t.Run("several intervals", func(t *testing.T) {
		many := []busyInterval{
			{start: on(9, 0), end: on(9, 30)},
			{start: on(14, 0), end: on(15, 0)},
		}
		if !overlapsBusy(on(14, 30), on(15, 30), many) {
			t.Error("the second interval was not checked")
		}
		if overlapsBusy(on(11, 0), on(12, 0), many) {
			t.Error("a gap between intervals reported an overlap")
		}
	})

	t.Run("no intervals", func(t *testing.T) {
		if overlapsBusy(on(10, 0), on(11, 0), nil) {
			t.Error("an empty busy list reported an overlap")
		}
	})
}

func TestToMinutesLeadBooking(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"00:00", 0},
		{"09:00", 540},
		{"23:59", 1439},
		{"24:00", 1440},
		{"  09:00  ", 540}, // this one trims, unlike the availability package
		{"", -1},
		{"25:00", -1},
		{"9:00", 540},
		{"garbage", -1},
		{"09:60", -1},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := toMinutes(tc.in); got != tc.want {
				t.Errorf("toMinutes(%q) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

// loadTZ has to fall back rather than fail: a container without tzdata would
// otherwise compute every slot against a nil location.
func TestLoadTZ(t *testing.T) {
	if got := loadTZ("America/Bogota"); got == nil {
		t.Fatal("loadTZ returned nil for a real zone")
	}
	fallback := loadTZ("Mars/Olympus_Mons")
	if fallback == nil {
		t.Fatal("loadTZ returned nil for an unknown zone instead of falling back")
	}
	_, offset := time.Date(2026, 7, 1, 12, 0, 0, 0, fallback).Zone()
	if offset != -5*3600 {
		t.Errorf("fallback offset = %ds, want -18000 (UTC-5)", offset)
	}
}

func TestContainsLeadBooking(t *testing.T) {
	days := []string{"Lun", "Mar", "Mié"}
	for _, d := range days {
		if !contains(days, d) {
			t.Errorf("contains(%v, %q) = false", days, d)
		}
	}
	for _, d := range []string{"Sáb", "", "lun"} {
		if contains(days, d) {
			t.Errorf("contains(%v, %q) = true", days, d)
		}
	}
	if contains(nil, "Lun") {
		t.Error("contains(nil, ...) = true")
	}
}
