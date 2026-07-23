// Package gcal handles per-professional Google Calendar OAuth connections and
// one-way appointment sync (SGHCP → Google Calendar).
package gcal

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	gcalapi "google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"sghcp/core-api/internal/shared/crypto"
)

const calendarScope = "https://www.googleapis.com/auth/calendar.events"

// Syncer handles Google Calendar OAuth state and event push/delete operations.
type Syncer struct {
	pool      *pgxpool.Pool
	km        *crypto.KeyManager
	cfg       *oauth2.Config
	jwtSecret []byte
	appURL    string // public base URL of the SPA, e.g. https://api.marcelachapues.com
	logger    *slog.Logger
}

func New(pool *pgxpool.Pool, km *crypto.KeyManager, clientID, clientSecret, appURL string, jwtSecret []byte, logger *slog.Logger) *Syncer {
	redirectURL := strings.TrimRight(appURL, "/") + "/api/v1/integrations/google/callback"
	return &Syncer{
		pool: pool,
		km:   km,
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{calendarScope},
			Endpoint:     google.Endpoint,
		},
		jwtSecret: jwtSecret,
		appURL:    appURL,
		logger:    logger,
	}
}

// Enabled reports whether Google Calendar integration is configured.
func (s *Syncer) Enabled() bool {
	return s.cfg.ClientID != "" && s.cfg.ClientSecret != ""
}

// ── OAuth state helpers ───────────────────────────────────────────────────────

func (s *Syncer) signState(userID string) string {
	mac := hmac.New(sha256.New, s.jwtSecret)
	mac.Write([]byte(userID))
	return userID + ":" + hex.EncodeToString(mac.Sum(nil))
}

func (s *Syncer) verifyState(state string) (userID string, ok bool) {
	idx := strings.LastIndex(state, ":")
	if idx < 0 {
		return "", false
	}
	userID = state[:idx]
	expected := s.signState(userID)
	return userID, hmac.Equal([]byte(state), []byte(expected))
}

// AuthURL returns the Google OAuth consent URL for the given user.
func (s *Syncer) AuthURL(userID string) string {
	return s.cfg.AuthCodeURL(s.signState(userID),
		oauth2.AccessTypeOffline,
		oauth2.ApprovalForce,
	)
}

// ExchangeCallback validates the OAuth callback, exchanges the code for tokens,
// and persists the encrypted refresh token. Returns the google email.
func (s *Syncer) ExchangeCallback(ctx context.Context, state, code string) (userID string, err error) {
	userID, ok := s.verifyState(state)
	if !ok {
		return "", errors.New("gcal: invalid oauth state")
	}
	token, err := s.cfg.Exchange(ctx, code)
	if err != nil {
		return "", fmt.Errorf("gcal: token exchange: %w", err)
	}

	// Fetch the Google account email via tokeninfo.
	email := ""
	if ti, e := s.tokenInfo(ctx, token); e == nil {
		email = ti
	}

	if err := s.saveConnection(ctx, userID, email, token.RefreshToken); err != nil {
		return "", err
	}
	return userID, nil
}

func (s *Syncer) tokenInfo(ctx context.Context, token *oauth2.Token) (string, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))
	resp, err := client.Get("https://www.googleapis.com/oauth2/v3/userinfo")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var info struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(resp.Body, &info); err != nil {
		return "", err
	}
	return info.Email, nil
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type Connection struct {
	GoogleEmail string
	CalendarID  string
}

func (s *Syncer) GetConnection(ctx context.Context, userID string) (Connection, bool) {
	var email, calID string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(google_email,''), calendar_id
		FROM professional_google_calendar WHERE user_id = $1
	`, userID).Scan(&email, &calID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Connection{}, false
	}
	if err != nil {
		return Connection{}, false
	}
	return Connection{GoogleEmail: email, CalendarID: calID}, true
}

func (s *Syncer) saveConnection(ctx context.Context, userID, email, refreshToken string) error {
	enc, keySource, err := s.km.SealSecret([]byte(refreshToken))
	if err != nil {
		return fmt.Errorf("gcal: seal token: %w", err)
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO professional_google_calendar (user_id, google_email, refresh_token_enc, key_source)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id) DO UPDATE SET
			google_email = EXCLUDED.google_email,
			refresh_token_enc = EXCLUDED.refresh_token_enc,
			key_source = EXCLUDED.key_source,
			updated_at = NOW()
	`, userID, email, enc, keySource)
	return err
}

