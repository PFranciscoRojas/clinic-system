package service

import (
	"time"

	"sghcp/core-api/internal/clinicalrecords"
)

// CreateInput carries the plain-text section payload from the handler.
type CreateInput struct {
	OrganizationID     string
	PatientID          string
	ResponsibleStaffID string
	CreatedBy          string
	AppointmentID      string
	RecordType         clinicalrecords.RecordType
	SessionDate        time.Time
	// TemplateID is optional. When set the sections are validated against the
	// custom template schema instead of the hardcoded integrated template.
	TemplateID         string
	Sections           map[string]any
	RiskLevel          clinicalrecords.RiskLevel
	DischargeReason    clinicalrecords.DischargeReason
	RequiresCosign     bool
	SupervisorID       string
}

// UpdateInput carries the plain-text section payload for patching a DRAFT record.
type UpdateInput struct {
	ID              string
	OrganizationID  string
	Sections        map[string]any
	RiskLevel       clinicalrecords.RiskLevel
	DischargeReason clinicalrecords.DischargeReason
}
