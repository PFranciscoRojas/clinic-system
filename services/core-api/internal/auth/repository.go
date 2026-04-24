package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var errInvalidCredentials = errors.New("invalid credentials")

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// findUserByEmail resolves org slug → user → roles + permissions in three queries.
// Returns errInvalidCredentials for any not-found case to avoid leaking which step failed.
func (r *Repository) findUserByEmail(ctx context.Context, orgSlug, email string) (*userRecord, error) {
	emailHash := hashEmail(email)

	var orgID string
	err := r.db.QueryRow(ctx,
		`SELECT id FROM organizations WHERE slug = $1 AND is_active = TRUE`,
		orgSlug,
	).Scan(&orgID)
	if err != nil {
		return nil, errInvalidCredentials
	}

	u := &userRecord{}
	err = r.db.QueryRow(ctx, `
		SELECT id, organization_id, password_hash, is_active, failed_attempts, locked_until
		FROM users
		WHERE organization_id = $1 AND email_hash = $2
	`, orgID, emailHash).Scan(
		&u.ID, &u.OrganizationID, &u.PasswordHash,
		&u.IsActive, &u.FailedAttempts, &u.LockedUntil,
	)
	if err != nil {
		return nil, errInvalidCredentials
	}

	// Load roles
	rows, err := r.db.Query(ctx, `
		SELECT r.name
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
	`, u.ID)
	if err != nil {
		return nil, fmt.Errorf("auth: loading roles: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		u.Roles = append(u.Roles, role)
	}

	// Load permissions (distinct — a user may have multiple roles with overlapping perms)
	permRows, err := r.db.Query(ctx, `
		SELECT DISTINCT p.code
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1
	`, u.ID)
	if err != nil {
		return nil, fmt.Errorf("auth: loading permissions: %w", err)
	}
	defer permRows.Close()
	for permRows.Next() {
		var code string
		if err := permRows.Scan(&code); err != nil {
			return nil, err
		}
		u.Permissions = append(u.Permissions, code)
	}

	return u, nil
}

func (r *Repository) incrementFailedAttempts(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = NOW() WHERE id = $1`,
		userID,
	)
	return err
}

func (r *Repository) lockUser(ctx context.Context, userID string, until time.Time) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET locked_until = $2, updated_at = NOW() WHERE id = $1`,
		userID, until,
	)
	return err
}

func (r *Repository) clearFailedAttempts(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users
		SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, userID)
	return err
}

// writeAuditLog is best-effort — auth failures must not cascade into a 500.
func (r *Repository) writeAuditLog(ctx context.Context, e auditEntry) {
	r.db.Exec(ctx, `
		INSERT INTO audit_log
			(organization_id, user_id, user_email_hash, action, resource_type,
			 ip_address, user_agent, success, error_code)
		VALUES
			($1::uuid, $2::uuid, $3, $4, $5, $6::inet, $7, $8, $9)
	`,
		nullableUUID(e.OrgID),
		nullableUUID(e.UserID),
		e.EmailHash,
		e.Action,
		e.ResourceType,
		nullableText(e.IP),
		nullableText(e.UserAgent),
		e.Success,
		e.ErrorCode,
	)
}

// hashEmail returns the SHA-256 hex digest used as the lookup key.
// Matches the value stored in users.email_hash at registration.
func hashEmail(email string) string {
	h := sha256.Sum256([]byte(email))
	return fmt.Sprintf("%x", h)
}

func nullableUUID(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

func nullableText(s string) any {
	if s == "" {
		return nil
	}
	return s
}
