package availability

import (
	"reflect"
	"testing"
	"time"
)

// daySlots and overlapsBusy decide what a patient is offered on the public
// booking page. A bug that offers too much double-books a professional; a bug
// that offers too little loses the appointment silently. Both directions are
// asserted against exact slot lists rather than counts.

// at builds an instant on the fixed test day, in Bogotá.
func at(hour, min int) time.Time {
	return time.Date(2026, 8, 5, hour, min, 0, 0, bogota) // a Wednesday
}

var testDay = at(0, 0)

// longPast is a "now" far enough back that no slot on the test day counts as
// past, so tests can isolate the rules they care about.
var longPast = at(0, 0).AddDate(0, 0, -1)

func testSchedule() scheduleConfig {
	return scheduleConfig{
		ActiveDays: []string{"Lun", "Mar", "Mié", "Jue", "Vie"},
		StartHour:  "08:00", EndHour: "11:00", SessionLen: 50,
		BreakStart: "", BreakEnd: "", Buffer: 0,
	}
}

func TestDaySlotsEveryThirtyMinutes(t *testing.T) {
	got := (&Service{}).daySlots(testDay, testSchedule(), nil, longPast, "VIRTUAL")
	want := []string{"08:00", "08:30", "09:00", "09:30", "10:00", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v", got, want)
	}
}

// The end hour is exclusive: a schedule ending at 11:00 must not offer 11:00.
func TestDaySlotsEndHourIsExclusive(t *testing.T) {
	cfg := testSchedule()
	cfg.EndHour = "10:00"
	got := (&Service{}).daySlots(testDay, cfg, nil, longPast, "VIRTUAL")
	for _, s := range got {
		if s == "10:00" {
			t.Errorf("slots = %v, want the 10:00 end hour excluded", got)
		}
	}
	if len(got) != 4 {
		t.Errorf("slots = %v, want 4 (08:00 through 09:30)", got)
	}
}

func TestDaySlotsExcludesTheBreak(t *testing.T) {
	cfg := testSchedule()
	cfg.EndHour = "16:00"
	cfg.BreakStart, cfg.BreakEnd = "13:00", "14:00"

	got := (&Service{}).daySlots(testDay, cfg, nil, longPast, "VIRTUAL")

	for _, s := range got {
		if s == "13:00" || s == "13:30" {
			t.Errorf("slots = %v, want the 13:00–14:00 break excluded", got)
		}
	}
	// The break is [start, end): 14:00 is back on offer.
	var has1400 bool
	for _, s := range got {
		if s == "14:00" {
			has1400 = true
		}
	}
	if !has1400 {
		t.Errorf("slots = %v, want 14:00 offered — the break end is exclusive", got)
	}
}

func TestDaySlotsIgnoresAnEmptyOrInvertedBreak(t *testing.T) {
	for _, tc := range []struct{ name, s, e string }{
		{"no break configured", "", ""},
		{"inverted break", "14:00", "13:00"},
		{"zero-length break", "13:00", "13:00"},
		{"unparseable break", "lunch", "later"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := testSchedule()
			cfg.BreakStart, cfg.BreakEnd = tc.s, tc.e
			got := (&Service{}).daySlots(testDay, cfg, nil, longPast, "VIRTUAL")
			if len(got) != 6 {
				t.Errorf("slots = %v, want all 6 — a break that makes no sense must not remove any", got)
			}
		})
	}
}

// In-person sessions start at 2pm. Virtual keeps the full configured hours.
func TestDaySlotsInPersonStartsInTheAfternoon(t *testing.T) {
	cfg := testSchedule()
	cfg.EndHour = "16:00"

	inPerson := (&Service{}).daySlots(testDay, cfg, nil, longPast, "IN_PERSON")
	if len(inPerson) == 0 {
		t.Fatal("no in-person slots at all")
	}
	if inPerson[0] != "14:00" {
		t.Errorf("first in-person slot = %q, want 14:00", inPerson[0])
	}

	virtual := (&Service{}).daySlots(testDay, cfg, nil, longPast, "VIRTUAL")
	if virtual[0] != "08:00" {
		t.Errorf("first virtual slot = %q, want the configured 08:00", virtual[0])
	}

	// An unknown modality is treated as virtual, not silently restricted.
	other := (&Service{}).daySlots(testDay, cfg, nil, longPast, "")
	if other[0] != "08:00" {
		t.Errorf("first slot for an unset modality = %q, want the configured 08:00", other[0])
	}
}

