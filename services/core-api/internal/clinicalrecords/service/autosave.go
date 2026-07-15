package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

// CreateDraft creates the first autosave row for an in-progress note. It
// mints a DEK once (the expensive part) — every later tick should go through
// UpdateDraft instead. The row is left unfinalized (finalized_at NULL,
// session_number NULL) until Finalize: an abandoned draft never burns a
// session number or counts toward the open-process rule.
func (s *Service) CreateDraft(ctx context.Context, in CreateInput) (string, error) {
	if in.OrganizationID == "" || in.PatientID == "" || in.ResponsibleStaffID == "" || in.CreatedBy == "" {
		return "", clinicalrecords.ErrInvalidInput
	}
	if in.RecordType == "" || in.SessionDate.IsZero() {
		return "", clinicalrecords.ErrInvalidInput
	}

	if in.TemplateID != "" {
		if err := s.validateCustomTemplateLenient(ctx, in.OrganizationID, in.TemplateID, in.Sections, true); err != nil {
			return "", err
		}
	} else if err := clinicalrecords.ValidateTemplateV2Lenient(in.RecordType, in.Sections); err != nil {
		return "", err
	}

	// The open-process rule still applies — the record type was already
	// fixed by the format picker before autosave started, so this should
	// never surprise the professional. GetProcessDates only counts finalized
	// records, so an earlier abandoned draft can't block this one.
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

	risk := lenientRiskPtr(in.RiskLevel)
	riskStr := ""
	if risk != nil {
		riskStr = *risk
	}
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
		RiskLevel:          risk,
		RequiresCosign:     in.RequiresCosign,
		SupervisorID:       in.SupervisorID,
		ContentHash:        contentHashV2(sectionsJSON, riskStr, string(in.DischargeReason)),
		Finalized:          false,
	}
	if in.RecordType == clinicalrecords.RecordTypeDischarge && in.DischargeReason != "" {
		reason := string(in.DischargeReason)
		params.DischargeReason = &reason
	}
	return s.repo.Create(ctx, params)
}

// UpdateDraft re-encrypts the section payload of an existing, not-yet-finalized
// autosave row. Cheap: one DEK lookup + in-memory reseal, no new DEK minted.
func (s *Service) UpdateDraft(ctx context.Context, in UpdateInput) error {
	if in.ID == "" || in.OrganizationID == "" {
		return clinicalrecords.ErrInvalidInput
	}
	raw, err := s.repo.FindByID(ctx, in.OrganizationID, in.ID)
	if err != nil {
		return err
	}
	if raw.Status != clinicalrecords.StatusDraft {
		return clinicalrecords.ErrNotDraft
	}
	if in.Sections == nil {
		return clinicalrecords.ErrInvalidInput
	}

	if raw.TemplateID != "" {
		if err := s.validateCustomTemplateLenient(ctx, in.OrganizationID, raw.TemplateID, in.Sections, false); err != nil {
			return err
		}
	} else if err := clinicalrecords.ValidateTemplateV2Lenient(raw.RecordType, in.Sections); err != nil {
		return err
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return fmt.Errorf("load record DEK: %w", err)
	}
	sectionsEnc, sectionsJSON, err := sealSections(dek, in.Sections)
	if err != nil {
		return fmt.Errorf("encrypt sections: %w", err)
	}

	risk := lenientRiskPtr(in.RiskLevel)
	riskStr := ""
	if risk != nil {
		riskStr = *risk
	}
	params := clinicalrecords.UpdateParams{
		ID:             in.ID,
		OrganizationID: in.OrganizationID,
		SectionsEnc:    sectionsEnc,
		RiskLevel:      risk,
		ContentHash:    contentHashV2(sectionsJSON, riskStr, string(in.DischargeReason)),
		Finalize:       false,
	}
	if raw.RecordType == clinicalrecords.RecordTypeDischarge && in.DischargeReason != "" {
		reason := string(in.DischargeReason)
		params.DischargeReason = &reason
	}
	return s.repo.Update(ctx, params)
}

// Finalize is the explicit "Guardar" action on a row that already has an
// autosave draft: it runs the exact strict validation the original Create
// path runs, then marks the row finalized (assigning session_number for the
// first time) so it becomes a real, approvable clinical record.
func (s *Service) Finalize(ctx context.Context, in UpdateInput) error {
	if in.ID == "" || in.OrganizationID == "" {
		return clinicalrecords.ErrInvalidInput
	}
	raw, err := s.repo.FindByID(ctx, in.OrganizationID, in.ID)
	if err != nil {
		return err
	}
	if raw.Status != clinicalrecords.StatusDraft {
		return clinicalrecords.ErrNotDraft
	}
	if in.Sections == nil {
		return clinicalrecords.ErrInvalidInput
	}

	if raw.TemplateID != "" {
		if err := s.validateCustomTemplate(ctx, CreateInput{
			OrganizationID:  in.OrganizationID,
			TemplateID:      raw.TemplateID,
			RecordType:      raw.RecordType,
			Sections:        in.Sections,
			RiskLevel:       in.RiskLevel,
			DischargeReason: in.DischargeReason,
		}, false); err != nil {
			return err
		}
	} else if err := clinicalrecords.ValidateTemplateV2(raw.RecordType, in.Sections, in.RiskLevel, in.DischargeReason); err != nil {
		return err
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return fmt.Errorf("load record DEK: %w", err)
	}
	sectionsEnc, sectionsJSON, err := sealSections(dek, in.Sections)
	if err != nil {
		return fmt.Errorf("encrypt sections: %w", err)
	}

	risk := string(in.RiskLevel)
	params := clinicalrecords.UpdateParams{
		ID:             in.ID,
		OrganizationID: in.OrganizationID,
		SectionsEnc:    sectionsEnc,
		RiskLevel:      &risk,
		ContentHash:    contentHashV2(sectionsJSON, risk, string(in.DischargeReason)),
		Finalize:       true,
	}
	if raw.RecordType == clinicalrecords.RecordTypeDischarge {
		reason := string(in.DischargeReason)
		params.DischargeReason = &reason
	}
	return s.repo.Update(ctx, params)
}

// lenientRiskPtr stores NULL instead of an empty string when the
// professional hasn't picked a risk level yet — the column is nullable and
// "" is not a valid risk_level enum value.
func lenientRiskPtr(r clinicalrecords.RiskLevel) *string {
	if !clinicalrecords.IsValidRiskLevel(r) {
		return nil
	}
	s := string(r)
	return &s
}
