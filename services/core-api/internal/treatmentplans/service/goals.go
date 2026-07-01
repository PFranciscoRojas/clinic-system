package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sghcp/core-api/internal/treatmentplans"
)

// AddGoalInput carries a decrypted new goal for an existing plan.
type AddGoalInput struct {
	OrganizationID string
	PlanID         string
	Description    string
	TargetDate     *time.Time
}

func (s *Service) AddGoal(ctx context.Context, in AddGoalInput) (string, error) {
	if strings.TrimSpace(in.Description) == "" {
		return "", treatmentplans.ErrInvalidInput
	}

	plan, err := s.repo.FindPlanByID(ctx, in.OrganizationID, in.PlanID)
	if err != nil {
		return "", err
	}

	dek, err := s.loadDEK(ctx, plan.DEKID)
	if err != nil {
		return "", err
	}
	descEnc, err := sealField(dek, in.Description)
	if err != nil {
		return "", fmt.Errorf("seal goal description: %w", err)
	}

	existing, err := s.repo.ListGoalsByPlan(ctx, plan.ID)
	if err != nil {
		return "", err
	}

	return s.repo.CreateGoal(ctx, treatmentplans.CreateGoalParams{
		PlanID:         plan.ID,
		DescriptionEnc: descEnc,
		TargetDate:     in.TargetDate,
		SortOrder:      int16(len(existing)),
	})
}

// UpdateGoalInput updates any subset of a goal's fields.
type UpdateGoalInput struct {
	OrganizationID string
	PlanID         string
	GoalID         string
	Description    *string
	ProgressNotes  *string
	Status         *treatmentplans.GoalStatus
	TargetDate     *time.Time
}

// DeleteGoal removes a goal outright — treatment-plan goals are a living
// working checklist (unlike clinical_records, which is the legally retained
// historia clínica), so a hard delete is appropriate here.
func (s *Service) DeleteGoal(ctx context.Context, orgID, planID, goalID string) error {
	return s.repo.DeleteGoal(ctx, orgID, planID, goalID)
}

func (s *Service) UpdateGoal(ctx context.Context, in UpdateGoalInput) error {
	plan, err := s.repo.FindPlanByID(ctx, in.OrganizationID, in.PlanID)
	if err != nil {
		return err
	}
	if _, err := s.repo.FindGoalByID(ctx, in.OrganizationID, in.PlanID, in.GoalID); err != nil {
		return err
	}

	params := treatmentplans.UpdateGoalParams{
		OrganizationID: in.OrganizationID,
		PlanID:         in.PlanID,
		GoalID:         in.GoalID,
		TargetDate:     in.TargetDate,
	}

	if in.Status != nil {
		if !treatmentplans.ValidGoalStatus(*in.Status) {
			return treatmentplans.ErrInvalidStatus
		}
		params.Status = in.Status
	}

	if in.Description != nil || in.ProgressNotes != nil {
		dek, err := s.loadDEK(ctx, plan.DEKID)
		if err != nil {
			return err
		}
		if in.Description != nil {
			if strings.TrimSpace(*in.Description) == "" {
				return treatmentplans.ErrInvalidInput
			}
			if params.DescriptionEnc, err = sealField(dek, *in.Description); err != nil {
				return fmt.Errorf("seal goal description: %w", err)
			}
		}
		if in.ProgressNotes != nil {
			if params.ProgressNotesEnc, err = sealField(dek, *in.ProgressNotes); err != nil {
				return fmt.Errorf("seal goal notes: %w", err)
			}
		}
	}

	return s.repo.UpdateGoal(ctx, params)
}
