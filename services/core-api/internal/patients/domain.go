package patients

import (
	"context"
	"errors"
	"time"
)

// Patient is the decrypted domain entity — PII fields are plain text.
// Populated by the service after decrypting BYTEA columns from the database.
type Patient struct {
	ID               string
	OrganizationID   string
	DocumentTypeCode string
	FirstName        string
	MiddleName       string
	PaternalLastName string
	MaternalLastName string
	DocumentNumber   string
	Phone            string
	Email            string
	Address          string
	BirthDate        time.Time
	Gender           string
	IsActive         bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// CreateParams carries already-encrypted PII and search hashes for the INSERT query.
// The service layer produces this after encrypting the plain-text input with the DEK.
type CreateParams struct {
	OrganizationID       string
	DocumentTypeCode     string
	DEKID                string
	FirstNameEnc         []byte
	MiddleNameEnc        []byte // nil if not provided
	PaternalLastNameEnc  []byte
	MaternalLastNameEnc  []byte // nil if not provided
	PaternalLastNameHash string
	FullNameSearchHash   string
	DocumentNumberEnc    []byte
	DocSearchHash        string
	PhoneEnc             []byte // nil if not provided
	EmailEnc             []byte // nil if not provided
	AddressEnc           []byte // nil if not provided
	BirthDate            time.Time
	Gender               string
}

// UpdateParams carries re-encrypted PII fields for the UPDATE query.
// Only non-nil slices are updated; nil means "leave unchanged".
type UpdateParams struct {
	PatientID            string
	OrganizationID       string
	FirstNameEnc         []byte
	MiddleNameEnc        []byte
	PaternalLastNameEnc  []byte
	MaternalLastNameEnc  []byte
	PaternalLastNameHash string
	FullNameSearchHash   string
	PhoneEnc             []byte
	EmailEnc             []byte
	AddressEnc           []byte
	Gender               string
}

// EncKeyRow is the raw row from encryption_keys used to decrypt a patient's DEK.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}

// Repository defines the persistence contract for the patients domain.
// The pgx implementation lives in ./repository/.
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	FindByID(ctx context.Context, orgID, patientID string) (*RawPatient, error)
	FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error)
	Search(ctx context.Context, orgID string, filter SearchFilter) ([]*RawPatient, error)
	Update(ctx context.Context, p UpdateParams) error
	Deactivate(ctx context.Context, orgID, patientID string) error
}

// SearchFilter holds the hashed query values used for indexed lookups.
type SearchFilter struct {
	PaternalLastNameHash string // search by last name
	DocSearchHash        string // search by document number
	Limit                int
	Offset               int
}

// RawPatient is the database representation — PII is still encrypted BYTEA.
// Defined here (not in repository/) so the service can receive it from the interface.
type RawPatient struct {
	ID                   string
	OrganizationID       string
	DocumentTypeCode     string
	DEKID                string
	FirstNameEnc         []byte
	MiddleNameEnc        []byte
	PaternalLastNameEnc  []byte
	MaternalLastNameEnc  []byte
	DocumentNumberEnc    []byte
	PhoneEnc             []byte
	EmailEnc             []byte
	AddressEnc           []byte
	BirthDate            time.Time
	Gender               string
	IsActive             bool
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

var (
	ErrNotFound     = errors.New("patient not found")
	ErrForbidden    = errors.New("access to this patient is not allowed")
	ErrInvalidInput = errors.New("invalid input")
)
