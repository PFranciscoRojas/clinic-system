package aidrafts

import "time"

type AIDraft struct {
	ID               string
	OrganizationID   string
	ClinicalRecordID string
	AppointmentID    string
	PatientID        string
	RequestedBy      string
	DEKID            string
	AudioPathEnc     []byte
	TranscriptionEnc []byte
	DraftContentEnc  []byte
	AIModelVersion   string
	WhisperModel     string
	TemplateID       string // custom record template; "" = integrated format
	Status           string
	ErrorMessage     string
	ProcessedAt      *time.Time
	ResolvedAt       *time.Time
	ResolvedBy       string
	SupersededBy     string // set when a later take on the same appointment absorbed this one
	CreatedAt        time.Time
	DeleteAfter      *time.Time
}

type CreateParams struct {
	OrganizationID string
	AppointmentID  string
	PatientID      string
	RequestedBy    string
	DEKID          string
	AudioPathEnc   []byte
	AIModelVersion string
	WhisperModel   string
	TemplateID     string // custom record template; "" = integrated format
}

// DraftMeta is the lightweight row returned by the list endpoint (no decryption).
type DraftMeta struct {
	ID               string
	Status           string
	PatientID        string
	PatientCode      *int
	AppointmentID    string
	ClinicalRecordID string
	CreatedAt        time.Time
}

// EncKeyRow is the raw row from encryption_keys used to decrypt the draft's DEK.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}