func (s *Syncer) loadRefreshToken(ctx context.Context, userID string) (calendarID string, token *oauth2.Token, err error) {
	var enc []byte
	var keySource, calID string
	err = s.pool.QueryRow(ctx, `
		SELECT refresh_token_enc, key_source, calendar_id
		FROM professional_google_calendar WHERE user_id = $1
	`, userID).Scan(&enc, &keySource, &calID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, nil // not connected
	}
	if err != nil {
		return "", nil, err
	}
	plain, err := s.km.OpenSecret(keySource, enc)
	if err != nil {
		return "", nil, fmt.Errorf("gcal: decrypt token: %w", err)
	}
	return calID, &oauth2.Token{RefreshToken: string(plain)}, nil
}

// DeleteConnection removes all synced Google Calendar events for the user and then
// deletes the stored connection. Errors deleting individual events are logged but
// do not abort the disconnect — the local connection is always removed.
func (s *Syncer) DeleteConnection(ctx context.Context, userID string) error {
	if s.Enabled() {
		if _, token, err := s.loadRefreshToken(ctx, userID); err == nil && token != nil {
			rows, err := s.pool.Query(ctx, `
				SELECT event_id FROM appointment_gcal_events WHERE staff_id = $1
			`, userID)
			if err == nil {
				var eventIDs []string
				for rows.Next() {
					var id string
					if rows.Scan(&id) == nil {
						eventIDs = append(eventIDs, id)
					}
				}
				rows.Close()

				if len(eventIDs) > 0 {
					conn, _ := s.GetConnection(ctx, userID)
					calID := conn.CalendarID
					if calID == "" {
						calID = "primary"
					}
					svc, err := gcalapi.NewService(ctx, option.WithTokenSource(s.cfg.TokenSource(ctx, token)))
					if err == nil {
						for _, eid := range eventIDs {
							if err := svc.Events.Delete(calID, eid).Do(); err != nil {
								s.logger.Warn("gcal: disconnect cleanup event", "event_id", eid, "err", err)
							}
						}
					}
				}
			}
		}
	}

	s.pool.Exec(ctx, `DELETE FROM appointment_gcal_events WHERE staff_id = $1`, userID) //nolint:errcheck
	_, err := s.pool.Exec(ctx, `DELETE FROM professional_google_calendar WHERE user_id = $1`, userID)
	return err
}

// ── Calendar event push/cancel ────────────────────────────────────────────────

var bogota = func() *time.Location {
	loc, err := time.LoadLocation("America/Bogota")
	if err != nil {
		return time.FixedZone("COT", -5*3600)
	}
	return loc
}()

