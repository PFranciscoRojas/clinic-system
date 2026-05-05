package aidrafts

import "time"

type AIDraft struct {
	ID               string
	OrganizationID   string
	ClinicalRecordID string
	PatientID        string
	RequestedBy      string
	DEKID            string
	AudioPathEnc     []byte
	TranscriptionEnc []byte
	DraftContentEnc  []byte
	AIModelVersion   string
	WhisperModel     string
	Status           string
	ErrorMessage     string
	ProcessedAt      *time.Time
	ResolvedAt       *time.Time
	ResolvedBy       string
	CreatedAt        time.Time
	DeleteAfter      *time.Time
}

type CreateParams struct {
	OrganizationID string
	PatientID      string
	RequestedBy    string
	DEKID          string
	AudioPathEnc   []byte
	AIModelVersion string
	WhisperModel   string
}

// EncKeyRow is the raw row from encryption_keys used to decrypt the draft's DEK.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}
