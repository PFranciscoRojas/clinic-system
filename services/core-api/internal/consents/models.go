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

// CreateParams carries the data for a new consent (digital signature or physical scan).
type CreateParams struct {
	OrganizationID       string
	PatientID            string
	StaffID              string
	DEKID                string
	ConsentType          ConsentType
	SigningMethod        string // "DIGITAL" | "PHYSICAL_SCAN"
	DocumentEnc          []byte
	DocumentTemplateHash string
	SignatureEnc         []byte
	ScanFileEnc          []byte
	ScanFileType         string
	EvidenceEnc          []byte
	TemplateID           string
	SignedAt             time.Time
}

// Template is one version of a consent document's editable text.
type Template struct {
	ID             string
	OrganizationID string
	ConsentType    ConsentType
	Version        int
	Title          string
	Body           string
	UpdatedBy      string
	IsActive       bool
	CreatedAt      time.Time
}

// SignToken is a single-use remote-signature link.
type SignToken struct {
	ID             string
	OrganizationID string
	PatientID      string
	ConsentType    ConsentType
	TemplateID     string
	TokenHash      string
	CreatedBy      string
	ExpiresAt      time.Time
	UsedAt         *time.Time
}

// ConsentDocument bundles the encrypted payloads with the DEK row needed to open them.
type ConsentDocument struct {
	Consent
	DocumentEnc  []byte
	SignatureEnc []byte
	ScanFileEnc  []byte
	ScanFileType string
	EvidenceEnc  []byte
	TemplateID   string
	DEK          EncKeyRow
}

// EncKeyRow is the encrypted DEK row.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}
