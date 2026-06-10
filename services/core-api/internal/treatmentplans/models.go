package treatmentplans

import (
	"errors"
	"time"
)

var (
	ErrNotFound      = errors.New("treatment plan not found")
	ErrGoalNotFound  = errors.New("treatment goal not found")
	ErrActiveExists  = errors.New("patient already has an active treatment plan")
	ErrInvalidInput  = errors.New("invalid input")
	ErrInvalidStatus = errors.New("invalid status")
)

// PlanStatus maps the plan_status ENUM.
type PlanStatus string

const (
	PlanActive    PlanStatus = "ACTIVE"
	PlanCompleted PlanStatus = "COMPLETED"
	PlanAbandoned PlanStatus = "ABANDONED"
)

func ValidPlanStatus(s PlanStatus) bool {
	return s == PlanActive || s == PlanCompleted || s == PlanAbandoned
}

// GoalStatus maps the goal_status ENUM.
type GoalStatus string

const (
	GoalPending    GoalStatus = "PENDING"
	GoalInProgress GoalStatus = "IN_PROGRESS"
	GoalAchieved   GoalStatus = "ACHIEVED"
	GoalAbandoned  GoalStatus = "ABANDONED"
)

func ValidGoalStatus(s GoalStatus) bool {
	switch s {
	case GoalPending, GoalInProgress, GoalAchieved, GoalAbandoned:
		return true
	}
	return false
}

// Plan is the decrypted domain entity.
type Plan struct {
	ID             string
	OrganizationID string
	PatientID      string
	StaffID        string
	DEKID          string
	Status         PlanStatus
	Title          string
	StartDate      time.Time
	EndDate        *time.Time
	Goals          []*Goal
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Goal is the decrypted goal entity.
type Goal struct {
	ID            string
	PlanID        string
	Description   string
	ProgressNotes string
	Status        GoalStatus
	TargetDate    *time.Time
	SortOrder     int16
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// RawPlan is the database representation — clinical content still encrypted.
type RawPlan struct {
	ID             string
	OrganizationID string
	PatientID      string
	StaffID        string
	DEKID          string
	Status         PlanStatus
	TitleEnc       []byte
	StartDate      time.Time
	EndDate        *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// RawGoal is the database representation of a goal.
type RawGoal struct {
	ID               string
	PlanID           string
	DescriptionEnc   []byte
	ProgressNotesEnc []byte
	Status           GoalStatus
	TargetDate       *time.Time
	SortOrder        int16
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// EncKeyRow is the raw row from encryption_keys used to decrypt a plan's DEK.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}