// PushCreate creates a Google Calendar event for the appointment.
// No-op if the professional has no active connection. Fire-and-forget.
func (s *Syncer) PushCreate(ctx context.Context, apptID, staffID, modality string, at time.Time, durMin int) {
	if !s.Enabled() {
		return
	}
	go func() {
		ctx := context.Background()
		calID, token, err := s.loadRefreshToken(ctx, staffID)
		if err != nil || token == nil {
			return
		}
		svc, err := gcalapi.NewService(ctx, option.WithTokenSource(s.cfg.TokenSource(ctx, token)))
		if err != nil {
			s.logger.Warn("gcal: create calendar service failed", "err", err)
			return
		}
		endAt := at.Add(time.Duration(durMin) * time.Minute)
		label := "Presencial"
		if modality == "VIRTUAL" {
			label = "Virtual"
		}
		event := &gcalapi.Event{
			Summary:     "Cita psicológica · " + label,
			Description: "Gestionada desde Chapni",
			Start:       &gcalapi.EventDateTime{DateTime: at.In(bogota).Format(time.RFC3339), TimeZone: "America/Bogota"},
			End:         &gcalapi.EventDateTime{DateTime: endAt.In(bogota).Format(time.RFC3339), TimeZone: "America/Bogota"},
		}
		created, err := svc.Events.Insert(calID, event).Do()
		if err != nil {
			s.logger.Warn("gcal: insert event failed", "staff_id", staffID, "err", err)
			return
		}
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO appointment_gcal_events (appointment_id, staff_id, event_id)
			VALUES ($1, $2, $3) ON CONFLICT (appointment_id) DO UPDATE SET event_id = EXCLUDED.event_id
		`, apptID, staffID, created.Id); err != nil {
			s.logger.Warn("gcal: save event_id failed", "appt_id", apptID, "err", err)
		}
	}()
}

// LeadEventInput carries the data for a lead (sales) call event.
type LeadEventInput struct {
	Title      string    // event summary, e.g. "Llamada Chapni · Ana"
	Details    string    // description body (lead contact + message)
	Start      time.Time // event start (any TZ — rendered in America/Bogota)
	DurMin     int
	WithMeet   bool // request a Google Meet conference link
	GuestEmail string
}

// PushLeadEvent creates a Google Calendar event on the owner's calendar for a
// lead call and returns the event id and the Meet link (when requested). Unlike
// PushCreate it runs synchronously and returns the result, because the caller
// hands the Meet link straight back to the lead. Returns empty strings with no
// error when the owner has no active connection (the booking still stands).
func (s *Syncer) PushLeadEvent(ctx context.Context, ownerUserID string, in LeadEventInput) (eventID, meetURL string, err error) {
	if !s.Enabled() || ownerUserID == "" {
		return "", "", nil
	}
	calID, token, err := s.loadRefreshToken(ctx, ownerUserID)
	if err != nil || token == nil {
		return "", "", err
	}
	svc, err := gcalapi.NewService(ctx, option.WithTokenSource(s.cfg.TokenSource(ctx, token)))
	if err != nil {
		return "", "", err
	}
	if calID == "" {
		calID = "primary"
	}
	endAt := in.Start.Add(time.Duration(in.DurMin) * time.Minute)
	event := &gcalapi.Event{
		Summary:     in.Title,
		Description: in.Details,
		Start:       &gcalapi.EventDateTime{DateTime: in.Start.In(bogota).Format(time.RFC3339), TimeZone: "America/Bogota"},
		End:         &gcalapi.EventDateTime{DateTime: endAt.In(bogota).Format(time.RFC3339), TimeZone: "America/Bogota"},
	}
	if in.GuestEmail != "" {
		event.Attendees = []*gcalapi.EventAttendee{{Email: in.GuestEmail}}
	}
	// SendUpdates=none: Chapni sends its own branded confirmation, so we don't
	// want Google emailing the attendee a second, unbranded invite.
	call := svc.Events.Insert(calID, event).SendUpdates("none")
	if in.WithMeet {
		event.ConferenceData = &gcalapi.ConferenceData{
			CreateRequest: &gcalapi.CreateConferenceRequest{
				RequestId:             "lead-" + strconv.FormatInt(in.Start.UnixNano(), 36),
				ConferenceSolutionKey: &gcalapi.ConferenceSolutionKey{Type: "hangoutsMeet"},
			},
		}
		call = call.ConferenceDataVersion(1)
	}
	created, err := call.Do()
	if err != nil {
		return "", "", err
	}
	return created.Id, created.HangoutLink, nil
}

// BusyInterval is an occupied time range on the owner's calendar.
type BusyInterval struct {
	Start time.Time
	End   time.Time
}

// BusyTimes returns the owner's busy intervals between from and to, read from
// their connected Google Calendar via the existing calendar.events scope (no
// extra consent needed — that scope already grants reading events). Events
// marked "Free" (transparent) or cancelled are ignored; all-day events block
// their whole span. Returns nil with no error when the owner has no connection,
// so callers degrade to bookings-only availability instead of failing.
func (s *Syncer) BusyTimes(ctx context.Context, ownerUserID string, from, to time.Time) ([]BusyInterval, error) {
	if !s.Enabled() || ownerUserID == "" {
		return nil, nil
	}
	calID, token, err := s.loadRefreshToken(ctx, ownerUserID)
	if err != nil || token == nil {
		return nil, err
	}
	if calID == "" {
		calID = "primary"
	}
	svc, err := gcalapi.NewService(ctx, option.WithTokenSource(s.cfg.TokenSource(ctx, token)))
	if err != nil {
		return nil, err
	}
	var out []BusyInterval
	call := svc.Events.List(calID).
		TimeMin(from.Format(time.RFC3339)).
		TimeMax(to.Format(time.RFC3339)).
		SingleEvents(true). // expand recurring events into instances
		ShowDeleted(false).
		MaxResults(2500).
		OrderBy("startTime")
	err = call.Pages(ctx, func(page *gcalapi.Events) error {
		for _, ev := range page.Items {
			if ev.Transparency == "transparent" || ev.Status == "cancelled" {
				continue
			}
			if st, en, ok := eventInterval(ev); ok {
				out = append(out, BusyInterval{Start: st, End: en})
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// eventInterval extracts a [start,end) range from a calendar event, handling
// both timed events (DateTime) and all-day events (Date, end-exclusive).
func eventInterval(ev *gcalapi.Event) (time.Time, time.Time, bool) {
	if ev.Start == nil || ev.End == nil {
		return time.Time{}, time.Time{}, false
	}
	if ev.Start.DateTime != "" && ev.End.DateTime != "" {
		st, e1 := time.Parse(time.RFC3339, ev.Start.DateTime)
		en, e2 := time.Parse(time.RFC3339, ev.End.DateTime)
		if e1 == nil && e2 == nil {
			return st, en, true
		}
		return time.Time{}, time.Time{}, false
	}
	if ev.Start.Date != "" && ev.End.Date != "" {
		st, e1 := time.ParseInLocation("2006-01-02", ev.Start.Date, bogota)
		en, e2 := time.ParseInLocation("2006-01-02", ev.End.Date, bogota)
		if e1 == nil && e2 == nil {
			return st, en, true
		}
	}
	return time.Time{}, time.Time{}, false
}

// DeleteLeadEvent removes a previously created lead event (best-effort, used on
// cancellation). No-op when the owner has no connection or the id is empty.
func (s *Syncer) DeleteLeadEvent(ctx context.Context, ownerUserID, eventID string) error {
	if !s.Enabled() || ownerUserID == "" || eventID == "" {
		return nil
	}
	calID, token, err := s.loadRefreshToken(ctx, ownerUserID)
	if err != nil || token == nil {
		return err
	}
	if calID == "" {
		calID = "primary"
	}
	svc, err := gcalapi.NewService(ctx, option.WithTokenSource(s.cfg.TokenSource(ctx, token)))
	if err != nil {
		return err
	}
	return svc.Events.Delete(calID, eventID).Do()
}

// PushCancel deletes the appointment's Google Calendar event.
// No-op if the appointment was never synced. Fire-and-forget.
func (s *Syncer) PushCancel(ctx context.Context, apptID string) {
	if !s.Enabled() {
		return
	}
	go func() {
		ctx := context.Background()
		var staffID, eventID string
		err := s.pool.QueryRow(ctx, `
			SELECT staff_id, event_id FROM appointment_gcal_events WHERE appointment_id = $1
		`, apptID).Scan(&staffID, &eventID)
		if errors.Is(err, pgx.ErrNoRows) {
			return
		}
		if err != nil {
			s.logger.Warn("gcal: load event_id failed", "appt_id", apptID, "err", err)
			return
		}
		_, token, err := s.loadRefreshToken(ctx, staffID)
		if err != nil || token == nil {
			return
		}
		svc, err := gcalapi.NewService(ctx, option.WithTokenSource(s.cfg.TokenSource(ctx, token)))
		if err != nil {
			return
		}
		conn, _ := s.GetConnection(ctx, staffID)
		calID := conn.CalendarID
		if calID == "" {
			calID = "primary"
		}
		if err := svc.Events.Delete(calID, eventID).Do(); err != nil {
			s.logger.Warn("gcal: delete event failed", "event_id", eventID, "err", err)
		}
	}()
}
