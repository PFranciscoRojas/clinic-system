package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"sghcp/core-api/internal/auth"
)

// CreateOrgWithOwner provisions a brand-new tenant and its first user in a
// single transaction: the organization (trialing), the owner user (unverified),
// and the owner's CLINIC_ADMIN + PROFESSIONAL role grants. It returns the new
// org id, the slug actually assigned (a numeric suffix is appended on
// collision), and the user id.
func (r *Repository) CreateOrgWithOwner(ctx context.Context, p auth.CreateOrgParams) (orgID, slug, userID string, err error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", "", "", fmt.Errorf("begin signup tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck — no-op after a successful Commit

	trialEnds := time.Now().Add(time.Duration(p.TrialDays) * 24 * time.Hour)

	// Try the base slug first, then base-2, base-3, … until one is free. The
	// unique index on organizations.slug is the source of truth; we retry only
	// on its violation so a concurrent signup can't slip a duplicate past us.
	slug = p.BaseSlug
	for attempt := 1; ; attempt++ {
		err = tx.QueryRow(ctx, `
			INSERT INTO organizations
				(name, slug, plan, subscription_status, trial_ends_at)
			VALUES ($1, $2, 'STARTER', 'trialing', $3)
			RETURNING id
		`, p.OrgName, slug, trialEnds).Scan(&orgID)
		if err == nil {
			break
		}
		if isUniqueViolation(err, "organizations_slug_key") && attempt < 50 {
			slug = fmt.Sprintf("%s-%d", p.BaseSlug, attempt+1)
			continue
		}
		return "", "", "", fmt.Errorf("insert organization: %w", err)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO users (organization_id, email, email_hash, password_hash, display_name)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, orgID, p.Email, hashEmail(p.Email), p.PasswordHash, p.DisplayName).Scan(&userID)
	if err != nil {
		if isUniqueViolation(err, "users_email_hash_global_uq") {
			return "", "", "", auth.ErrEmailAlreadyExists
		}
		return "", "", "", fmt.Errorf("insert owner user: %w", err)
	}

	// The owner runs their own one-person clinic: full admin + clinical access.
	for _, role := range []string{"CLINIC_ADMIN", "PROFESSIONAL"} {
		var roleID string
		if err = tx.QueryRow(ctx, `SELECT id FROM roles WHERE name = $1`, role).Scan(&roleID); err != nil {
			return "", "", "", fmt.Errorf("find role %q: %w", role, err)
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO user_roles (organization_id, user_id, role_id, assigned_by)
			VALUES ($1, $2, $3, $4)
		`, orgID, userID, roleID, userID); err != nil {
			return "", "", "", fmt.Errorf("assign role %q: %w", role, err)
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return "", "", "", fmt.Errorf("commit signup tx: %w", err)
	}
	return orgID, slug, userID, nil
}

// MarkEmailVerified stamps email_verified_at for a user. Idempotent: a second
// call on an already-verified user is a no-op (RowsAffected 0 is not an error).
func (r *Repository) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET email_verified_at = NOW(), updated_at = NOW()
		 WHERE id = $1 AND email_verified_at IS NULL`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("mark email verified: %w", err)
	}
	return nil
}

// FindForLogin resolves a user by email alone (no org slug), loading everything
// the login flow needs: credentials, lockout state, verification status, and the
// full role/permission set for JWT issuance. Returns ErrUserNotFound when the
// address is unknown.
func (r *Repository) FindForLogin(ctx context.Context, email string) (*auth.User, error) {
	u := &auth.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id, organization_id, email, display_name, password_hash,
		       is_active, failed_attempts, locked_until, email_verified_at
		FROM users
		WHERE email_hash = $1
	`, hashEmail(email)).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.DisplayName, &u.PasswordHash,
		&u.IsActive, &u.FailedAttempts, &u.LockedUntil, &u.EmailVerifiedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, auth.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user for login: %w", err)
	}
	if err := r.loadRolesPerms(ctx, u); err != nil {
		return nil, err
	}
	return u, nil
}

// loadRolesPerms fills u.Roles and u.Permissions from the user's role grants.
func (r *Repository) loadRolesPerms(ctx context.Context, u *auth.User) error {
	rows, err := r.db.Query(ctx, `
		SELECT r.name FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
	`, u.ID)
	if err != nil {
		return fmt.Errorf("loading roles: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return err
		}
		u.Roles = append(u.Roles, role)
	}

	permRows, err := r.db.Query(ctx, `
		SELECT DISTINCT p.code FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1
	`, u.ID)
	if err != nil {
		return fmt.Errorf("loading permissions: %w", err)
	}
	defer permRows.Close()
	for permRows.Next() {
		var code string
		if err := permRows.Scan(&code); err != nil {
			return err
		}
		u.Permissions = append(u.Permissions, code)
	}
	return nil
}

// isUniqueViolation reports whether err is a Postgres unique-violation on the
// given constraint/index name.
func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}
