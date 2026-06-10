package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sghcp/core-api/internal/treatmentplans"
)

// CreatePlanInput carries the decrypted payload for a new plan.
type CreatePlanInput struct {
	OrganizationID string
	PatientID      string
	StaffID        string
	Title          string
	StartDate      time.Time
	Goals          []GoalInput
}

// GoalInput is one goal in a plan creation request.
type GoalInput struct {
	Description string
	TargetDate  *time.Time
}

func (s *Service) CreatePlan(ctx context.Context, in CreatePlanInput) (string, error) {
	if strings.TrimSpace(in.Title) == "" {
		return "", treatmentplans.ErrInvalidInput
	}

	active, err := s.repo.HasActivePlan(ctx, in.OrganizationID, in.PatientID)
	if err != nil {
		return "", err
	}
	if active {
		return "", treatmentplans.ErrActiveExists
	}

	dek, dekID, err := s.newDEK(ctx)
	if err != nil {
		return "", fmt.Errorf("generate plan DEK: %w", err)
	}

	titleEnc, err := sealField(dek, in.Title)
	if err != nil {
		return "", fmt.Errorf("seal title: %w", err)
	}

	planID, err := s.repo.CreatePlan(ctx, treatmentplans.CreatePlanParams{
		OrganizationID: in.OrganizationID,
		PatientID:      in.PatientID,
		StaffID:        in.StaffID,
		DEKID:          dekID,
		TitleEnc:       titleEnc,
		StartDate:      in.StartDate,
	})
	if err != nil {
		return "", err
	}

	for i, g := range in.Goals {
		if strings.TrimSpace(g.Description) == "" {
			continue
		}
		descEnc, err := sealField(dek, g.Description)
		if err != nil {
			return "", fmt.Errorf("seal goal description: %w", err)
		}
		if _, err := s.repo.CreateGoal(ctx, treatmentplans.CreateGoalParams{
			PlanID:         planID,
			DescriptionEnc: descEnc,
			TargetDate:     g.TargetDate,
			SortOrder:      int16(i),
		}); err != nil {
			return "", err
		}
	}

	return planID, nil
}

// GetPlan returns one decrypted plan with its goals.
func (s *Service) GetPlan(ctx context.Context, orgID, planID string) (*treatmentplans.Plan, error) {
	raw, err := s.repo.FindPlanByID(ctx, orgID, planID)
	if err != nil {
		return nil, err
	}
	dek, err := s.loadDEK(ctx, raw.DEKID)
	if err != nil {
		return nil, err
	}
	return s.decryptPlan(ctx, raw, dek)
}

// ListByPatient returns all decrypted plans (with goals) for a patient,
// active plan first.
func (s *Service) ListByPatient(ctx context.Context, orgID, patientID string) ([]*treatmentplans.Plan, error) {
	raws, err := s.repo.ListPlansByPatient(ctx, orgID, patientID)
	if err != nil {
		return nil, err
	}
	plans := make([]*treatmentplans.Plan, 0, len(raws))
	for _, raw := range raws {
		dek, err := s.loadDEK(ctx, raw.DEKID)
		if err != nil {
			return nil, err
		}
		p, err := s.decryptPlan(ctx, raw, dek)
		if err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, nil
}

// UpdatePlanInput updates title and/or status. Closing a plan stamps end_date.
type UpdatePlanInput struct {
	OrganizationID string
	PlanID         string
	Title          *string
	Status         *treatmentplans.PlanStatus
}

func (s *Service) UpdatePlan(ctx context.Context, in UpdatePlanInput) error {
	raw, err := s.repo.FindPlanByID(ctx, in.OrganizationID, in.PlanID)
	if err != nil {
		return err
	}

	params := treatmentplans.UpdatePlanParams{
		OrganizationID: in.OrganizationID,
		PlanID:         in.PlanID,
	}

	if in.Title != nil {
		if strings.TrimSpace(*in.Title) == "" {
			return treatmentplans.ErrInvalidInput
		}
		dek, err := s.loadDEK(ctx, raw.DEKID)
		if err != nil {
			return err
		}
		if params.TitleEnc, err = sealField(dek, *in.Title); err != nil {
			return fmt.Errorf("seal title: %w", err)
		}
	}

	if in.Status != nil {
		if !treatmentplans.ValidPlanStatus(*in.Status) {
			return treatmentplans.ErrInvalidStatus
		}
		params.Status = in.Status
		if *in.Status != treatmentplans.PlanActive {
			now := time.Now()
			params.EndDate = &now
		}
	}

	return s.repo.UpdatePlan(ctx, params)
}

func (s *Service) decryptPlan(ctx context.Context, raw *treatmentplans.RawPlan, dek []byte) (*treatmentplans.Plan, error) {
	title, err := openField(dek, raw.TitleEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt title: %w", err)
	}

	rawGoals, err := s.repo.ListGoalsByPlan(ctx, raw.ID)
	if err != nil {
		return nil, err
	}
	goals := make([]*treatmentplans.Goal, 0, len(rawGoals))
	for _, rg := range rawGoals {
		g, err := decryptGoal(rg, dek)
		if err != nil {
			return nil, err
		}
		goals = append(goals, g)
	}

	return &treatmentplans.Plan{
		ID:             raw.ID,
		OrganizationID: raw.OrganizationID,
		PatientID:      raw.PatientID,
		StaffID:        raw.StaffID,
		DEKID:          raw.DEKID,
		Status:         raw.Status,
		Title:          title,
		StartDate:      raw.StartDate,
		EndDate:        raw.EndDate,
		Goals:          goals,
		CreatedAt:      raw.CreatedAt,
		UpdatedAt:      raw.UpdatedAt,
	}, nil
}

func decryptGoal(raw *treatmentplans.RawGoal, dek []byte) (*treatmentplans.Goal, error) {
	desc, err := openField(dek, raw.DescriptionEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt goal description: %w", err)
	}
	notes, err := openField(dek, raw.ProgressNotesEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt goal notes: %w", err)
	}
	return &treatmentplans.Goal{
		ID:            raw.ID,
		PlanID:        raw.PlanID,
		Description:   desc,
		ProgressNotes: notes,
		Status:        raw.Status,
		TargetDate:    raw.TargetDate,
		SortOrder:     raw.SortOrder,
		CreatedAt:     raw.CreatedAt,
		UpdatedAt:     raw.UpdatedAt,
	}, nil
}
