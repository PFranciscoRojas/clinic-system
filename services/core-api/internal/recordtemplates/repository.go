package recordtemplates

import "context"

// Repository is the persistence contract for record templates.
type Repository interface {
	Create(ctx context.Context, p CreateParams) (*Template, error)
	List(ctx context.Context, orgID string, recordType string, includeArchived bool) ([]*Template, error)
	Get(ctx context.Context, orgID, id string) (*Template, error)
	Update(ctx context.Context, id, orgID, name, markdown string, schema []SectionDef) (*Template, error)
	Archive(ctx context.Context, id, orgID string) error
	SetDefault(ctx context.Context, id, orgID, recordType string) error
	GetDefault(ctx context.Context, orgID, recordType string) (*Template, error)
}
