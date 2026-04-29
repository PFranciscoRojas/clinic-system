package patients

import "context"

// Repository defines the persistence contract for the patients domain.
// The pgx implementation lives in ./repository/ and is injected at startup.
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	FindByID(ctx context.Context, orgID, patientID string) (*RawPatient, error)
	FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error)
	Search(ctx context.Context, orgID string, filter SearchFilter) ([]*RawPatient, error)
	Update(ctx context.Context, p UpdateParams) error
	Deactivate(ctx context.Context, orgID, patientID string) error
}
