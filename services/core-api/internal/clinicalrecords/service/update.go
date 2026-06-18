package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

func (s *Service) Update(ctx context.Context, in UpdateInput) error {
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
	return s.updateV2(ctx, raw, in)
}

func (s *Service) updateV2(ctx context.Context, raw *clinicalrecords.RawRecord, in UpdateInput) error {
	if err := clinicalrecords.ValidateTemplateV2(raw.RecordType, in.Sections, in.RiskLevel, in.DischargeReason); err != nil {
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
	}
	if raw.RecordType == clinicalrecords.RecordTypeDischarge {
		reason := string(in.DischargeReason)
		params.DischargeReason = &reason
	}
	return s.repo.Update(ctx, params)
}
