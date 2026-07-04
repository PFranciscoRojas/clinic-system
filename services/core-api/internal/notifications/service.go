// Package notifications is the in-app notification inbox (the topbar bell).
// It stores per-user, tenant-scoped alerts that surface work needing attention
// (a ready AI draft, a new paid booking, a booking conflict). Patient-facing
// emails live in internal/notify — this is strictly in-app.
//
// PII CONSTRAINT: the notifications table is not encrypted. Titles and bodies
// must stay generic (no patient names/document/phone); the detail lives behind
// the `link` route and loads under RLS.
package notifications

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/dbctx"
)

// Notification kinds. Keep in sync with the frontend icon/label map.
const (
	KindAIDraftReady    = "AI_DRAFT_READY"
	KindNewPatient      = "NEW_PATIENT"
	KindBookingNew      = "BOOKING_NEW"
	KindBookingConflict = "BOOKING_CONFLICT"
)

// Service writes and reads notifications. It holds the raw pool so background
// emitters (which run off the request goroutine, without a tenant-scoped
// connection in context) can pin the org's RLS scope themselves.
type Service struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func New(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, logger: slog.Default()}
}

// Notification is one inbox row.
type Notification struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Link      *string    `json:"link"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// Emit stores one notification for a single recipient. Fire-and-forget: it runs
// in its own goroutine and pins the org's RLS scope, so callers on a request
// path (or in another background goroutine) can call it without ceremony.
// Errors are logged, never returned — a failed notification must not break the
// action that triggered it.
func (s *Service) Emit(orgID, recipientUserID, kind, title, body, link string) {
	if orgID == "" || recipientUserID == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := dbctx.WithOrgScope(ctx, s.pool, orgID, func(ctx context.Context) error {
			_, e := dbctx.From(ctx, s.pool).Exec(ctx, `
				INSERT INTO notifications
					(organization_id, recipient_user_id, kind, title, body, link)
				VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
			`, orgID, recipientUserID, kind, title, body, link)
			return e
		})
		if err != nil {
			s.logger.Error("notification emit failed", "err", err, "kind", kind, "org", orgID)
		}
	}()
}

// EmitOrgAdmins fans a notification out to every active CLINIC_ADMIN in the org,
// skipping any user id in exclude (e.g. the actor who triggered the event, or a
// professional already notified directly). Fire-and-forget.
func (s *Service) EmitOrgAdmins(orgID, kind, title, body, link string, exclude ...string) {
	if orgID == "" {
		return
	}
	skip := make(map[string]struct{}, len(exclude))
	for _, id := range exclude {
		if id != "" {
			skip[id] = struct{}{}
		}
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		ids, err := s.adminUserIDs(ctx, orgID)
		if err != nil {
			s.logger.Error("notification admin lookup failed", "err", err, "org", orgID)
			return
		}
		for _, id := range ids {
			if _, ok := skip[id]; ok {
				continue
			}
			s.Emit(orgID, id, kind, title, body, link)
		}
	}()
}

// adminUserIDs returns the active CLINIC_ADMIN user ids for an org. It reads on
// the raw pool (no RLS scope needed — the query filters organization_id
// explicitly, mirroring booking.orgAdminEmails).
func (s *Service) adminUserIDs(ctx context.Context, orgID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id
		FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		JOIN roles r       ON r.id = ur.role_id
		WHERE u.organization_id = $1 AND r.name = 'CLINIC_ADMIN' AND u.is_active
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out, rows.Err()
}

// list returns the recipient's most recent notifications (RLS pins the org).
func (s *Service) list(ctx context.Context, recipientUserID string, limit int) ([]Notification, error) {
	rows, err := dbctx.From(ctx, s.pool).Query(ctx, `
		SELECT id, kind, title, body, link, read_at, created_at
		FROM notifications
		WHERE recipient_user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, recipientUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.Link, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// unreadCount returns how many unread notifications the recipient has.
func (s *Service) unreadCount(ctx context.Context, recipientUserID string) (int, error) {
	var n int
	err := dbctx.From(ctx, s.pool).QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE recipient_user_id = $1 AND read_at IS NULL
	`, recipientUserID).Scan(&n)
	return n, err
}

// markRead marks one notification read, scoped to its owner (RLS pins the org).
func (s *Service) markRead(ctx context.Context, recipientUserID, id string) error {
	_, err := dbctx.From(ctx, s.pool).Exec(ctx, `
		UPDATE notifications SET read_at = NOW()
		WHERE id = $1 AND recipient_user_id = $2 AND read_at IS NULL
	`, id, recipientUserID)
	return err
}

// markAllRead marks every unread notification read for the recipient.
func (s *Service) markAllRead(ctx context.Context, recipientUserID string) error {
	_, err := dbctx.From(ctx, s.pool).Exec(ctx, `
		UPDATE notifications SET read_at = NOW()
		WHERE recipient_user_id = $1 AND read_at IS NULL
	`, recipientUserID)
	return err
}
