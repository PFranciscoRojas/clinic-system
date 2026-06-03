package consents

import "time"

// ConsentType maps the consent_type ENUM.
type ConsentType string

const (
	ConsentTypeTreatment          ConsentType = "TREATMENT"
	ConsentTypeRecording          ConsentType = "RECORDING"
	ConsentTypeDataProcessing     ConsentType = "DATA_PROCESSING"
	ConsentTypeInformationSharing ConsentType = "INFORMATION_SHARING"
)

// Consent is the domain entity (no encrypted content — document_enc omitted from reads for MVP).
type Consent struct {
	ID           string
	OrganizationID string
	PatientID    string
	StaffID      string
	ConsentType  ConsentType
	SigningMethod string
	SignedAt     time.Time
	ValidUntil   *time.Time
	RevokedAt    *time.Time
	CreatedAt    time.Time
}

// CreateParams carries the data for a new physical-scan consent.
type CreateParams struct {
	OrganizationID        string
	PatientID             string
	StaffID               string
	DEKID                 string
	ConsentType           ConsentType
	DocumentEnc           []byte
	DocumentTemplateHash  string
	ScanPathEnc           []byte
	ScanFileType          string
	SignedAt              time.Time
}

// EncKeyRow is the encrypted DEK row.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}
