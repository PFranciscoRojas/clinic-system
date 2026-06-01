package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/clinicalrecords"
)

func (s *Service) Create(ctx context.Context, in CreateInput) (string, error) {
	if in.OrganizationID == "" || in.PatientID == "" || in.ResponsibleStaffID == "" || in.CreatedBy == "" {
		return "", clinicalrecords.ErrInvalidInput
	}
	if in.RecordType == "" || in.SessionDate.IsZero() {
		return "", clinicalrecords.ErrInvalidInput
	}

	dek, dekID, err := s.newDEK(ctx)
	if err != nil {
		return "", fmt.Errorf("generate DEK: %w", err)
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
			return "", fmt.Errorf("encrypt %s: %w", f.name, err)
		}
		*f.dest = enc
	}

	return s.repo.Create(ctx, clinicalrecords.CreateParams{
		OrganizationID:     in.OrganizationID,
		PatientID:          in.PatientID,
		ResponsibleStaffID: in.ResponsibleStaffID,
		CreatedBy:          in.CreatedBy,
		AppointmentID:      in.AppointmentID,
		DEKID:              dekID,
		RecordType:         in.RecordType,
		SessionDate:        in.SessionDate,
		SubjectiveEnc:      subjectiveEnc,
		ObjectiveEnc:       objectiveEnc,
		AssessmentEnc:      assessmentEnc,
		PlanEnc:            planEnc,
		RequiresCosign:     in.RequiresCosign,
		SupervisorID:       in.SupervisorID,
		ContentHash:        contentHash(in.Subjective, in.Objective, in.Assessment, in.Plan),
	})
}
