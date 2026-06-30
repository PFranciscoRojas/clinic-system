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
		Finalized:          true,
	}
	if in.RecordType == clinicalrecords.RecordTypeDischarge {
		reason := string(in.DischargeReason)
		params.DischargeReason = &reason
	}
	return s.repo.Create(ctx, params)
}

// loadActiveCustomTemplate fetches and validates a custom template is usable,
// shared by both the strict and lenient validation paths below.
func (s *Service) loadActiveCustomTemplate(ctx context.Context, orgID, templateID string) (*recordtemplates.Template, error) {
	if s.tmplRepo == nil {
		return nil, clinicalrecords.ErrInvalidInput
	}
	tpl, err := s.tmplRepo.Get(ctx, orgID, templateID)
	if err != nil {
		return nil, clinicalrecords.ErrInvalidInput
	}
	if tpl.Status != recordtemplates.StatusActive {
		return nil, clinicalrecords.ErrInvalidInput
	}
	return tpl, nil
}

// allowedCustomKeys builds the section-key whitelist for a custom template —
// shared by the strict and lenient key checks.
func allowedCustomKeys(tpl *recordtemplates.Template) map[string]recordtemplates.SectionDef {
	allowed := make(map[string]recordtemplates.SectionDef, len(tpl.Schema))
	for _, sec := range tpl.Schema {
		allowed[sec.Key] = sec
	}
	return allowed
}

// validateCustomTemplate checks the section payload against the custom
// template schema. It still enforces the system-level risk-level rules.
// Used by the strict create/finalize paths only.
func (s *Service) validateCustomTemplate(ctx context.Context, in CreateInput) error {
	tpl, err := s.loadActiveCustomTemplate(ctx, in.OrganizationID, in.TemplateID)
	if err != nil {
		return err
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

	allowed := allowedCustomKeys(tpl)
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

// validateCustomTemplateLenient only checks the template is active and that
// every section key actually belongs to its schema — no required-field or
// risk-level enforcement. Used by autosave (CreateDraft/UpdateDraft) so a
// mid-thought custom-template draft never gets rejected for being incomplete.
func (s *Service) validateCustomTemplateLenient(ctx context.Context, orgID, templateID string, sections map[string]any) error {
	tpl, err := s.loadActiveCustomTemplate(ctx, orgID, templateID)
	if err != nil {
		return err
	}
	allowed := allowedCustomKeys(tpl)
	for k := range sections {
		if _, ok := allowed[k]; !ok {
			return clinicalrecords.ErrInvalidInput
		}
	}
	return nil
}
