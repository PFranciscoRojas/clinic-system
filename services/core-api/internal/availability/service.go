package availability

import (
	"context"
	"encoding/json"
	"time"
)

const slotStepMin = 30 // offer a slot every 30 min, mirroring the clinic app

// inPersonMinMinutes: in-person sessions are only offered in the afternoon
// (from 2pm Colombia). Virtual sessions use the full configured hours. A booked
// slot of either modality blocks that time for both (one professional, one
// calendar) — handled by querying every appointment regardless of modality.
const inPersonMinMinutes = 14 * 60

// bogota is the clinic's local timezone: working hours are expressed in it,
// while appointments are stored in UTC.
var bogota = mustLoad("America/Bogota")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("COT", -5*3600) // fallback: Colombia is UTC-5, no DST
	}
	return loc
}

// scheduleConfig mirrors services/frontend/src/lib/schedule.ts (ScheduleConfig).
type scheduleConfig struct {
	ActiveDays []string `json:"activeDays"`
	StartHour  string   `json:"startHour"`
	EndHour    string   `json:"endHour"`
	SessionLen int      `json:"sessionLen"`
	BreakStart string   `json:"breakStart"`
	BreakEnd   string   `json:"breakEnd"`
	Buffer     int      `json:"buffer"`
}

func defaultSchedule() scheduleConfig {
	return scheduleConfig{
		ActiveDays: []string{"Lun", "Mar", "Mié", "Jue", "Vie"},
		StartHour:  "08:00", EndHour: "19:00", SessionLen: 50,
		BreakStart: "13:00", BreakEnd: "14:00", Buffer: 10,
	}
}

// dayLabels indexed by Go's time.Weekday (Sunday=0), matching the app's labels.
var dayLabels = []string{"Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"}

// DayAvailability is the free slots offered on one calendar day.
type DayAvailability struct {
	Date  string   `json:"date"`  // YYYY-MM-DD
	Slots []string `json:"slots"` // ["09:00","09:30",…] local time
}

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// Info returns the clinic's public identity for the booking page theme.
func (s *Service) Info(ctx context.Context, slug string) (*OrgPublicInfo, error) {
	return s.repo.PublicInfo(ctx, slug)
}

// Availability returns the free slots between two dates (inclusive) for the
// org's professional, for the given modality. fromDate/toDate are YYYY-MM-DD in
// the clinic's timezone. modality is "IN_PERSON" or "VIRTUAL" (default VIRTUAL).
func (s *Service) Availability(ctx context.Context, slug, modality, fromDate, toDate string) ([]DayAvailability, error) {
	prof, err := s.repo.ResolveBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}

	cfg := defaultSchedule()
	if len(prof.WorkingHours) > 0 {
		var parsed scheduleConfig
		if json.Unmarshal(prof.WorkingHours, &parsed) == nil && parsed.StartHour != "" {
			cfg = parsed
		}
	}

	from, err := time.ParseInLocation("2006-01-02", fromDate, bogota)
	if err != nil {
		return nil, err
	}
	to, err := time.ParseInLocation("2006-01-02", toDate, bogota)
	if err != nil {
		return nil, err
	}
	// Clamp the window to a sane span and not into the past.
	today := time.Now().In(bogota).Truncate(24 * time.Hour)
	if from.Before(today) {
		from = today
	}
	if to.Before(from) {
		return []DayAvailability{}, nil
	}
	if to.Sub(from) > 60*24*time.Hour {
		to = from.Add(60 * 24 * time.Hour)
	}

	busy, err := s.repo.BusyAppointments(ctx, prof.OrgID, prof.StaffID,
		from.UTC(), to.AddDate(0, 0, 1).UTC())
	if err != nil {
		return nil, err
	}

	now := time.Now()
	out := []DayAvailability{}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if !contains(cfg.ActiveDays, dayLabels[int(d.Weekday())]) {
			continue
		}
		slots := s.daySlots(d, cfg, busy, now, modality)
		if len(slots) > 0 {
			out = append(out, DayAvailability{Date: d.Format("2006-01-02"), Slots: slots})
		}
	}
	return out, nil
}

func (s *Service) daySlots(day time.Time, cfg scheduleConfig, busy []Busy, now time.Time, modality string) []string {
	start := toMinutes(cfg.StartHour)
	end := toMinutes(cfg.EndHour)
	if start < 0 {
		start = 8 * 60
	}
	// In-person sessions only in the afternoon.
	if modality == "IN_PERSON" && start < inPersonMinMinutes {
		start = inPersonMinMinutes
	}
	if end < 0 {
		end = 19 * 60
	}
	brkS, brkE := toMinutes(cfg.BreakStart), toMinutes(cfg.BreakEnd)
	sessionLen := cfg.SessionLen
	if sessionLen <= 0 {
		sessionLen = 50
	}
	buffer := time.Duration(cfg.Buffer) * time.Minute

	var slots []string
	for m := start; m < end; m += slotStepMin {
		if brkS >= 0 && brkE > brkS && m >= brkS && m < brkE {
			continue
		}
		slotStart := time.Date(day.Year(), day.Month(), day.Day(), m/60, m%60, 0, 0, bogota)
		slotEnd := slotStart.Add(time.Duration(sessionLen) * time.Minute)
		if !slotStart.After(now) {
			continue // past
		}
		if overlapsBusy(slotStart, slotEnd, busy, buffer) {
			continue
		}
		slots = append(slots, slotStart.Format("15:04"))
	}
	return slots
}

func overlapsBusy(start, end time.Time, busy []Busy, buffer time.Duration) bool {
	for _, b := range busy {
		bs := b.Start.Add(-buffer)
		be := b.Start.Add(time.Duration(b.DurationMin)*time.Minute + buffer)
		if start.Before(be) && bs.Before(end) {
			return true
		}
	}
	return false
}

// toMinutes parses "HH:MM" into minutes since midnight; -1 on empty/invalid.
func toMinutes(hhmm string) int {
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
