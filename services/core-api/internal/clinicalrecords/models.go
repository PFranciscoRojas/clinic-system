package clinicalrecords

import "time"

// RecordType maps the record_type ENUM values.
type RecordType string

const (
	RecordTypeInitial          RecordType = "INITIAL"
	RecordTypeEvolution        RecordType = "EVOLUTION"
	RecordTypeDischarge        RecordType = "DISCHARGE"
	RecordTypeInterconsultation RecordType = "INTERCONSULTATION"
)

// RecordStatus maps the record_status ENUM values.
type RecordStatus string

const (
	StatusDraft    RecordStatus = "DRAFT"
	StatusApproved RecordStatus = "APPROVED"
)

// ClinicalRecord is the fully decrypted domain entity.
type ClinicalRecord struct {
	ID                  string
	OrganizationID      string
	PatientID           string
	ResponsibleStaffID  string
	CreatedBy           string
	AppointmentID       string
	DEKID               string
	RecordType          RecordType
	SessionDate         time.Time
	Subjective          string
	Objective           string
	Assessment          string
	Plan                string
	Status              RecordStatus
	ApprovedAt          *time.Time
	RequiresCosign      bool
	SupervisorID        string
	SupervisorCosignedAt *time.Time
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// RawRecord is the DB representation — SOAP fields are still encrypted BYTEA.
type RawRecord struct {
	ID                  string
	OrganizationID      string
	PatientID           string
	ResponsibleStaffID  string
	CreatedBy           string
	AppointmentID       string
	DEKID               string
	RecordType          RecordType
	SessionDate         time.Time
	SubjectiveEnc       []byte
	ObjectiveEnc        []byte
	AssessmentEnc       []byte
	PlanEnc             []byte
	Status              RecordStatus
	ApprovedAt          *time.Time
	RequiresCosign      bool
	SupervisorID        string
	SupervisorCosignedAt *time.Time
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// RecordMeta is the lightweight metadata returned by the list endpoint (no decryption).
type RecordMeta struct {
	ID                 string
	PatientID          string
	ResponsibleStaffID string
	CreatedBy          string
	AppointmentID      string
	RecordType         RecordType
	SessionDate        time.Time
	Status             RecordStatus
	RequiresCosign     bool
	SupervisorID       string
	CreatedAt          time.Time
}

// CreateParams carries pre-encrypted SOAP and hashed content for the INSERT.
type CreateParams struct {
	OrganizationID     string
	PatientID          string
	ResponsibleStaffID string
	CreatedBy          string
	AppointmentID      string
	DEKID              string
	RecordType         RecordType
	SessionDate        time.Time
	SubjectiveEnc      []byte
	ObjectiveEnc       []byte
	AssessmentEnc      []byte
	PlanEnc            []byte
	RequiresCosign     bool
	SupervisorID       string
	ContentHash        string
}

// UpdateParams carries re-encrypted SOAP for a PATCH on a DRAFT record.
type UpdateParams struct {
	ID             string
	OrganizationID string
	SubjectiveEnc  []byte
	ObjectiveEnc   []byte
	AssessmentEnc  []byte
	PlanEnc        []byte
	ContentHash    string
}

// EncKeyRow is the encrypted DEK row fetched for decryption.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}

// ListFilter specifies query filters for listing records.
type ListFilter struct {
	OrganizationID string
	PatientID      string
	Limit          int
	Offset         int
}
