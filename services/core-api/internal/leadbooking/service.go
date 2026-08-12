package leadbooking

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"sghcp/core-api/internal/gcal"
	"sghcp/core-api/internal/notify"
)

// dayLabels indexed by Go's time.Weekday (Sunday=0), matching the app's labels
// and the seed in lead_booking_settings.active_days.
var dayLabels = []string{"Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"}

// maxWindowDays caps how far ahead availability is computed.
const maxWindowDays = 45

// maxSlotsPerDay bounds the slot loop by iteration count rather than trusting
// the step to be positive. One slot per minute is already past absurd for a
// consulting day, so this never clips a real configuration — it only guarantees
// that daySlots returns.
const maxSlotsPerDay = 24 * 60

// ErrNotOffered is returned when a booking request targets a time outside the
// configured working hours (or an inactive day / past slot).
var ErrNotOffered = errors.New("leadbooking: slot not offered")

// DayAvailability is the free slots offered on one calendar day (local time).
type DayAvailability struct {
	Date  string   `json:"date"`  // YYYY-MM-DD
	Slots []string `json:"slots"` // ["09:00","09:30",…]
}

// BookRequest is the public /book payload.
type BookRequest struct {
	Name    string
	Email   string
	Phone   string
	Message string
	Date    string // YYYY-MM-DD (local)
	Time    string // HH:MM (local)
}

// BookResult is returned to the lead on success.
type BookResult struct {
	When    string `json:"when"`     // formatted local date+time
	MeetURL string `json:"meet_url"` // may be empty if Google Calendar isn't connected
}

// GCal is the subset of gcal.Syncer the service needs (kept small for tests).
type GCal interface {
	PushLeadEvent(ctx context.Context, ownerUserID string, in gcal.LeadEventInput) (eventID, meetURL string, err error)
	BusyTimes(ctx context.Context, ownerUserID string, from, to time.Time) ([]gcal.BusyInterval, error)
}

// busyInterval is an occupied [start,end) range used when computing free slots:
// either an existing lead booking or an event on the owner's Google Calendar.
type busyInterval struct {
	start time.Time
	end   time.Time
}

type Service struct {
	repo        *Repository
	gcal        GCal
	notifier    notify.Notifier
	ownerUserID string // Google Calendar owner (config.LeadsCalendarUserID)
	adminEmail  string // where the "new lead" alert goes (config.SignupNotifyEmail)
}

func NewService(repo *Repository, g GCal, n notify.Notifier, ownerUserID, adminEmail string) *Service {
	return &Service{repo: repo, gcal: g, notifier: n, ownerUserID: ownerUserID, adminEmail: adminEmail}
}

func loadTZ(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("COT", -5*3600)
	}
	return loc
}

// Availability computes free slots between fromDate and toDate (inclusive),
// YYYY-MM-DD in the configured timezone.
func (s *Service) Availability(ctx context.Context, fromDate, toDate string) ([]DayAvailability, error) {
	cfg, err := s.repo.Settings(ctx)
	if err != nil {
		return nil, err
	}
	tz := loadTZ(cfg.Timezone)

	from, err := time.ParseInLocation("2006-01-02", fromDate, tz)
	if err != nil {
		return nil, err
	}
	to, err := time.ParseInLocation("2006-01-02", toDate, tz)
	if err != nil {
		return nil, err
	}
	today := time.Now().In(tz).Truncate(24 * time.Hour)
	if from.Before(today) {
		from = today
	}
	if to.Before(from) {
		return []DayAvailability{}, nil
	}
	if to.Sub(from) > maxWindowDays*24*time.Hour {
		to = from.Add(maxWindowDays * 24 * time.Hour)
	}

	dur := cfg.DurationMin
	if dur <= 0 {
		dur = 30
	}
	busy, err := s.busyWindow(ctx, from.UTC(), to.AddDate(0, 0, 1).UTC(), dur)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	out := []DayAvailability{}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if !contains(cfg.ActiveDays, dayLabels[int(d.Weekday())]) {
			continue
		}
		slots := daySlots(d, cfg, tz, busy, now)
		if len(slots) > 0 {
			out = append(out, DayAvailability{Date: d.Format("2006-01-02"), Slots: slots})
		}
	}
	return out, nil
}

