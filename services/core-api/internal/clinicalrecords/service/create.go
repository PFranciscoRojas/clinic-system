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
		if err := s.validateCustomTemplate(ctx, in, true); err != nil {
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

// loadCustomTemplate fetches a custom template. When requireActive is true
// (starting a brand-new record/draft) it also enforces the template is still
// ACTIVE — a professional must pick from what's currently on offer. When
// false (continuing a draft, or finalizing/re-validating one that already
// exists) an ARCHIVED template is accepted: the record is pinned to this
// exact template_id and must keep validating against the schema it was
// created with, even after the template was later edited (which archives the
// old row — see recordtemplates/repository.Update).
func (s *Service) loadCustomTemplate(ctx context.Context, orgID, templateID string, requireActive bool) (*recordtemplates.Template, error) {
	if s.tmplRepo == nil {
		return nil, clinicalrecords.ErrInvalidInput
	}
	tpl, err := s.tmplRepo.Get(ctx, orgID, templateID)
	if err != nil {
		return nil, clinicalrecords.ErrInvalidInput
	}
	if requireActive && tpl.Status != recordtemplates.StatusActive {
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
// Used by the strict create/finalize paths; requireActive is true only for a
// brand-new record (Create) — Finalize passes false since the record is
// already pinned to its template_id and must keep validating against it even
// if that template version has since been archived.
func (s *Service) validateCustomTemplate(ctx context.Context, in CreateInput, requireActive bool) error {
	tpl, err := s.loadCustomTemplate(ctx, in.OrganizationID, in.TemplateID, requireActive)
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

// validateCustomTemplateLenient only checks the template (active, when
// requireActive) and that every section key actually belongs to its schema —
// no required-field or risk-level enforcement. Used by autosave: CreateDraft
// passes true (fresh draft, must start from a currently-active template),
// UpdateDraft passes false (continuing a draft already pinned to its
// template_id, even if that version has since been archived) so a mid-thought
// custom-template draft never gets rejected for being incomplete — or for the
// template having moved on since the draft was opened.
func (s *Service) validateCustomTemplateLenient(ctx context.Context, orgID, templateID string, sections map[string]any, requireActive bool) error {
	tpl, err := s.loadCustomTemplate(ctx, orgID, templateID, requireActive)
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
