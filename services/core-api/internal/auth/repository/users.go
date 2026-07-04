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

// FindUserByEmailGlobal looks up a user by email without an org filter — used by
// the self-service password reset, where the requester supplies only their email.
// Returns the minimal identity needed to build the reset link; no roles/permissions.
func (r *Repository) FindUserByEmailGlobal(ctx context.Context, email string) (*auth.User, error) {
	u := &auth.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id, organization_id, email, display_name, is_active, email_verified_at
		FROM users
		WHERE email_hash = $1
		LIMIT 1
	`, hash.Normalize(email)).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.DisplayName, &u.IsActive, &u.EmailVerifiedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, auth.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by email global: %w", err)
	}
	return u, nil
}

// UpdatePasswordByID sets a new password hash for the given user.
func (r *Repository) UpdatePasswordByID(ctx context.Context, userID, passwordHash string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
		userID, passwordHash,
	)
	if err != nil {
		return fmt.Errorf("update password by id: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return auth.ErrUserNotFound
	}
	return nil
}

// SetOnboardingCompleted stamps the server-side onboarding flag.
func (r *Repository) SetOnboardingCompleted(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET onboarding_completed_at = NOW(), updated_at = NOW()
		 WHERE id = $1 AND onboarding_completed_at IS NULL`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("set onboarding completed: %w", err)
	}
	return nil
}

// OnboardingCompleted reports whether the user finished onboarding.
func (r *Repository) OnboardingCompleted(ctx context.Context, userID string) (bool, error) {
	var done bool
	err := r.db.QueryRow(ctx,
		`SELECT onboarding_completed_at IS NOT NULL FROM users WHERE id = $1`,
		userID,
	).Scan(&done)
	if err != nil {
		return false, fmt.Errorf("get onboarding flag: %w", err)
	}
	return done, nil
}

