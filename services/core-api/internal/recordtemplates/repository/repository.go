package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/recordtemplates"
	"sghcp/core-api/internal/shared/dbctx"
)

// Repository implements recordtemplates.Repository using pgx.
type Repository struct {
	pool *pgxpool.Pool
}

// New returns a repository that uses the pool for unscoped queries (e.g.,
// lookups by worker) and the TenantScope querier for request-scoped paths.
func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// q returns the tenant-scoped querier when available (request context);
// falls back to the pool for background / worker contexts.
func (r *Repository) q(ctx context.Context) dbctx.Querier {
	return dbctx.From(ctx, r.pool)
}

func (r *Repository) Create(ctx context.Context, p recordtemplates.CreateParams) (*recordtemplates.Template, error) {
	schemaJSON, err := json.Marshal(p.Schema)
	if err != nil {
		return nil, fmt.Errorf("marshal schema: %w", err)
	}

	// If marked as default, unset existing defaults for this (org, record_type) first.
	if p.IsDefault {
		if _, err := r.q(ctx).Exec(ctx,
			`UPDATE clinical_record_templates
			 SET is_default = false, updated_at = now()
			 WHERE organization_id = $1 AND record_type = $2 AND is_default = true`,
			p.OrganizationID, p.RecordType,
		); err != nil {
			return nil, fmt.Errorf("unset prior default: %w", err)
		}
	}

	var t recordtemplates.Template
	var schemaRaw []byte
	err = r.q(ctx).QueryRow(ctx, `
		INSERT INTO clinical_record_templates
			(organization_id, name, record_type, source_markdown, schema, is_default, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, organization_id, name, record_type, source_markdown, schema,
		          version, status, is_default, created_by, created_at, updated_at
	`,
		p.OrganizationID, p.Name, p.RecordType, p.SourceMarkdown, schemaJSON, p.IsDefault, p.CreatedBy,
	).Scan(
		&t.ID, &t.OrganizationID, &t.Name, &t.RecordType, &t.SourceMarkdown, &schemaRaw,
		&t.Version, &t.Status, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert record_template: %w", err)
	}
	if err := json.Unmarshal(schemaRaw, &t.Schema); err != nil {
		return nil, fmt.Errorf("unmarshal schema: %w", err)
	}
	return &t, nil
}

func (r *Repository) List(ctx context.Context, orgID, recordType string, includeArchived bool) ([]*recordtemplates.Template, error) {
	query := `
		SELECT id, organization_id, name, record_type, source_markdown, schema,
		       version, status, is_default, created_by, created_at, updated_at
		FROM clinical_record_templates
		WHERE organization_id = $1`
	args := []any{orgID}

	if recordType != "" {
		args = append(args, recordType)
		query += fmt.Sprintf(" AND record_type = $%d", len(args))
	}
	if !includeArchived {
		query += " AND status = 'ACTIVE'"
	}
	query += " ORDER BY is_default DESC, name ASC"

	rows, err := r.q(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list record_templates: %w", err)
	}
	defer rows.Close()

	var out []*recordtemplates.Template
	for rows.Next() {
		var t recordtemplates.Template
		var schemaRaw []byte
		if err := rows.Scan(
			&t.ID, &t.OrganizationID, &t.Name, &t.RecordType, &t.SourceMarkdown, &schemaRaw,
			&t.Version, &t.Status, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan record_template: %w", err)
		}
		if err := json.Unmarshal(schemaRaw, &t.Schema); err != nil {
			return nil, fmt.Errorf("unmarshal schema: %w", err)
		}
		out = append(out, &t)
	}
	return out, rows.Err()
}

func (r *Repository) Get(ctx context.Context, orgID, id string) (*recordtemplates.Template, error) {
	var t recordtemplates.Template
	var schemaRaw []byte
	err := r.q(ctx).QueryRow(ctx, `
		SELECT id, organization_id, name, record_type, source_markdown, schema,
		       version, status, is_default, created_by, created_at, updated_at
		FROM clinical_record_templates
		WHERE id = $1 AND organization_id = $2
	`, id, orgID).Scan(
		&t.ID, &t.OrganizationID, &t.Name, &t.RecordType, &t.SourceMarkdown, &schemaRaw,
		&t.Version, &t.Status, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, recordtemplates.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get record_template: %w", err)
	}
	if err := json.Unmarshal(schemaRaw, &t.Schema); err != nil {
		return nil, fmt.Errorf("unmarshal schema: %w", err)
	}
	return &t, nil
}