// A schedule that already starts after 2pm must not be pushed later.
func TestDaySlotsInPersonDoesNotDelayAnAfternoonSchedule(t *testing.T) {
	cfg := testSchedule()
	cfg.StartHour, cfg.EndHour = "15:00", "17:00"
	got := (&Service{}).daySlots(testDay, cfg, nil, longPast, "IN_PERSON")
	if len(got) == 0 || got[0] != "15:00" {
		t.Errorf("slots = %v, want the first at 15:00", got)
	}
}

func TestDaySlotsSkipsThePast(t *testing.T) {
	cfg := testSchedule()
	now := at(9, 15)

	got := (&Service{}).daySlots(testDay, cfg, nil, now, "VIRTUAL")
	want := []string{"09:30", "10:00", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v — anything at or before now must be gone", got, want)
	}
}

// The boundary: a slot exactly at "now" is not bookable (!After(now)), the next
// one is.
func TestDaySlotsAtTheCurrentInstant(t *testing.T) {
	cfg := testSchedule()
	got := (&Service{}).daySlots(testDay, cfg, nil, at(9, 0), "VIRTUAL")
	if len(got) == 0 || got[0] != "09:30" {
		t.Errorf("slots = %v, want the first at 09:30 — 09:00 is exactly now", got)
	}

	got = (&Service{}).daySlots(testDay, cfg, nil, at(8, 59), "VIRTUAL")
	if len(got) == 0 || got[0] != "09:00" {
		t.Errorf("slots = %v, want 09:00 still bookable one minute before it starts", got)
	}
}

