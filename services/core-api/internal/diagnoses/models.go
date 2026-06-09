package diagnoses

import (
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("diagnosis not found")
	ErrInvalidInput = errors.New("invalid input")
	ErrUnknownCode  = errors.New("unknown ICD-10 code")
)

// DiagnosisType maps the diagnosis_type ENUM.
type DiagnosisType string

const (
	TypePrincipal DiagnosisType = "PRINCIPAL"
	TypeRelated   DiagnosisType = "RELATED"
)

// Status maps the diagnosis_status ENUM.
type Status string

const (
	StatusActive   Status = "ACTIVE"
	StatusResolved Status = "RESOLVED"
	StatusRuledOut Status = "RULED_OUT"
)

// ICD10Code is one row of the public reference catalog.
type ICD10Code struct {
	Code        string `json:"code"`
	Description string `json:"description"`
	Chapter     string `json:"chapter"`
}

// Diagnosis is a coded diagnosis assigned to a patient.
type Diagnosis struct {
	ID               string        `json:"id"`
	PatientID        string        `json:"patient_id"`
	StaffID          string        `json:"staff_id"`
	ClinicalRecordID *string       `json:"clinical_record_id,omitempty"`
	ICD10Code        string        `json:"icd10_code"`
	Description      string        `json:"description"`
	DiagnosisType    DiagnosisType `json:"diagnosis_type"`
	Status           Status        `json:"status"`
	DiagnosedAt      time.Time     `json:"diagnosed_at"`
	ResolvedAt       *time.Time    `json:"resolved_at,omitempty"`
	CreatedAt        time.Time     `json:"created_at"`
}

// CreateParams carries a new diagnosis row.
type CreateParams struct {
	OrganizationID   string
	PatientID        string
	StaffID          string
	ClinicalRecordID string
	ICD10Code        string
	DiagnosisType    DiagnosisType
	DiagnosedAt      time.Time
}

func ValidType(t DiagnosisType) bool {
	return t == TypePrincipal || t == TypeRelated
}

func ValidStatus(s Status) bool {
	return s == StatusActive || s == StatusResolved || s == StatusRuledOut
}
