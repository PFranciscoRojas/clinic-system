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
		ID:                  raw.ID,
		OrganizationID:      raw.OrganizationID,
		PatientID:           raw.PatientID,
		ResponsibleStaffID:  raw.ResponsibleStaffID,
		CreatedBy:           raw.CreatedBy,
		AppointmentID:       raw.AppointmentID,
		DEKID:               raw.DEKID,
		RecordType:          raw.RecordType,
		SessionDate:         raw.SessionDate,
		Status:              raw.Status,
		ApprovedAt:          raw.ApprovedAt,
		RequiresCosign:      raw.RequiresCosign,
		SupervisorID:        raw.SupervisorID,
		SupervisorCosignedAt: raw.SupervisorCosignedAt,
		CreatedAt:           raw.CreatedAt,
		UpdatedAt:           raw.UpdatedAt,
	}

	type field struct {
		dst  *string
		src  []byte
		name string
	}
	for _, f := range []field{
		{&rec.Subjective, raw.SubjectiveEnc, "subjective"},
		{&rec.Objective, raw.ObjectiveEnc, "objective"},
		{&rec.Assessment, raw.AssessmentEnc, "assessment"},
		{&rec.Plan, raw.PlanEnc, "plan"},
	} {
		if *f.dst, err = openField(dek, f.src); err != nil {
			return nil, fmt.Errorf("decrypt %s: %w", f.name, err)
		}
	}

	return rec, nil
}

func (s *Service) List(ctx context.Context, f clinicalrecords.ListFilter) ([]*clinicalrecords.RecordMeta, error) {
	return s.repo.List(ctx, f)
}
