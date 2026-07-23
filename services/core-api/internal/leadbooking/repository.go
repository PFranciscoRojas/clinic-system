// Package leadbooking backs the superadmin's public "book a call" agenda
// (/agenda): a lead picks a free slot, we record it, create an event on the
// superadmin's Google Calendar and email both sides. Global and non-tenant — a
// sales lead belongs to no organization — so it queries the pool directly
// without a TenantScope, mirroring the gcal tables.
package leadbooking

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrSlotTaken is returned when the requested slot is already booked (the
// partial unique index on scheduled_at rejects the insert).
var ErrSlotTaken = errors.New("leadbooking: slot taken")

// Settings is the singleton working-hours configuration for the lead agenda.
type Settings struct {
	ActiveDays  []string `json:"active_days"`
	StartHour   string   `json:"start_hour"`
	EndHour     string   `json:"end_hour"`
	SlotStepMin int      `json:"slot_step_min"`
	DurationMin int      `json:"duration_min"`
	Timezone    string   `json:"timezone"`
}

// LeadBooking is a booked discovery call.
type LeadBooking struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone"`
	Message     string    `json:"message"`
	ScheduledAt time.Time `json:"scheduled_at"`
	DurationMin int       `json:"duration_min"`
	Status      string    `json:"status"`
	MeetURL     string    `json:"meet_url"`
	CreatedAt   time.Time `json:"created_at"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) Settings(ctx context.Context) (Settings, error) {
	var s Settings
	err := r.pool.QueryRow(ctx, `
		SELECT active_days, start_hour, end_hour, slot_step_min, duration_min, timezone
		FROM lead_booking_settings WHERE singleton = TRUE
	`).Scan(&s.ActiveDays, &s.StartHour, &s.EndHour, &s.SlotStepMin, &s.DurationMin, &s.Timezone)
	return s, err
}

func (r *Repository) UpdateSettings(ctx context.Context, s Settings) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE lead_booking_settings SET
			active_days = $1, start_hour = $2, end_hour = $3,
			slot_step_min = $4, duration_min = $5, timezone = $6, updated_at = NOW()
		WHERE singleton = TRUE
	`, s.ActiveDays, s.StartHour, s.EndHour, s.SlotStepMin, s.DurationMin, s.Timezone)
	return err
}

// BookedSlots returns the start times of BOOKED calls within [fromUTC, toUTC).
func (r *Repository) BookedSlots(ctx context.Context, fromUTC, toUTC time.Time) ([]time.Time, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT scheduled_at FROM lead_bookings
		WHERE status = 'BOOKED' AND scheduled_at >= $1 AND scheduled_at < $2
	`, fromUTC, toUTC)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Insert creates a BOOKED lead booking. Returns ErrSlotTaken when the slot's
// unique index rejects the row (another lead grabbed it first).
func (r *Repository) Insert(ctx context.Context, b LeadBooking) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO lead_bookings (name, email, phone, message, scheduled_at, duration_min)
		VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), $5, $6)
		RETURNING id
	`, b.Name, b.Email, b.Phone, b.Message, b.ScheduledAt, b.DurationMin).Scan(&id)
	if isUniqueViolation(err) {
		return "", ErrSlotTaken
	}
	return id, err
}

// SetEvent records the created Google Calendar event id and Meet link.
func (r *Repository) SetEvent(ctx context.Context, id, eventID, meetURL string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE lead_bookings SET gcal_event_id = NULLIF($2,''), meet_url = NULLIF($3,'')
		WHERE id = $1
	`, id, eventID, meetURL)
	return err
}

// List returns the most recent bookings for the operator console.
func (r *Repository) List(ctx context.Context, limit int) ([]LeadBooking, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, email, COALESCE(phone,''), COALESCE(message,''),
		       scheduled_at, duration_min, status, COALESCE(meet_url,''), created_at
		FROM lead_bookings ORDER BY scheduled_at DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LeadBooking
	for rows.Next() {
		var b LeadBooking
		if err := rows.Scan(&b.ID, &b.Name, &b.Email, &b.Phone, &b.Message,
			&b.ScheduledAt, &b.DurationMin, &b.Status, &b.MeetURL, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
