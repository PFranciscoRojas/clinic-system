package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/shared/dbctx"
	"sghcp/core-api/internal/treatmentplans"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// q returns the request-scoped querier (tenant connection with the org GUC
// set) when present, falling back to the pool otherwise.
func (r *Repository) q(ctx context.Context) dbctx.Querier { return dbctx.From(ctx, r.db) }

func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM')
		RETURNING id
	`, encryptedDEK, keySource).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert encryption_key: %w", err)
	}
	return id, nil
}

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*treatmentplans.EncKeyRow, error) {
	var k treatmentplans.EncKeyRow
	err := r.q(ctx).QueryRow(ctx,
		`SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1`,
		dekID,
	).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find enc_key: %w", err)
	}
	return &k, nil
}

func (r *Repository) CreatePlan(ctx context.Context, p treatmentplans.CreatePlanParams) (string, error) {
	var id string
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO treatment_plans
			(organization_id, patient_id, staff_id, dek_id, title_enc, start_date)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, p.OrganizationID, p.PatientID, p.StaffID, p.DEKID, p.TitleEnc, p.StartDate).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert treatment_plan: %w", err)
	}
	return id, nil
}

const planColumns = `
	id, organization_id, patient_id, staff_id, dek_id, status,
	title_enc, start_date, end_date, created_at, updated_at`

func scanPlan(row pgx.Row) (*treatmentplans.RawPlan, error) {
	var p treatmentplans.RawPlan
	err := row.Scan(
		&p.ID, &p.OrganizationID, &p.PatientID, &p.StaffID, &p.DEKID, &p.Status,
		&p.TitleEnc, &p.StartDate, &p.EndDate, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) FindPlanByID(ctx context.Context, orgID, planID string) (*treatmentplans.RawPlan, error) {
	p, err := scanPlan(r.q(ctx).QueryRow(ctx,
		`SELECT `+planColumns+` FROM treatment_plans WHERE id = $1 AND organization_id = $2`,
		planID, orgID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, treatmentplans.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find treatment_plan: %w", err)
	}
	return p, nil
}

func (r *Repository) ListPlansByPatient(ctx context.Context, orgID, patientID string) ([]*treatmentplans.RawPlan, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+planColumns+`
		FROM treatment_plans
		WHERE organization_id = $1 AND patient_id = $2
		ORDER BY (status = 'ACTIVE') DESC, start_date DESC
	`, orgID, patientID)
	if err != nil {
		return nil, fmt.Errorf("list treatment_plans: %w", err)
	}
	defer rows.Close()

	var result []*treatmentplans.RawPlan
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan treatment_plan: %w", err)
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func (r *Repository) HasActivePlan(ctx context.Context, orgID, patientID string) (bool, error) {
	var exists bool
	err := r.q(ctx).QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM treatment_plans
			WHERE organization_id = $1 AND patient_id = $2 AND status = 'ACTIVE'
		)
	`, orgID, patientID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check active plan: %w", err)
	}
	return exists, nil
}

func (r *Repository) UpdatePlan(ctx context.Context, p treatmentplans.UpdatePlanParams) error {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE treatment_plans SET
			title_enc = COALESCE($3, title_enc),
			status    = COALESCE($4::plan_status, status),
			end_date  = COALESCE($5, end_date),
			updated_at = NOW()
		WHERE id = $1 AND organization_id = $2
	`, p.PlanID, p.OrganizationID, p.TitleEnc, p.Status, p.EndDate)
	if err != nil {
		return fmt.Errorf("update treatment_plan: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return treatmentplans.ErrNotFound
	}
	return nil
}

func (r *Repository) CreateGoal(ctx context.Context, p treatmentplans.CreateGoalParams) (string, error) {
	var id string
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO treatment_goals (plan_id, description_enc, target_date, sort_order)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, p.PlanID, p.DescriptionEnc, p.TargetDate, p.SortOrder).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert treatment_goal: %w", err)
	}
	return id, nil
}

const goalColumns = `
	id, plan_id, description_enc, progress_notes_enc, status,
	target_date, sort_order, created_at, updated_at`

func scanGoal(row pgx.Row) (*treatmentplans.RawGoal, error) {
	var g treatmentplans.RawGoal
	err := row.Scan(
		&g.ID, &g.PlanID, &g.DescriptionEnc, &g.ProgressNotesEnc, &g.Status,
		&g.TargetDate, &g.SortOrder, &g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *Repository) ListGoalsByPlan(ctx context.Context, planID string) ([]*treatmentplans.RawGoal, error) {
	rows, err := r.q(ctx).Query(ctx, `
		SELECT `+goalColumns+`
		FROM treatment_goals
		WHERE plan_id = $1
		ORDER BY sort_order, created_at
	`, planID)
	if err != nil {
		return nil, fmt.Errorf("list treatment_goals: %w", err)
	}
	defer rows.Close()

	var result []*treatmentplans.RawGoal
	for rows.Next() {
		g, err := scanGoal(rows)
		if err != nil {
			return nil, fmt.Errorf("scan treatment_goal: %w", err)
		}
		result = append(result, g)
	}
	return result, rows.Err()
}

func (r *Repository) FindGoalByID(ctx context.Context, orgID, planID, goalID string) (*treatmentplans.RawGoal, error) {
	g, err := scanGoal(r.q(ctx).QueryRow(ctx, `
		SELECT g.id, g.plan_id, g.description_enc, g.progress_notes_enc, g.status,
		       g.target_date, g.sort_order, g.created_at, g.updated_at
		FROM treatment_goals g
		JOIN treatment_plans p ON p.id = g.plan_id
		WHERE g.id = $1 AND g.plan_id = $2 AND p.organization_id = $3
	`, goalID, planID, orgID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, treatmentplans.ErrGoalNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find treatment_goal: %w", err)
	}
	return g, nil
}

func (r *Repository) DeleteGoal(ctx context.Context, orgID, planID, goalID string) error {
	tag, err := r.q(ctx).Exec(ctx, `
		DELETE FROM treatment_goals g
		USING treatment_plans p
		WHERE g.id = $1 AND g.plan_id = $2 AND p.id = g.plan_id
		  AND p.organization_id = $3
	`, goalID, planID, orgID)
	if err != nil {
		return fmt.Errorf("delete treatment_goal: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return treatmentplans.ErrGoalNotFound
	}
	return nil
}

func (r *Repository) UpdateGoal(ctx context.Context, p treatmentplans.UpdateGoalParams) error {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE treatment_goals g SET
			description_enc    = COALESCE($4, g.description_enc),
			progress_notes_enc = COALESCE($5, g.progress_notes_enc),
			status             = COALESCE($6::goal_status, g.status),
			target_date        = COALESCE($7, g.target_date),
			updated_at         = NOW()
		FROM treatment_plans p
		WHERE g.id = $1 AND g.plan_id = $2 AND p.id = g.plan_id AND p.organization_id = $3
	`, p.GoalID, p.PlanID, p.OrganizationID, p.DescriptionEnc, p.ProgressNotesEnc, p.Status, p.TargetDate)
	if err != nil {
		return fmt.Errorf("update treatment_goal: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return treatmentplans.ErrGoalNotFound
	}
	return nil
}
