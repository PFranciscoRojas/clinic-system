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

	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return fmt.Errorf("load record DEK: %w", err)
	}

	type field struct {
		name  string
		value string
		dest  *[]byte
	}
	var (
		subjectiveEnc []byte
		objectiveEnc  []byte
		assessmentEnc []byte
		planEnc       []byte
	)
	for _, f := range []field{
		{"subjective", in.Subjective, &subjectiveEnc},
		{"objective", in.Objective, &objectiveEnc},
		{"assessment", in.Assessment, &assessmentEnc},
		{"plan", in.Plan, &planEnc},
	} {
		enc, err := sealField(dek, f.value)
		if err != nil {
			return fmt.Errorf("encrypt %s: %w", f.name, err)
		}
		*f.dest = enc
	}

	return s.repo.Update(ctx, clinicalrecords.UpdateParams{
		ID:             in.ID,
		OrganizationID: in.OrganizationID,
		SubjectiveEnc:  subjectiveEnc,
		ObjectiveEnc:   objectiveEnc,
		AssessmentEnc:  assessmentEnc,
		PlanEnc:        planEnc,
		ContentHash:    contentHash(in.Subjective, in.Objective, in.Assessment, in.Plan),
	})
}
