package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

func (s *Service) Get(ctx context.Context, orgID, recordID string) (*clinicalrecords.ClinicalRecord, error) {
	raw, err := s.repo.FindByID(ctx, orgID, recordID)
	if err != nil {
		return nil, err
	}

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return nil, fmt.Errorf("load record DEK: %w", err)
	}

	rec := &clinicalrecords.ClinicalRecord{
		ID:                   raw.ID,
		TemplateVersion:      raw.TemplateVersion,
		TemplateID:           raw.TemplateID,
		RiskLevel:            raw.RiskLevel,
		DischargeReason:      raw.DischargeReason,
		OrganizationID:       raw.OrganizationID,
		PatientID:            raw.PatientID,
		ResponsibleStaffID:   raw.ResponsibleStaffID,
		CreatedBy:            raw.CreatedBy,
		AppointmentID:        raw.AppointmentID,
		DEKID:                raw.DEKID,
		RecordType:           raw.RecordType,
		SessionDate:          raw.SessionDate,
		Status:               raw.Status,
		ApprovedAt:           raw.ApprovedAt,
		RequiresCosign:       raw.RequiresCosign,
		SupervisorID:         raw.SupervisorID,
		SupervisorCosignedAt: raw.SupervisorCosignedAt,
		CreatedAt:            raw.CreatedAt,
		UpdatedAt:            raw.UpdatedAt,
		// Comes straight from FindByID and was being dropped here, which made
		// GET /clinical-records/{id} report `finalized: false` on a record that
		// had been signed — the detail screen showed a closed clinical record as
		// an open draft. Found by the acceptance scenario, not by any unit test:
		// every layer was individually correct and the mapping between two of
		// them was not.
		FinalizedAt: raw.FinalizedAt,
	}

	if rec.Sections, err = openSections(dek, raw.SectionsEnc); err != nil {
		return nil, fmt.Errorf("decrypt sections: %w", err)
	}
	return rec, nil
}

func (s *Service) List(ctx context.Context, f clinicalrecords.ListFilter) ([]*clinicalrecords.RecordMeta, error) {
	return s.repo.List(ctx, f)
}

func (s *Service) ListByOrg(ctx context.Context, f clinicalrecords.OrgListFilter) ([]*clinicalrecords.RecordMeta, error) {
	return s.repo.ListByOrg(ctx, f)
}

// ListApprovedForExport selects the records that go into a bulk archive. No
// decryption happens here — the caller renders each one through the same PDF
// path as the single-record export.
func (s *Service) ListApprovedForExport(ctx context.Context, f clinicalrecords.ExportFilter) ([]clinicalrecords.ExportRecord, error) {
	return s.repo.ListApprovedForExport(ctx, f)
}
