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
	TemplateVersion     int16
	Subjective          string
	Objective           string
	Assessment          string
	Plan                string
	Sections            map[string]any
	RiskLevel           *string
	DischargeReason     *string
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
	TemplateVersion     int16
	SubjectiveEnc       []byte
	ObjectiveEnc        []byte
	AssessmentEnc       []byte
	PlanEnc             []byte
	SectionsEnc         []byte
	RiskLevel           *string
	DischargeReason     *string
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
	TemplateVersion    int16
	RiskLevel          *string
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
	TemplateVersion    int16
	SubjectiveEnc      []byte
	ObjectiveEnc       []byte
	AssessmentEnc      []byte
	PlanEnc            []byte
	SectionsEnc        []byte
	RiskLevel          *string
	DischargeReason    *string
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
	SectionsEnc    []byte
	RiskLevel      *string
	DischargeReason *string
	ContentHash    string
}

// ProcessDates carries the latest INITIAL and DISCHARGE session dates for a
// patient — the basis of the open-process business rules.
type ProcessDates struct {
	LastInitial   *time.Time
	LastDischarge *time.Time
}

// HasOpenProcess reports whether the patient has an INITIAL not yet closed
// by a later (or same-day) DISCHARGE.
func (p ProcessDates) HasOpenProcess() bool {
	if p.LastInitial == nil {
		return false
	}
	return p.LastDischarge == nil || p.LastDischarge.Before(*p.LastInitial)
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

// Addendum is a signed, immutable supplementary note on an APPROVED record
// (Res. 1995/1999: the original entry is never edited). Decrypted form.
type Addendum struct {
	ID         string
	RecordID   string
	CreatedBy  string
	AuthorName string // display_name resolved at read time
	Content    string
	CreatedAt  time.Time
}

// RawAddendum is the database representation — content still encrypted.
type RawAddendum struct {
	ID         string
	RecordID   string
	CreatedBy  string
	AuthorName string
	ContentEnc []byte
	CreatedAt  time.Time
}