func TestDaySlotsFallsBackOnAnInvalidSchedule(t *testing.T) {
	t.Run("unparseable hours fall back to 08:00-19:00", func(t *testing.T) {
		cfg := scheduleConfig{StartHour: "morning", EndHour: "evening", SessionLen: 50}
		got := (&Service{}).daySlots(testDay, cfg, nil, longPast, "VIRTUAL")
		if len(got) == 0 {
			t.Fatal("no slots at all")
		}
		if got[0] != "08:00" {
			t.Errorf("first slot = %q, want the 08:00 default", got[0])
		}
		if got[len(got)-1] != "18:30" {
			t.Errorf("last slot = %q, want 18:30 (the 19:00 default, exclusive)", got[len(got)-1])
		}
	})

	t.Run("a zero session length falls back to 50 minutes", func(t *testing.T) {
		cfg := testSchedule()
		cfg.SessionLen = 0
		// A 09:00 booking with a 50-minute fallback runs to 09:50 and takes the
		// 09:30 slot with it. A 0-minute session would leave 09:30 free.
		busy := []Busy{{Start: at(9, 0), DurationMin: 50}}
		got := (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
		for _, s := range got {
			if s == "09:30" {
				t.Errorf("slots = %v, want 09:30 taken — a zero session length must not "+
					"collapse the overlap check", got)
			}
		}
	})

	t.Run("a midnight to midnight schedule is honoured", func(t *testing.T) {
		cfg := testSchedule()
		cfg.StartHour, cfg.EndHour = "00:00", "24:00"
		got := (&Service{}).daySlots(testDay, cfg, nil, longPast, "VIRTUAL")
		if len(got) != 48 {
			t.Errorf("got %d slots, want 48 — 24:00 must not fall back to the 19:00 default", len(got))
		}
	})
}

func TestDaySlotsRemovesBookedTime(t *testing.T) {
	cfg := testSchedule()

	// Slots are offered every 30 minutes but a session lasts 50, so a booking
	// removes more than the slots it literally covers. A 09:00–09:50 booking
	// takes 09:00 and 09:30 outright, and also 08:30 — that slot would run to
	// 09:20 and land on top of it. 08:00 ends at 08:50 and survives.
	busy := []Busy{{Start: at(9, 0), DurationMin: 50}}
	got := (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
	want := []string{"08:00", "10:00", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v", got, want)
	}
}

// TestDaySlotsSessionLengthReachesBackwards isolates the rule above, because it
// is the least obvious one here: with sessions longer than the 30-minute step,
// a booking also invalidates the slots that start before it.
func TestDaySlotsSessionLengthReachesBackwards(t *testing.T) {
	cfg := testSchedule()
	busy := []Busy{{Start: at(10, 0), DurationMin: 50}}

	got := (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
	for _, s := range got {
		if s == "09:30" {
			t.Errorf("slots = %v, want 09:30 gone — a 50-minute session there would "+
				"run to 10:20, over the 10:00 booking", got)
		}
	}
	// 09:00 runs to 09:50 and must survive.
	var has0900 bool
	for _, s := range got {
		if s == "09:00" {
			has0900 = true
		}
	}
	if !has0900 {
		t.Errorf("slots = %v, want 09:00 kept — it ends at 09:50, before the booking", got)
	}
}

// TestDaySlotsAppliesTheBuffer: the buffer pads the busy block on both sides,
// so back-to-back sessions leave the professional time to breathe.
func TestDaySlotsAppliesTheBuffer(t *testing.T) {
	cfg := testSchedule()
	cfg.SessionLen = 30
	cfg.Buffer = 10

	// 09:00 for 30 min, padded to [08:50, 09:40). The 08:30 slot runs
	// 08:30–09:00, which overlaps the padding, so it goes too.
	busy := []Busy{{Start: at(9, 0), DurationMin: 30}}
	got := (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
	want := []string{"08:00", "10:00", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v", got, want)
	}

	// Without the buffer, 08:30 and 09:30 come back.
	cfg.Buffer = 0
	got = (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
	want = []string{"08:00", "08:30", "09:30", "10:00", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots without a buffer = %v, want %v", got, want)
	}
}

func TestDaySlotsHandlesSeveralBookings(t *testing.T) {
	cfg := testSchedule()
	cfg.SessionLen = 30

	busy := []Busy{
		{Start: at(8, 0), DurationMin: 30},
		{Start: at(10, 0), DurationMin: 30},
	}
	got := (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
	want := []string{"08:30", "09:00", "09:30", "10:30"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("slots = %v, want %v", got, want)
	}
}

// A booking on another day must not remove anything from this one.
func TestDaySlotsIgnoresOtherDays(t *testing.T) {
	cfg := testSchedule()
	busy := []Busy{{Start: at(9, 0).AddDate(0, 0, 1), DurationMin: 50}}
	got := (&Service{}).daySlots(testDay, cfg, busy, longPast, "VIRTUAL")
	if len(got) != 6 {
		t.Errorf("slots = %v, want all 6 — a booking tomorrow blocked a slot today", got)
	}
}

func TestOverlapsBusy(t *testing.T) {
	// One busy block: 09:00–10:00.
	busy := []Busy{{Start: at(9, 0), DurationMin: 60}}

	cases := []struct {
		name   string
		start  time.Time
		end    time.Time
		buffer time.Duration
		want   bool
	}{
		{"entirely before", at(7, 0), at(8, 0), 0, false},
		{"entirely after", at(11, 0), at(12, 0), 0, false},
		{"ends exactly when it starts", at(8, 0), at(9, 0), 0, false},
		{"starts exactly when it ends", at(10, 0), at(11, 0), 0, false},

		{"identical", at(9, 0), at(10, 0), 0, true},
		{"contained", at(9, 15), at(9, 45), 0, true},
		{"containing", at(8, 0), at(11, 0), 0, true},
		{"overlapping the start", at(8, 30), at(9, 30), 0, true},
		{"overlapping the end", at(9, 30), at(10, 30), 0, true},
		{"a single minute of overlap at the start", at(8, 0), at(9, 1), 0, true},
		{"a single minute of overlap at the end", at(9, 59), at(11, 0), 0, true},

		// With a 10-minute buffer the block behaves as 08:50–10:10.
		{"just outside the buffer, before", at(7, 0), at(8, 50), 10 * time.Minute, false},
		{"just inside the buffer, before", at(7, 0), at(8, 51), 10 * time.Minute, true},
		{"just outside the buffer, after", at(10, 10), at(11, 0), 10 * time.Minute, false},
		{"just inside the buffer, after", at(10, 9), at(11, 0), 10 * time.Minute, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := overlapsBusy(tc.start, tc.end, busy, tc.buffer); got != tc.want {
				t.Errorf("overlapsBusy(%s, %s, buffer=%v) = %v, want %v",
					tc.start.Format("15:04"), tc.end.Format("15:04"), tc.buffer, got, tc.want)
			}
		})
	}

	t.Run("no busy blocks at all", func(t *testing.T) {
		if overlapsBusy(at(9, 0), at(10, 0), nil, 0) {
			t.Error("an empty busy list reported an overlap")
		}
	})

	t.Run("a zero-duration block still blocks its instant", func(t *testing.T) {
		zero := []Busy{{Start: at(9, 0), DurationMin: 0}}
		if !overlapsBusy(at(8, 30), at(9, 30), zero, 0) {
			t.Error("a zero-duration booking was treated as free time")
		}
	})
}

func TestContains(t *testing.T) {
	days := []string{"Lun", "Mar", "Mié"}
	for _, d := range days {
		if !contains(days, d) {
			t.Errorf("contains(%v, %q) = false", days, d)
		}
	}
	for _, d := range []string{"Sáb", "Dom", "Jue", "", "lun", "Mie"} {
		if contains(days, d) {
			t.Errorf("contains(%v, %q) = true", days, d)
		}
	}
	if contains(nil, "Lun") {
		t.Error("contains(nil, ...) = true")
	}
}

// TestDayLabelsMatchGoWeekdays: the labels are indexed by time.Weekday, so an
// off-by-one would offer Monday's hours on Sunday.
func TestDayLabelsMatchGoWeekdays(t *testing.T) {
	want := map[time.Weekday]string{
		time.Sunday: "Dom", time.Monday: "Lun", time.Tuesday: "Mar",
		time.Wednesday: "Mié", time.Thursday: "Jue", time.Friday: "Vie",
		time.Saturday: "Sáb",
	}
	if len(dayLabels) != 7 {
		t.Fatalf("dayLabels has %d entries, want 7", len(dayLabels))
	}
	for wd, label := range want {
		if dayLabels[int(wd)] != label {
			t.Errorf("dayLabels[%v] = %q, want %q", wd, dayLabels[int(wd)], label)
		}
	}

	// And the default schedule's active days must all be real labels, or a
	// weekday would never match and the clinic would look permanently closed.
	for _, d := range defaultSchedule().ActiveDays {
		if !contains(dayLabels, d) {
			t.Errorf("defaultSchedule lists %q, which is not one of %v", d, dayLabels)
		}
	}
}

// TestBogotaIsUTCMinus5 guards the fallback in mustLoad: if the tzdata is
// missing from the container the zone silently becomes a fixed offset, and
// every slot would be computed against it.
func TestBogotaIsUTCMinus5(t *testing.T) {
	_, offset := at(12, 0).Zone()
	if offset != -5*3600 {
		t.Errorf("Bogota offset = %ds, want -18000 (UTC-5, no DST)", offset)
	}

	// July and January must agree: Colombia has no daylight saving, so a slot
	// list must not shift by an hour between seasons.
	_, july := time.Date(2026, 7, 1, 12, 0, 0, 0, bogota).Zone()
	_, january := time.Date(2026, 1, 1, 12, 0, 0, 0, bogota).Zone()
	if july != january {
		t.Errorf("offset differs between July (%d) and January (%d) — DST is being applied", july, january)
	}
}
