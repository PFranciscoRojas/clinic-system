package bookingrequests

import "time"

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusConfirmed Status = "CONFIRMED"
	StatusRejected  Status = "REJECTED"
	StatusCancelled Status = "CANCELLED"
)

type BookingRequest struct {
	ID             string     `json:"id"`
	OrganizationID string     `json:"organization_id"`
	FirstName      string     `json:"first_name"`
	LastName       string     `json:"last_name"`
	Email          string     `json:"email"`
	Phone          string     `json:"phone,omitempty"`
	Modality       string     `json:"modality"`
	PreferredDate  *string    `json:"preferred_date,omitempty"`
	PreferredTime  *string    `json:"preferred_time,omitempty"`
	Notes          *string    `json:"notes,omitempty"`
	Status         Status     `json:"status"`
	StaffNote      *string    `json:"staff_note,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	ResolvedAt     *time.Time `json:"resolved_at,omitempty"`
	ResolvedBy     *string    `json:"resolved_by,omitempty"`
}

type CreateInput struct {
	OrganizationID string
	FirstName      string
	LastName       string
	Email          string
	Phone          string
	Modality       string
	PreferredDate  *string
	PreferredTime  *string
	Notes          *string
}

type ResolveInput struct {
	ID             string
	OrganizationID string
	Status         Status
	StaffNote      *string
	ResolvedBy     string
}