// Update creates a new, immutable version of the template and archives the
// prior one — it never mutates the old row in place. Records reference a
// template by id, and that id must keep rendering with the exact schema it
// had at the time (PDF export, in-progress drafts): archiving the old row
// instead of overwriting it is what makes that guarantee hold.
func (r *Repository) Update(ctx context.Context, id, orgID, name, markdown string, schema []recordtemplates.SectionDef) (*recordtemplates.Template, error) {
	schemaJSON, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("marshal schema: %w", err)
	}

	tx, err := r.q(ctx).Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Read the fields the new row inherits, and lock it against concurrent
	// edits, before archiving — the idx_crt_one_default partial unique index
	// would reject the new row if it were inserted while the old one still
	// held is_default=true/status=ACTIVE, so the old row must be archived
	// first and its pre-archive values captured here.
	var recordType, createdBy string
	var wasDefault bool
	var oldVersion int
	err = tx.QueryRow(ctx, `
		SELECT record_type, is_default, created_by, version
		FROM clinical_record_templates
		WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE'
		FOR UPDATE
	`, id, orgID).Scan(&recordType, &wasDefault, &createdBy, &oldVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, recordtemplates.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lookup template for update: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE clinical_record_templates
		SET status = 'ARCHIVED', is_default = false, updated_at = now()
		WHERE id = $1
	`, id); err != nil {
		return nil, fmt.Errorf("archive prior template version: %w", err)
	}

	var t recordtemplates.Template
	var schemaRaw []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO clinical_record_templates
			(organization_id, name, record_type, source_markdown, schema, version, status, is_default, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8)
		RETURNING id, organization_id, name, record_type, source_markdown, schema,
		          version, status, is_default, created_by, created_at, updated_at
	`, orgID, name, recordType, markdown, schemaJSON, oldVersion+1, wasDefault, createdBy).Scan(
		&t.ID, &t.OrganizationID, &t.Name, &t.RecordType, &t.SourceMarkdown, &schemaRaw,
		&t.Version, &t.Status, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert new template version: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit template version update: %w", err)
	}
	if err := json.Unmarshal(schemaRaw, &t.Schema); err != nil {
		return nil, fmt.Errorf("unmarshal schema: %w", err)
	}
	return &t, nil
}

func (r *Repository) Archive(ctx context.Context, id, orgID string) error {
	tag, err := r.q(ctx).Exec(ctx, `
		UPDATE clinical_record_templates
		SET status = 'ARCHIVED', is_default = false, updated_at = now()
		WHERE id = $1 AND organization_id = $2
	`, id, orgID)
	if err != nil {
		return fmt.Errorf("archive record_template: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return recordtemplates.ErrNotFound
	}
	return nil
}

func (r *Repository) SetDefault(ctx context.Context, id, orgID, recordType string) error {
	// Unset all other defaults for this (org, record_type), then set the target.
	_, err := r.q(ctx).Exec(ctx, `
		UPDATE clinical_record_templates
		SET is_default = (id = $1), updated_at = now()
		WHERE organization_id = $2 AND record_type = $3 AND status = 'ACTIVE'
	`, id, orgID, recordType)
	return err
}

func (r *Repository) GetDefault(ctx context.Context, orgID, recordType string) (*recordtemplates.Template, error) {
	var t recordtemplates.Template
	var schemaRaw []byte
	err := r.q(ctx).QueryRow(ctx, `
		SELECT id, organization_id, name, record_type, source_markdown, schema,
		       version, status, is_default, created_by, created_at, updated_at
		FROM clinical_record_templates
		WHERE organization_id = $1 AND record_type = $2 AND is_default = true AND status = 'ACTIVE'
		LIMIT 1
	`, orgID, recordType).Scan(
		&t.ID, &t.OrganizationID, &t.Name, &t.RecordType, &t.SourceMarkdown, &schemaRaw,
		&t.Version, &t.Status, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, recordtemplates.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get default record_template: %w", err)
	}
	if err := json.Unmarshal(schemaRaw, &t.Schema); err != nil {
		return nil, fmt.Errorf("unmarshal schema: %w", err)
	}
	return &t, nil
}
