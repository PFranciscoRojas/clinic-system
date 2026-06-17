// Package reminders sends patient appointment reminders by email (24h / 2h
// before), driven by a background sweep. WhatsApp/SMS are a later wave; this
// engine is email-only and reads per-org preferences from
// organizations.settings.notifications.
package reminders

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/crypto"
)

var bogota = func() *time.Location {
	loc, err := time.LoadLocation("America/Bogota")
	if err != nil {
		return time.FixedZone("COT", -5*3600)
	}
	return loc
}()

const sweepInterval = 10 * time.Minute

// offset pairs a reminder kind with how its due-window is computed. A wide band
// (vs a single instant) tolerates a missed sweep or a brief outage without
// dropping the reminder; the sent-table guarantees it fires at most once.
type offset struct {
	kind     string // stored in appointment_reminders_sent.kind
	hours    int    // passed to the template ("mañana" / "en 2 horas")
	from, to string // SQL interval bounds for scheduled_at relative to now()
	enabled  func(r24, r2 bool) bool
}

var offsets = []offset{
	{kind: "24h", hours: 24, from: "21 hours", to: "24 hours", enabled: func(r24, _ bool) bool { return r24 }},
	{kind: "2h", hours: 2, from: "90 minutes", to: "2 hours", enabled: func(_, r2 bool) bool { return r2 }},
}

type Engine struct {
	pool     *pgxpool.Pool
	km       *crypto.KeyManager
	notifier notify.Notifier
	logger   *slog.Logger
}

func New(pool *pgxpool.Pool, km *crypto.KeyManager, notifier notify.Notifier, logger *slog.Logger) *Engine {
	return &Engine{pool: pool, km: km, notifier: notifier, logger: logger}
}

// Run sweeps on a ticker until ctx is cancelled. One goroutine inside core-api.
func (e *Engine) Run(ctx context.Context) {
	e.logger.Info("reminder engine started", "interval", sweepInterval)
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	e.sweep(ctx) // run once at startup so a restart doesn't wait a full interval
	for {
		select {
		case <-ctx.Done():
			e.logger.Info("reminder engine stopped")
			return
		case <-ticker.C:
			e.sweep(ctx)
		}
	}
}

func (e *Engine) sweep(ctx context.Context) {
	rows, err := e.pool.Query(ctx, `
		SELECT id,
		       COALESCE((settings->'notifications'->>'reminder_24h')::bool, true),
		       COALESCE((settings->'notifications'->>'reminder_2h')::bool, false)
		FROM organizations WHERE is_active`)
	if err != nil {
		e.logger.Error("reminders: list orgs", "err", err)
		return
	}
	type org struct {
		id      string
		r24, r2 bool
	}
	var orgs []org
	for rows.Next() {
		var o org
		if rows.Scan(&o.id, &o.r24, &o.r2) == nil {
			orgs = append(orgs, o)
		}
	}
	rows.Close()

	for _, o := range orgs {
		for _, off := range offsets {
			if !off.enabled(o.r24, o.r2) {
				continue
			}
			e.processOrgOffset(ctx, o.id, off)
		}
	}
}

// processOrgOffset reads the org's due appointments under its RLS scope and
// sends a reminder for each, recording it so it never fires twice.
func (e *Engine) processOrgOffset(ctx context.Context, orgID string, off offset) {
	conn, err := e.pool.Acquire(ctx)
	if err != nil {
		return
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		return
	}
	defer conn.Exec(ctx, `SELECT set_config('app.current_org', '', false)`) //nolint:errcheck

	rows, err := conn.Query(ctx, `
		SELECT a.id, a.guest_name, a.scheduled_at, a.modality::text,
		       a.patient_id IS NOT NULL,
		       p.email_enc, p.first_name_enc, k.encrypted_dek, k.key_source,
		       COALESCE(b.email, '')
		FROM appointments a
		LEFT JOIN patients p ON p.id = a.patient_id
		LEFT JOIN encryption_keys k ON k.id = p.dek_id
		LEFT JOIN bookings b ON b.appointment_id = a.id
		WHERE a.status = 'SCHEDULED'
		  AND a.scheduled_at BETWEEN now() + ($1 || ' ')::interval AND now() + ($2 || ' ')::interval
		  AND NOT EXISTS (
		    SELECT 1 FROM appointment_reminders_sent r
		    WHERE r.appointment_id = a.id AND r.kind = $3)`,
		off.from, off.to, off.kind)
	if err != nil {
		e.logger.Error("reminders: query due", "org", orgID, "err", err)
		return
	}

	type due struct {
		apptID, guestName, modality, guestEmail, keySource string
		scheduledAt                                        time.Time
		hasPatient                                         bool
		emailEnc, firstNameEnc, encDEK                     []byte
	}
	var items []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.apptID, &d.guestName, &d.scheduledAt, &d.modality, &d.hasPatient,
			&d.emailEnc, &d.firstNameEnc, &d.encDEK, &d.keySource, &d.guestEmail); err == nil {
			items = append(items, d)
		}
	}
	rows.Close()

	for _, d := range items {
		email, firstName := d.guestEmail, firstWord(d.guestName)
		if email == "" && d.hasPatient && len(d.emailEnc) > 0 && len(d.encDEK) > 0 {
			if dek, err := e.km.DecryptDEK(d.keySource, d.encDEK); err == nil {
				if b, err := crypto.Open(dek, d.emailEnc); err == nil {
					email = string(b)
				}
				if b, err := crypto.Open(dek, d.firstNameEnc); err == nil {
					firstName = string(b)
				}
				crypto.Zeroize(dek)
			}
		}
		if email == "" {
			continue // nothing to send to
		}

		// Claim the slot first (exactly-once); only send if we won the insert.
		tag, err := conn.Exec(ctx,
			`INSERT INTO appointment_reminders_sent (appointment_id, kind) VALUES ($1, $2)
			 ON CONFLICT DO NOTHING`, d.apptID, off.kind)
		if err != nil || tag.RowsAffected() == 0 {
			continue
		}

		local := d.scheduledAt.In(bogota)
		e.notifier.AppointmentReminder(ctx, notify.BookingDetails{
			OrgID:         orgID,
			FirstName:     firstName,
			PatientEmail:  email,
			Modality:      modalityLabel(d.modality),
			PreferredDate: local.Format("2006-01-02"),
			PreferredTime: local.Format("03:04 pm"),
		}, off.hours)
	}
}

func firstWord(s string) string {
	if i := strings.IndexByte(strings.TrimSpace(s), ' '); i > 0 {
		return s[:i]
	}
	return strings.TrimSpace(s)
}

func modalityLabel(m string) string {
	if m == "VIRTUAL" {
		return "Virtual"
	}
	return "Presencial"
}
