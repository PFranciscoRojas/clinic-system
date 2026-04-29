package patients

import "time"

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

// RawPatient is the database representation — PII is still encrypted BYTEA.
// Defined at domain level (not in repository/) so the service interface can reference it.
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

// CreateParams carries already-encrypted PII and search hashes for the INSERT query.
type CreateParams struct {
	OrganizationID       string
	DocumentTypeCode     string
	DEKID                string
	FirstNameEnc         []byte
	MiddleNameEnc        []byte
	PaternalLastNameEnc  []byte
	MaternalLastNameEnc  []byte
	PaternalLastNameHash string
	FullNameSearchHash   string
	DocumentNumberEnc    []byte
	DocSearchHash        string
	PhoneEnc             []byte
	EmailEnc             []byte
	AddressEnc           []byte
	BirthDate            time.Time
	Gender               string
}

// UpdateParams carries re-encrypted PII fields for the UPDATE query.
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

// SearchFilter holds the hashed query values used for indexed lookups.
// Search by paternal last name hash OR document hash — not both simultaneously.
type SearchFilter struct {
	PaternalLastNameHash string
	DocSearchHash        string
	Limit                int
	Offset               int
}
