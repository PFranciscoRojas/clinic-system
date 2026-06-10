package consents

import "context"

// Repository defines the persistence contract for the consents domain.
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	List(ctx context.Context, orgID, patientID string) ([]*Consent, error)

	ListActiveTemplates(ctx context.Context, orgID string) ([]*Template, error)
	GetActiveTemplate(ctx context.Context, orgID string, ct ConsentType) (*Template, error)
	GetTemplateByID(ctx context.Context, templateID string) (*Template, error)
	CreateTemplateVersion(ctx context.Context, orgID string, ct ConsentType, title, body, updatedBy string) (*Template, error)

	CreateSignToken(ctx context.Context, t SignToken) (string, error)
	GetSignToken(ctx context.Context, tokenHash string) (*SignToken, error)
	MarkTokenUsed(ctx context.Context, id string) error

	// GetDocument returns the encrypted payloads plus the DEK row needed to open them.
	GetDocument(ctx context.Context, orgID, consentID string) (*ConsentDocument, error)
	Revoke(ctx context.Context, orgID, consentID, reason string) error

	// PatientContact returns the encrypted email + first name and the patient DEK,
	// needed to address the remote sign-link email.
	PatientContact(ctx context.Context, orgID, patientID string) (emailEnc, firstNameEnc []byte, dek EncKeyRow, err error)
}
