package clinicalrecords

import "context"

// Repository defines the persistence contract for the clinicalrecords domain.
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	FindByID(ctx context.Context, orgID, recordID string) (*RawRecord, error)
	List(ctx context.Context, f ListFilter) ([]*RecordMeta, error)
	GetProcessDates(ctx context.Context, orgID, patientID string) (ProcessDates, error)
	Update(ctx context.Context, p UpdateParams) error
	Approve(ctx context.Context, orgID, recordID, approvedBy string) error
	Cosign(ctx context.Context, orgID, recordID, supervisorID string) error
	CreateAddendum(ctx context.Context, orgID, recordID, createdBy string, contentEnc []byte) (string, error)
	ListAddenda(ctx context.Context, orgID, recordID string) ([]*RawAddendum, error)
}
