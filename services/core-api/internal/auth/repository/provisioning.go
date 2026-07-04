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
				(name, slug, plan, subscription_status, trial_ends_at, signup_phone, signup_source)
			VALUES ($1, $2, 'STARTER', 'trialing', $3, NULLIF($4, ''), NULLIF($5, ''))
			RETURNING id
		`, p.OrgName, slug, trialEnds, p.Phone, p.ReferralSource).Scan(&orgID)
		if err == nil {
			break
		}
		if isUniqueViolation(err, "organizations_slug_key") && attempt < 50 {
			slug = fmt.Sprintf("%s-%d", p.BaseSlug, attempt+1)
			continue
		}
		return "", "", "", fmt.Errorf("insert organization: %w", err)
	}

	// Scope the rest of the signup tx to the new org so RLS WITH CHECK passes on
	// tenant tables seeded here (consent_templates). Transaction-local so it
	// clears on commit. Tables without RLS (users, user_roles) are unaffected.
	if _, err = tx.Exec(ctx, `SELECT set_config('app.current_org', $1, true)`, orgID); err != nil {
		return "", "", "", fmt.Errorf("scope signup tx: %w", err)
	}

	// terms_accepted_at = now() records the moment of acceptance; terms_version
	// captures which revision of the legal documents was accepted (Ley 1581 audit trail).
	err = tx.QueryRow(ctx, `
		INSERT INTO users (organization_id, email, email_hash, password_hash, display_name,
		                   terms_accepted_at, terms_version)
		VALUES ($1, $2, $3, $4, $5, now(), $6)
		RETURNING id
	`, orgID, p.Email, hashEmail(p.Email), p.PasswordHash, p.DisplayName, p.TermsVersion).Scan(&userID)
	if err != nil {
		if isUniqueViolation(err, "users_email_hash_global_uq") {
			return "", "", "", auth.ErrEmailAlreadyExists
		}
		return "", "", "", fmt.Errorf("insert owner user: %w", err)
	}

	// The owner always administers; they also get clinical access (and a
	// bookable agenda) only if they practice — a manager-only admin doesn't.
	roles := []string{"CLINIC_ADMIN"}
	if p.IsProfessional {
		roles = append(roles, "PROFESSIONAL")
	}
	for _, role := range roles {
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

	// Seed the four starter consent templates so the new tenant can capture
	// consents from day one (migration 000010 only seeds orgs that existed then).
	// They're editable later in Settings → Plantillas clínicas.
	if _, err = tx.Exec(ctx, seedConsentTemplatesSQL, orgID, userID); err != nil {
		return "", "", "", fmt.Errorf("seed consent templates: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return "", "", "", fmt.Errorf("commit signup tx: %w", err)
	}
	return orgID, slug, userID, nil
}

// seedConsentTemplatesSQL inserts the four default, editable consent templates
// for a freshly provisioned org ($1) authored by its owner ($2). The bodies
// mirror the starters in migration 000010.
const seedConsentTemplatesSQL = `
INSERT INTO consent_templates (organization_id, consent_type, version, title, body, updated_by)
VALUES
  ($1, 'TREATMENT', 1, 'Consentimiento informado para atención psicológica',
   E'Declaro que he sido informado(a) sobre la naturaleza, objetivos y alcance de la atención psicológica que recibiré, conforme a la Ley 1090 de 2006.\n\nEntiendo que la información compartida en sesión es confidencial y está protegida por el secreto profesional, con las excepciones que la ley contempla (riesgo para la vida propia o de terceros, requerimiento judicial).\n\nAcepto voluntariamente iniciar este proceso de atención psicológica.', $2),
  ($1, 'DATA_PROCESSING', 1, 'Autorización para el tratamiento de datos personales',
   E'Autorizo el tratamiento de mis datos personales, incluidos datos sensibles de salud, conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013, con la finalidad exclusiva de la prestación del servicio de atención psicológica y la gestión de mi historia clínica.\n\nConozco mis derechos a conocer, actualizar, rectificar y suprimir mis datos, y a revocar esta autorización.', $2),
  ($1, 'RECORDING', 1, 'Consentimiento para grabación de sesiones',
   E'Autorizo la grabación de audio de mis sesiones con fines exclusivos de apoyo a la elaboración de la nota clínica. El audio se procesa en la infraestructura del prestador, no se comparte con terceros y puedo revocar esta autorización en cualquier momento.', $2),
  ($1, 'INFORMATION_SHARING', 1, 'Autorización para compartir información clínica',
   E'Autorizo compartir la información clínica estrictamente necesaria con los terceros que yo indique expresamente (otros profesionales de salud, EPS, familiares autorizados), conforme a la Ley 23 de 1981 y la Resolución 1995 de 1999.', $2)
`

// OrgInfo returns the tenant's name, subscription status and the deadlines that
// drive the trial banner and the entitlement check (trial_ends_at and the paid
// current_period_end). Missing dates come back as nil.
func (r *Repository) OrgInfo(ctx context.Context, orgID string) (name, status string, trialEndsAt, currentPeriodEnd *time.Time, err error) {
	err = r.db.QueryRow(ctx,
		`SELECT name, subscription_status, trial_ends_at, current_period_end FROM organizations WHERE id = $1`,
		orgID,
	).Scan(&name, &status, &trialEndsAt, &currentPeriodEnd)
	if err != nil {
		return "", "", nil, nil, fmt.Errorf("load org info: %w", err)
	}
	return name, status, trialEndsAt, currentPeriodEnd, nil
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
