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

	// Template v2 (sections payload): psychology-native formats with
	// open-process business rules. The legacy SOAP path stays untouched so
	// existing clients and the AI-draft pipeline keep working.
	if in.Sections != nil {
		return s.createV2(ctx, in)
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

func (s *Service) createV2(ctx context.Context, in CreateInput) (string, error) {
	if err := clinicalrecords.ValidateTemplateV2(in.RecordType, in.Sections, in.RiskLevel, in.DischargeReason); err != nil {
		return "", err
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
