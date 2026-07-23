package leadbooking

import (
	"testing"
	"time"
)

func testSettings() Settings {
	return Settings{
		ActiveDays:  []string{"Lun", "Mar", "Mié", "Jue", "Vie"},
		StartHour:   "09:00",
		EndHour:     "11:00",
		SlotStepMin: 30,
		DurationMin: 30,
		Timezone:    "America/Bogota",
	}
}

func TestDaySlots_FullDay(t *testing.T) {
	tz := loadTZ("America/Bogota")
	// A weekday far in the future so nothing is "past".
	day := time.Date(2999, 1, 4, 0, 0, 0, 0, tz) // a Monday
	now := time.Date(2999, 1, 1, 0, 0, 0, 0, tz)

	slots := daySlots(day, testSettings(), tz, nil, now)
	want := []string{"09:00", "09:30", "10:00", "10:30"}
	if len(slots) != len(want) {
		t.Fatalf("got %v, want %v", slots, want)
	}
	for i := range want {
		if slots[i] != want[i] {
			t.Fatalf("slot %d: got %q, want %q", i, slots[i], want[i])
		}
	}
}

func TestDaySlots_SkipsBooked(t *testing.T) {
	tz := loadTZ("America/Bogota")
	day := time.Date(2999, 1, 4, 0, 0, 0, 0, tz)
	now := time.Date(2999, 1, 1, 0, 0, 0, 0, tz)

	booked := []time.Time{
		time.Date(2999, 1, 4, 9, 30, 0, 0, tz).UTC(),
	}
	slots := daySlots(day, testSettings(), tz, booked, now)
	for _, s := range slots {
		if s == "09:30" {
			t.Fatalf("booked slot 09:30 should be excluded, got %v", slots)
		}
	}
	if len(slots) != 3 {
		t.Fatalf("expected 3 free slots, got %v", slots)
	}
}

func TestDaySlots_SkipsPast(t *testing.T) {
	tz := loadTZ("America/Bogota")
	day := time.Date(2999, 1, 4, 0, 0, 0, 0, tz)
	// "now" is mid-morning: 09:00 and 09:30 are past.
	now := time.Date(2999, 1, 4, 9, 45, 0, 0, tz)

	slots := daySlots(day, testSettings(), tz, nil, now)
	want := []string{"10:00", "10:30"}
	if len(slots) != len(want) {
		t.Fatalf("got %v, want %v", slots, want)
	}
}

func TestToMinutes(t *testing.T) {
	cases := map[string]int{
		"09:00": 540,
		"00:00": 0,
		"24:00": 1440,
		"":      -1,
		"nope":  -1,
	}
	for in, want := range cases {
		if got := toMinutes(in); got != want {
			t.Errorf("toMinutes(%q) = %d, want %d", in, got, want)
		}
	}
}
