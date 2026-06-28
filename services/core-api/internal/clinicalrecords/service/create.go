package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/recordtemplates"
)

func (s *Service) Create(ctx context.Context, in CreateInput) (string, error) {
	if in.OrganizationID == "" || in.PatientID == "" || in.ResponsibleStaffID == "" || in.CreatedBy == "" {
		return "", clinicalrecords.ErrInvalidInput
	}
	if in.RecordType == "" || in.SessionDate.IsZero() {
		return "", clinicalrecords.ErrInvalidInput
	}
	return s.createV2(ctx, in)
}

// createV2 stores the record as one encrypted section payload (the only format
// — psychology-native, with the open-process business rules).
func (s *Service) createV2(ctx context.Context, in CreateInput) (string, error) {
	if in.TemplateID != "" {
		// Custom template path: validate sections against the template schema.
		if err := s.validateCustomTemplate(ctx, in); err != nil {
			return "", err
		}
	} else {
		// Integrated format path: use the hardcoded Go whitelist.
		if err := clinicalrecords.ValidateTemplateV2(in.RecordType, in.Sections, in.RiskLevel, in.DischargeReason); err != nil {
			return "", err
		}
	}

	dates, err := s.repo.GetProcessDates(ctx, in.OrganizationID, in.PatientID)
	if err != nil {
		return "", fmt.Errorf("check open process: %w", err)
	}
	switch in.RecordType {
	case clinicalrecords.RecordTypeInitial:
		if dates.HasOpenProcess() {
			return "", clinicalrecords.ErrOpenProcessExists
		}
	case clinicalrecords.RecordTypeEvolution, clinicalrecords.RecordTypeDischarge:
		if !dates.HasOpenProcess() {
			return "", clinicalrecords.ErrNoOpenProcess
		}
	}

	dek, dekID, err := s.newDEK(ctx)
	if err != nil {
		return "", fmt.Errorf("generate DEK: %w", err)
	}
	sectionsEnc, sectionsJSON, err := sealSections(dek, in.Sections)
	if err != nil {
		return "", fmt.Errorf("encrypt sections: %w", err)
	}

	risk := string(in.RiskLevel)
	params := clinicalrecords.CreateParams{
		OrganizationID:     in.OrganizationID,
		PatientID:          in.PatientID,
		ResponsibleStaffID: in.ResponsibleStaffID,
		CreatedBy:          in.CreatedBy,
		AppointmentID:      in.AppointmentID,
		DEKID:              dekID,
		RecordType:         in.RecordType,
		SessionDate:        in.SessionDate,
		TemplateVersion:    2,
		TemplateID:         in.TemplateID,
		SectionsEnc:        sectionsEnc,
		RiskLevel:          &risk,
		RequiresCosign:     in.RequiresCosign,
		SupervisorID:       in.SupervisorID,
		ContentHash:        contentHashV2(sectionsJSON, risk, string(in.DischargeReason)),
	}
	if in.RecordType == clinicalrecords.RecordTypeDischarge {
		reason := string(in.DischargeReason)
		params.DischargeReason = &reason
	}
	return s.repo.Create(ctx, params)
}

// validateCustomTemplate checks the section payload against the custom
// template schema. It still enforces the system-level risk-level rules.
func (s *Service) validateCustomTemplate(ctx context.Context, in CreateInput) error {
	if s.tmplRepo == nil {
		return clinicalrecords.ErrInvalidInput
	}
	tpl, err := s.tmplRepo.Get(ctx, in.OrganizationID, in.TemplateID)
	if err != nil {
		return clinicalrecords.ErrInvalidInput
	}
	if tpl.Status != recordtemplates.StatusActive {
		return clinicalrecords.ErrInvalidInput
	}

	// Risk level is always required regardless of template format.
	if !clinicalrecords.IsValidRiskLevel(in.RiskLevel) {
		return clinicalrecords.ErrRiskRequired
	}
	if in.RecordType == clinicalrecords.RecordTypeDischarge {
		if !clinicalrecords.IsValidDischargeReason(in.DischargeReason) {
			return clinicalrecords.ErrInvalidInput
		}
	}

	// Validate sections against the template schema.
	allowed := make(map[string]recordtemplates.SectionDef, len(tpl.Schema))
	for _, sec := range tpl.Schema {
		allowed[sec.Key] = sec
	}
	for k := range in.Sections {
		if _, ok := allowed[k]; !ok {
			return clinicalrecords.ErrInvalidInput
		}
	}
	for _, sec := range tpl.Schema {
		if !sec.Required {
			continue
		}
		if clinicalrecords.IsEmptySection(in.Sections[sec.Key]) {
			return clinicalrecords.ErrMissingSection
		}
	}
	return nil
}
