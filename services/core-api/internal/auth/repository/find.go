package repository

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/auth"
)

// FindByEmail resolves org slug → user → roles + permissions.
// Returns auth.ErrInvalidCredentials for any not-found case
// so callers never learn which step failed.
func (r *Repository) FindByEmail(ctx context.Context, orgSlug, email string) (*auth.User, error) {
	var orgID string
	err := r.db.QueryRow(ctx,
		`SELECT id FROM organizations WHERE slug = $1 AND is_active = TRUE`,
		orgSlug,
	).Scan(&orgID)
	if err != nil {
		return nil, auth.ErrInvalidCredentials
	}

	u := &auth.User{}
	err = r.db.QueryRow(ctx, `
		SELECT id, organization_id, password_hash, is_active, failed_attempts, locked_until
		FROM users
		WHERE organization_id = $1 AND email_hash = $2
	`, orgID, hashEmail(email)).Scan(
		&u.ID, &u.OrganizationID, &u.PasswordHash,
		&u.IsActive, &u.FailedAttempts, &u.LockedUntil,
	)
	if err != nil {
		return nil, auth.ErrInvalidCredentials
	}

	rows, err := r.db.Query(ctx, `
		SELECT r.name
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
	`, u.ID)
	if err != nil {
		return nil, fmt.Errorf("loading roles: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		u.Roles = append(u.Roles, role)
	}

	permRows, err := r.db.Query(ctx, `
		SELECT DISTINCT p.code
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1
	`, u.ID)
	if err != nil {
		return nil, fmt.Errorf("loading permissions: %w", err)
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