// busyWindow gathers every occupied interval in [fromUTC, toUTC): existing lead
// bookings plus the owner's Google Calendar events (so personal blocks hide the
// slot). A Google read failure is non-fatal — it degrades to bookings-only
// rather than breaking the public page.
func (s *Service) busyWindow(ctx context.Context, fromUTC, toUTC time.Time, dur int) ([]busyInterval, error) {
	booked, err := s.repo.BookedSlots(ctx, fromUTC, toUTC)
	if err != nil {
		return nil, err
	}
	out := make([]busyInterval, 0, len(booked))
	for _, b := range booked {
		out = append(out, busyInterval{start: b, end: b.Add(time.Duration(dur) * time.Minute)})
	}
	if s.gcal != nil && s.ownerUserID != "" {
		gbusy, gerr := s.gcal.BusyTimes(ctx, s.ownerUserID, fromUTC, toUTC)
		if gerr != nil {
			slog.Default().Warn("leadbooking: google busy read failed", "err", gerr)
		}
		for _, g := range gbusy {
			out = append(out, busyInterval{start: g.Start, end: g.End})
		}
	}
	return out, nil
}

func daySlots(day time.Time, cfg Settings, tz *time.Location, busy []busyInterval, now time.Time) []string {
	start := toMinutes(cfg.StartHour)
	end := toMinutes(cfg.EndHour)
	if start < 0 || end <= start {
		return nil
	}
	step := cfg.SlotStepMin
	if step <= 0 {
		step = 30
	}
	dur := cfg.DurationMin
	if dur <= 0 {
		dur = step
	}

	// Counting the slots rather than walking the clock, so the iteration count
	// cannot depend on `step` being positive. Not belt-and-braces: `step` comes
	// from tenant settings, and the only thing between a zero there and a loop
	// that never advances was the guard above.
	//
	// Both halves of this were taught by mutation testing. Flipping that guard's
	// `<=` made the original `m += step` stop advancing while it kept
	// allocating: the test binary grew past 9 GB and the kernel took the CI
	// runner down with it, so the assertion already written to catch a broken
	// guard never got to run. And the obvious repair — `for n := 0; n < max;
	// n++` — only moved the hang, because `n++` flipped to `n--` never ends
	// either. `range` has no increment to flip. Written this way every one of
	// those mutants returns a wrong list instead of a dead machine, and the
	// tests that were always there kill them.
	var slots []string
	for n := range maxSlotsPerDay {
		m := start + n*step
		if m+dur > end {
			break
		}
		slotStart := time.Date(day.Year(), day.Month(), day.Day(), m/60, m%60, 0, 0, tz)
		slotEnd := slotStart.Add(time.Duration(dur) * time.Minute)
		if !slotStart.After(now) {
			continue // past
		}
		if overlapsBusy(slotStart, slotEnd, busy) {
			continue
		}
		slots = append(slots, slotStart.Format("15:04"))
	}
	return slots
}

func overlapsBusy(start, end time.Time, busy []busyInterval) bool {
	for _, b := range busy {
		if start.Before(b.end) && b.start.Before(end) {
			return true
		}
	}
	return false
}

