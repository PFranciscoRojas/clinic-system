package service

import "time"

type CreateInput struct {
	OrganizationID string
	PatientID      string
	GuestName      string
	StaffID        string
	ScheduledAt    time.Time
	DurationMin    int
	Modality       string
}

type ListInput struct {
	OrganizationID string
	PatientID      string
	StaffID        string
	DateFrom       time.Time
	DateTo         time.Time
	Status         string
	Limit          int
	Offset         int
}

type CancelInput struct {
	OrganizationID string
	AppointmentID  string
	RequestedBy    string
	Reason         string
}
