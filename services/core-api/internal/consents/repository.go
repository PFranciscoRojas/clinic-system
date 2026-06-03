package consents

import "context"

// Repository defines the persistence contract for the consents domain.
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	List(ctx context.Context, orgID, patientID string) ([]*Consent, error)
}
