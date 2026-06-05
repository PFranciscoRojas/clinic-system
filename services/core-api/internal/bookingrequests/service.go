package bookingrequests

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound     = errors.New("booking request not found")
	ErrInvalidInput = errors.New("invalid input")
	ErrOrgNotFound  = errors.New("organization not found")
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*BookingRequest, error) {
	if strings.TrimSpace(in.FirstName) == "" || strings.TrimSpace(in.LastName) == "" || strings.TrimSpace(in.Email) == "" {
		return nil, ErrInvalidInput
	}

	var br BookingRequest
	err := s.pool.QueryRow(ctx, `
		INSERT INTO booking_requests
			(organization_id, first_name, last_name, email, phone, modality,
			 preferred_date, preferred_time, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, organization_id, first_name, last_name, email, phone,
		          modality, preferred_date::text, preferred_time, notes, status, created_at`,
		in.OrganizationID, in.FirstName, in.LastName, in.Email,
		nullStr(in.Phone), in.Modality,
		in.PreferredDate, in.PreferredTime, in.Notes,
	).Scan(
		&br.ID, &br.OrganizationID, &br.FirstName, &br.LastName, &br.Email,
		&br.Phone, &br.Modality, &br.PreferredDate, &br.PreferredTime,
		&br.Notes, &br.Status, &br.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &br, nil
}

func (s *Service) OrgIDBySlug(ctx context.Context, slug string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `SELECT id FROM organizations WHERE slug = $1`, slug).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrOrgNotFound
	}
	return id, err
}

func (s *Service) List(ctx context.Context, orgID string, status *Status) ([]*BookingRequest, error) {
	query := `
		SELECT id, organization_id, first_name, last_name, email, phone,
		       modality, preferred_date::text, preferred_time, notes, status,
		       staff_note, created_at, resolved_at, resolved_by
		FROM booking_requests
		WHERE organization_id = $1`
	args := []any{orgID}
	if status != nil {
		query += ` AND status = $2`
		args = append(args, string(*status))
	}
	query += ` ORDER BY created_at DESC LIMIT 100`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*BookingRequest
	for rows.Next() {
		var br BookingRequest
		if err := rows.Scan(
			&br.ID, &br.OrganizationID, &br.FirstName, &br.LastName, &br.Email,
			&br.Phone, &br.Modality, &br.PreferredDate, &br.PreferredTime,
			&br.Notes, &br.Status, &br.StaffNote, &br.CreatedAt,
			&br.ResolvedAt, &br.ResolvedBy,
		); err != nil {
			return nil, err
		}
		out = append(out, &br)
	}
	return out, rows.Err()
}

func (s *Service) Resolve(ctx context.Context, in ResolveInput) (*BookingRequest, error) {
	now := time.Now()
	var br BookingRequest
	err := s.pool.QueryRow(ctx, `
		UPDATE booking_requests
		SET status = $1, staff_note = $2, resolved_at = $3, resolved_by = $4
		WHERE id = $5 AND organization_id = $6 AND status = 'PENDING'
		RETURNING id, organization_id, first_name, last_name, email, phone,
		          modality, preferred_date::text, preferred_time, notes, status,
		          staff_note, created_at, resolved_at, resolved_by`,
		string(in.Status), in.StaffNote, now, in.ResolvedBy,
		in.ID, in.OrganizationID,
	).Scan(
		&br.ID, &br.OrganizationID, &br.FirstName, &br.LastName, &br.Email,
		&br.Phone, &br.Modality, &br.PreferredDate, &br.PreferredTime,
		&br.Notes, &br.Status, &br.StaffNote, &br.CreatedAt,
		&br.ResolvedAt, &br.ResolvedBy,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &br, nil
}

func (s *Service) OrgAdminEmail(ctx context.Context, orgID string) (string, error) {
	var email string
	err := s.pool.QueryRow(ctx, `
		SELECT u.email FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		JOIN roles r ON r.id = ur.role_id
		WHERE u.organization_id = $1 AND r.name = 'CLINIC_ADMIN'
		LIMIT 1`,
		orgID,
	).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return email, err
}

func (s *Service) PendingCount(ctx context.Context, orgID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM booking_requests WHERE organization_id = $1 AND status = 'PENDING'`,
		orgID,
	).Scan(&n)
	return n, err
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