// Book validates the slot, records the booking, creates the calendar event and
// fires confirmation + alert emails. Returns ErrNotOffered / ErrSlotTaken on the
// two rejectable conditions.
func (s *Service) Book(ctx context.Context, in BookRequest) (BookResult, error) {
	cfg, err := s.repo.Settings(ctx)
	if err != nil {
		return BookResult{}, err
	}
	tz := loadTZ(cfg.Timezone)

	when, err := time.ParseInLocation("2006-01-02T15:04", in.Date+"T"+in.Time, tz)
	if err != nil {
		return BookResult{}, ErrNotOffered
	}
	if !when.After(time.Now()) {
		return BookResult{}, ErrNotOffered
	}
	dur := cfg.DurationMin
	if dur <= 0 {
		dur = 30
	}

	// The requested time must be a slot the schedule offers on that day…
	day := time.Date(when.Year(), when.Month(), when.Day(), 0, 0, 0, 0, tz)
	if !contains(cfg.ActiveDays, dayLabels[int(day.Weekday())]) || !contains(daySlots(day, cfg, tz, nil, time.Now()), in.Time) {
		return BookResult{}, ErrNotOffered
	}
	// …and it must still be free of other bookings and Google Calendar events.
	// (The DB unique index guards lead-vs-lead races; this also catches a clash
	// with a personal calendar block, which has no DB constraint.)
	busy, err := s.busyWindow(ctx, day.UTC(), day.AddDate(0, 0, 1).UTC(), dur)
	if err != nil {
		return BookResult{}, err
	}
	if !contains(daySlots(day, cfg, tz, busy, time.Now()), in.Time) {
		return BookResult{}, ErrSlotTaken
	}

	id, err := s.repo.Insert(ctx, LeadBooking{
		Name: in.Name, Email: in.Email, Phone: in.Phone, Message: in.Message,
		ScheduledAt: when.UTC(), DurationMin: dur,
	})
	if err != nil {
		return BookResult{}, err // ErrSlotTaken or a real DB error
	}

	// Create the calendar event synchronously so we can hand the Meet link back.
	// A failure here never voids the booking — the lead is still recorded.
	var meetURL string
	if s.gcal != nil && s.ownerUserID != "" {
		details := fmt.Sprintf("Lead: %s\nCorreo: %s", in.Name, in.Email)
		if in.Phone != "" {
			details += "\nTeléfono: " + in.Phone
		}
		if in.Message != "" {
			details += "\nMensaje: " + in.Message
		}
		eventID, meet, gerr := s.gcal.PushLeadEvent(ctx, s.ownerUserID, gcal.LeadEventInput{
			Title:      "Llamada Chapni · " + in.Name,
			Details:    details,
			Start:      when,
			DurMin:     dur,
			WithMeet:   true,
			GuestEmail: in.Email,
		})
		if gerr != nil {
			slog.Default().Warn("leadbooking: calendar event failed", "err", gerr)
		} else {
			meetURL = meet
			if e := s.repo.SetEvent(ctx, id, eventID, meet); e != nil {
				slog.Default().Warn("leadbooking: persist event failed", "err", e)
			}
		}
	}

	whenLabel := when.Format("Monday 2 de January, 3:04 pm")
	d := notify.LeadBookingDetails{
		Name: in.Name, Email: in.Email, Phone: in.Phone, Message: in.Message,
		When: whenLabel, MeetURL: meetURL,
	}
	if s.notifier != nil {
		go s.notifier.LeadBookingConfirmed(context.Background(), d)
		if s.adminEmail != "" {
			go s.notifier.LeadBookingAlert(context.Background(), s.adminEmail, d)
		}
	}

	return BookResult{When: whenLabel, MeetURL: meetURL}, nil
}

func (s *Service) GetSettings(ctx context.Context) (Settings, error) { return s.repo.Settings(ctx) }
func (s *Service) UpdateSettings(ctx context.Context, st Settings) error {
	return s.repo.UpdateSettings(ctx, st)
}
func (s *Service) List(ctx context.Context) ([]LeadBooking, error) { return s.repo.List(ctx, 200) }

// toMinutes parses "HH:MM" into minutes since midnight; -1 on empty/invalid.
func toMinutes(hhmm string) int {
	hhmm = strings.TrimSpace(hhmm)
	if hhmm == "24:00" {
		return 24 * 60
	}
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return -1
	}
	return t.Hour()*60 + t.Minute()
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
