package treatmentplans

import (
	"context"
	"time"
)

// CreatePlanParams carries a new encrypted plan row.
type CreatePlanParams struct {
	OrganizationID string
	PatientID      string
	StaffID        string
	DEKID          string
	TitleEnc       []byte
	StartDate      time.Time
}

// CreateGoalParams carries a new encrypted goal row.
type CreateGoalParams struct {
	PlanID         string
	DescriptionEnc []byte
	TargetDate     *time.Time
	SortOrder      int16
}

// UpdatePlanParams updates title and/or status; nil fields are left untouched.
type UpdatePlanParams struct {
	OrganizationID string
	PlanID         string
	TitleEnc       []byte      // nil = keep
	Status         *PlanStatus // nil = keep
	EndDate        *time.Time  // set when the plan is closed
}

// UpdateGoalParams updates goal fields; nil fields are left untouched.
type UpdateGoalParams struct {
	OrganizationID   string
	PlanID           string
	GoalID           string
	DescriptionEnc   []byte      // nil = keep
	ProgressNotesEnc []byte      // nil = keep
	Status           *GoalStatus // nil = keep
	TargetDate       *time.Time  // nil = keep
}

// Repository defines the persistence contract for the treatmentplans domain.
type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error)

	CreatePlan(ctx context.Context, p CreatePlanParams) (string, error)
	FindPlanByID(ctx context.Context, orgID, planID string) (*RawPlan, error)
	ListPlansByPatient(ctx context.Context, orgID, patientID string) ([]*RawPlan, error)
	HasActivePlan(ctx context.Context, orgID, patientID string) (bool, error)
	UpdatePlan(ctx context.Context, p UpdatePlanParams) error

	CreateGoal(ctx context.Context, p CreateGoalParams) (string, error)
	ListGoalsByPlan(ctx context.Context, planID string) ([]*RawGoal, error)
	FindGoalByID(ctx context.Context, orgID, planID, goalID string) (*RawGoal, error)
	UpdateGoal(ctx context.Context, p UpdateGoalParams) error
}
