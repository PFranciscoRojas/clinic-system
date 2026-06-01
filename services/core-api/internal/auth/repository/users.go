package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/hash"
)

// FindUserByEmailInOrg looks up a user by plain-text email within a specific org,
// including their roles and permissions (needed for JWT issuance).
func (r *Repository) FindUserByEmailInOrg(ctx context.Context, orgID, email string) (*auth.User, error) {
	u := &auth.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id, organization_id, email, display_name, password_hash, is_active, failed_attempts, locked_until
		FROM users
		WHERE organization_id = $1 AND email_hash = $2
	`, orgID, hash.Normalize(email)).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.DisplayName, &u.PasswordHash,
		&u.IsActive, &u.FailedAttempts, &u.LockedUntil,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, auth.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT r.name FROM user_roles ur
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
		SELECT DISTINCT p.code FROM user_roles ur
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

// FindUserByID loads a user by primary key including roles and permissions (for token reissuance).
func (r *Repository) FindUserByID(ctx context.Context, userID string) (*auth.User, error) {
	u := &auth.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id, organization_id, email, display_name, password_hash, is_active, failed_attempts, locked_until
		FROM users WHERE id = $1
	`, userID).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.DisplayName, &u.PasswordHash,
		&u.IsActive, &u.FailedAttempts, &u.LockedUntil,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, auth.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT r.name FROM user_roles ur
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
		SELECT DISTINCT p.code FROM user_roles ur
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

// UpdateDisplayName sets the display_name for the given user.
func (r *Repository) UpdateDisplayName(ctx context.Context, userID, displayName string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE users SET display_name = $2, updated_at = NOW() WHERE id = $1`,
		userID, displayName,
	)
	if err != nil {
		return fmt.Errorf("update display_name: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return auth.ErrUserNotFound
	}
	return nil
}

// FindRoleIDByName returns the UUID of a system role by name (e.g. "PROFESSIONAL").
func (r *Repository) FindRoleIDByName(ctx context.Context, roleName string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx,
		`SELECT id FROM roles WHERE name = $1`,
		roleName,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", auth.ErrRoleNotFound
	}
	if err != nil {
		return "", fmt.Errorf("find role: %w", err)
	}
	return id, nil
}

// CreateUser inserts a new user row and returns the generated UUID.
// email is stored both in the plaintext column (for display) and as a normalised hash (for lookup).
func (r *Repository) CreateUser(ctx context.Context, orgID, email, passwordHash, displayName string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (organization_id, email, email_hash, password_hash, display_name)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, orgID, email, hash.Normalize(email), passwordHash, displayName).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create user: %w", err)
	}
	return id, nil
}

// AssignRole links a user to a role within their org via user_roles.
func (r *Repository) AssignRole(ctx context.Context, orgID, userID, roleID, assignedByUserID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO user_roles (organization_id, user_id, role_id, assigned_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT DO NOTHING
	`, orgID, userID, roleID, assignedByUserID)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	return nil
}

// UpdatePassword replaces the bcrypt hash for a user identified by org + email.
func (r *Repository) UpdatePassword(ctx context.Context, orgID, targetEmail, passwordHash string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE users
		SET password_hash = $3, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
		WHERE organization_id = $1 AND email_hash = $2
	`, orgID, hash.Normalize(targetEmail), passwordHash)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return auth.ErrUserNotFound
	}
	return nil
}
