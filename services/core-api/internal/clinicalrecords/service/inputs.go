package service

import (
	"time"

	"sghcp/core-api/internal/clinicalrecords"
)

// CreateInput carries plain-text SOAP content from the handler.
type CreateInput struct {
	OrganizationID     string
	PatientID          string
	ResponsibleStaffID string
	CreatedBy          string
	AppointmentID      string
	RecordType         clinicalrecords.RecordType
	SessionDate        time.Time
	Subjective         string
	Objective          string
	Assessment         string
	Plan               string
	Sections           map[string]any
	RiskLevel          clinicalrecords.RiskLevel
	DischargeReason    clinicalrecords.DischargeReason
	RequiresCosign     bool
	SupervisorID       string
}

// UpdateInput carries plain-text SOAP content for patching a DRAFT record.
type UpdateInput struct {
	ID             string
	OrganizationID string
	Subjective     string
	Objective      string
	Assessment     string
	Plan           string
	Sections       map[string]any
	RiskLevel      clinicalrecords.RiskLevel
	DischargeReason clinicalrecords.DischargeReason
}