// UpdateEmail replaces the user's email and its hash, stamping email_verified_at.
func (r *Repository) UpdateEmail(ctx context.Context, userID, newEmail string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE users
		SET email             = $2,
		    email_hash        = $3,
		    email_verified_at = NOW(),
		    updated_at        = NOW()
		WHERE id = $1
	`, userID, newEmail, hash.Normalize(newEmail))
	if err != nil {
		if isUniqueViolation(err, "users_email_hash_global_uq") {
			return auth.ErrEmailAlreadyExists
		}
		return fmt.Errorf("update email: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return auth.ErrUserNotFound
	}
	return nil
}

// ListOrgUsers returns all users in the org (including inactive) with their current role name.
func (r *Repository) ListOrgUsers(ctx context.Context, orgID string) ([]auth.OrgUser, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.display_name, u.email,
		       COALESCE(ro.name, 'sin rol') AS role_name,
		       u.is_active, u.last_login_at
		FROM   users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id = $1
		LEFT JOIN roles ro      ON ro.id = ur.role_id
		WHERE  u.organization_id = $1
		ORDER  BY u.created_at
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list org users: %w", err)
	}
	defer rows.Close()
	var out []auth.OrgUser
	for rows.Next() {
		var u auth.OrgUser
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Email, &u.RoleName, &u.IsActive, &u.LastLoginAt); err != nil {
			return nil, fmt.Errorf("scan org user: %w", err)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ListOrgProfessionals returns the org's active clinical staff (PROFESSIONAL
// and INTERN roles) with their working-hours config, for scheduling UIs. The
// name prefers the professional profile over the account display name.
func (r *Repository) ListOrgProfessionals(ctx context.Context, orgID string) ([]auth.OrgProfessional, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id,
		       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pp.first_name, pp.paternal_last_name)), ''),
		                NULLIF(u.display_name, ''), u.email),
		       ro.name,
		       COALESCE(pp.working_hours, '{}'::jsonb)
		FROM   users u
		JOIN   user_roles ur ON ur.user_id = u.id AND ur.organization_id = $1
		JOIN   roles ro      ON ro.id = ur.role_id AND ro.name IN ('PROFESSIONAL', 'INTERN')
		LEFT JOIN professional_profiles pp ON pp.user_id = u.id
		WHERE  u.organization_id = $1 AND u.is_active
		ORDER  BY u.created_at
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list org professionals: %w", err)
	}
	defer rows.Close()
	var out []auth.OrgProfessional
	for rows.Next() {
		var p auth.OrgProfessional
		var wh []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.RoleName, &wh); err != nil {
			return nil, fmt.Errorf("scan org professional: %w", err)
		}
		p.WorkingHours = wh
		out = append(out, p)
	}
	return out, rows.Err()
}

// ReactivateUser restores is_active=true and assigns a new role.
func (r *Repository) ReactivateUser(ctx context.Context, orgID, targetUserID, roleID, callerUserID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reactivate-user tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	tag, err := tx.Exec(ctx,
		`UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
		targetUserID, orgID,
	)
	if err != nil {
		return fmt.Errorf("reactivate user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return auth.ErrUserNotFound
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO user_roles (organization_id, user_id, role_id, assigned_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT DO NOTHING
	`, orgID, targetUserID, roleID, callerUserID); err != nil {
		return fmt.Errorf("assign role on reactivate: %w", err)
	}

	return tx.Commit(ctx)
}

// DeactivateUser soft-deletes a user: removes their role grants (so they lose all
// permissions immediately) and sets is_active=false (so login is rejected). The
// user row and all historical FK references remain intact for legal retention.
// Returns the number of rows affected (0 = user not found in this org).
func (r *Repository) DeactivateUser(ctx context.Context, orgID, targetUserID string) (int64, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin deactivate-user tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`DELETE FROM user_roles WHERE user_id = $1 AND organization_id = $2`,
		targetUserID, orgID,
	)
	if err != nil {
		return 0, fmt.Errorf("delete user_roles: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
		targetUserID, orgID,
	)
	if err != nil {
		return 0, fmt.Errorf("deactivate user: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit deactivate-user: %w", err)
	}
	return tag.RowsAffected(), nil
}

// AdminDeactivateUser is the same as DeactivateUser but scoped to any org,
// for use by the SYSTEM_ADMIN operator console (no org isolation needed).
func (r *Repository) AdminDeactivateUser(ctx context.Context, orgID, targetUserID string) (int64, error) {
	return r.DeactivateUser(ctx, orgID, targetUserID)
}

// CountAdminsExcluding returns how many CLINIC_ADMIN users the org has,
// excluding the given user. Used to prevent removing the last admin.
func (r *Repository) CountAdminsExcluding(ctx context.Context, orgID, excludeUserID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM user_roles ur
		JOIN roles ro ON ro.id = ur.role_id
		WHERE ur.organization_id = $1
		  AND ro.name = 'CLINIC_ADMIN'
		  AND ur.user_id != $2
	`, orgID, excludeUserID).Scan(&count)
	return count, err
}

// SeatUsage returns how many clinical seats (active PROFESSIONAL/INTERN users)
// the org is using, its paid seat_limit, and its subscription status.
// excludeUserID (optional) leaves one user out of the count — used when
// changing a user's role, so someone already holding a seat keeps it.
func (r *Repository) SeatUsage(ctx context.Context, orgID, excludeUserID string) (used, limit int, status string, err error) {
	err = r.db.QueryRow(ctx, `
		SELECT o.seat_limit, o.subscription_status,
		       (SELECT COUNT(DISTINCT u.id)
		        FROM   users u
		        JOIN   user_roles ur ON ur.user_id = u.id AND ur.organization_id = o.id
		        JOIN   roles ro      ON ro.id = ur.role_id AND ro.name IN ('PROFESSIONAL', 'INTERN')
		        WHERE  u.organization_id = o.id AND u.is_active
		          AND  ($2 = '' OR u.id::text <> $2))
		FROM organizations o
		WHERE o.id = $1
	`, orgID, excludeUserID).Scan(&limit, &status, &used)
	if err != nil {
		return 0, 0, "", fmt.Errorf("seat usage: %w", err)
	}
	return used, limit, status, nil
}

// AcceptDPA stamps dpa_accepted_at for a user. Idempotent — re-accepting is a no-op.
func (r *Repository) AcceptDPA(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET dpa_accepted_at = NOW(), updated_at = NOW()
		 WHERE id = $1 AND dpa_accepted_at IS NULL`,
		userID,
	)
	return err
}

// DPAAccepted reports whether the user has accepted the Data Processing Agreement.
// Returns true on any lookup error so a transient DB hiccup never blocks the UI.
func (r *Repository) DPAAccepted(ctx context.Context, userID string) (bool, error) {
	var accepted bool
	err := r.db.QueryRow(ctx,
		`SELECT dpa_accepted_at IS NOT NULL FROM users WHERE id = $1`,
		userID,
	).Scan(&accepted)
	return accepted, err
}

// ReplaceUserRole atomically removes all org role grants for the target user and
// assigns a single new role, inside a transaction.
func (r *Repository) ReplaceUserRole(ctx context.Context, orgID, targetUserID, newRoleID, callerUserID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin role-replace tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx,
		`DELETE FROM user_roles WHERE user_id = $1 AND organization_id = $2`,
		targetUserID, orgID,
	); err != nil {
		return fmt.Errorf("delete old roles: %w", err)
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO user_roles (organization_id, user_id, role_id, assigned_by)
		VALUES ($1, $2, $3, $4)
	`, orgID, targetUserID, newRoleID, callerUserID); err != nil {
		return fmt.Errorf("insert new role: %w", err)
	}

	return tx.Commit(ctx)
}
