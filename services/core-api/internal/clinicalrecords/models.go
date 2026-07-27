package clinicalrecords

import "time"

// RecordType maps the record_type ENUM values.
type RecordType string

const (
	RecordTypeInitial           RecordType = "INITIAL"
	RecordTypeEvolution         RecordType = "EVOLUTION"
	RecordTypeDischarge         RecordType = "DISCHARGE"
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
	ID                   string
	OrganizationID       string
	PatientID            string
	ResponsibleStaffID   string
	CreatedBy            string
	AppointmentID        string
	DEKID                string
	RecordType           RecordType
	SessionDate          time.Time
	TemplateVersion      int16
	// TemplateID is the custom record template used when creating this record.
	// Empty string means the integrated (hardcoded) format was used.
	TemplateID           string
	Sections             map[string]any
	RiskLevel            *string
	DischargeReason      *string
	Status               RecordStatus
	ApprovedAt           *time.Time
	RequiresCosign       bool
	SupervisorID         string
	SupervisorCosignedAt *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
	// FinalizedAt is nil for an autosave draft that has never passed strict
	// validation — set once, the first time the record is created or
	// finalized through the validated path.
	FinalizedAt          *time.Time
}

// RawRecord is the DB representation — the section payload is encrypted BYTEA.
type RawRecord struct {
	ID                   string
	OrganizationID       string
	PatientID            string
	ResponsibleStaffID   string
	CreatedBy            string
	AppointmentID        string
	DEKID                string
	RecordType           RecordType
	SessionDate          time.Time
	TemplateVersion      int16
	TemplateID           string // empty = integrated format
	SectionsEnc          []byte
	RiskLevel            *string
	DischargeReason      *string
	Status               RecordStatus
	ApprovedAt           *time.Time
	RequiresCosign       bool
	SupervisorID         string
	SupervisorCosignedAt *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
	FinalizedAt          *time.Time
}

// RecordMeta is the lightweight metadata returned by the list endpoint (no decryption).
type RecordMeta struct {
	ID                 string
	PatientID          string
	PatientCode        *int
	ResponsibleStaffID string
	CreatedBy          string
	AppointmentID      string
	RecordType         RecordType
	SessionDate        time.Time
	TemplateVersion    int16
	TemplateID         string // empty = integrated format
	RiskLevel          *string
	Status             RecordStatus
	RequiresCosign     bool
	SupervisorID       string
	CreatedAt          time.Time
	SessionNumber      *int16 // consecutive per patient, assigned at finalize
	FinalizedAt        *time.Time
}

// CreateParams carries the pre-encrypted section payload and hashed content for the INSERT.
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
	TemplateID         string // empty = integrated format
	SectionsEnc        []byte
	RiskLevel          *string
	DischargeReason    *string
	RequiresCosign     bool
	SupervisorID       string
	ContentHash        string
	// Finalized controls whether this INSERT is a real, validated record
	// (finalized_at = NOW(), session_number assigned) or a lenient autosave
	// draft (both left NULL until Finalize).
	Finalized          bool
}

// UpdateParams carries the re-encrypted section payload for a PATCH on a DRAFT record.
type UpdateParams struct {
	ID              string
	OrganizationID  string
	SectionsEnc     []byte
	RiskLevel       *string
	DischargeReason *string
	ContentHash     string
	// Finalize, when true, sets finalized_at (if not already set) and assigns
	// session_number (if not already assigned) — used by the explicit
	// "Guardar"/finalize path, never by lenient autosave PATCHes.
	Finalize        bool
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

// OrgListFilter specifies filters for the org-wide clinical records list.
type OrgListFilter struct {
	OrganizationID string
	Status         string // optional: "DRAFT" | "APPROVED"
	Limit          int
	Offset         int
}

// ExportFilter selects the approved records that go into a bulk archive.
//
// SeeAll lifts the treatment-team restriction for callers that have no team to
// match against (the operator, or a non-clinical role that already holds
// clinical_records:read). For everyone else the archive is limited to patients
// the staff member actually treats — the same need-to-know boundary as reading
// one record (Res. 1995/1999 art. 14).
type ExportFilter struct {
	OrganizationID string
	StaffID        string
	SeeAll         bool
	PatientID      string // optional
	From           string // optional, YYYY-MM-DD
	To             string // optional, YYYY-MM-DD
	Limit          int
}

// ExportRecord is one record selected for an archive. SessionNumber lives on
// the table but not on the decrypted entity, so it is carried from here rather
// than looked up again per record.
type ExportRecord struct {
	ID            string
	SessionNumber *int16
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
