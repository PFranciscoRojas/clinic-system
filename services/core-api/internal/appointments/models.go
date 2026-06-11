package appointments

import "time"

type Appointment struct {
	ID             string
	OrganizationID string
	PatientID      string // empty when the slot was reserved with just a guest name
	GuestName      string
	StaffID        string
	ScheduledAt    time.Time
	DurationMin    int
	Modality       string
	Status         string
	NotesEnc       []byte
	RescheduledTo  string
	CancelledBy    string
	CancelReason   string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type CreateParams struct {
	OrganizationID string
	PatientID      string
	GuestName      string
	StaffID        string
	ScheduledAt    time.Time
	DurationMin    int
	Modality       string
}

type ListFilter struct {
	PatientID string
	StaffID   string
	DateFrom  time.Time
	DateTo    time.Time
	Status    string
	Limit     int
	Offset    int
}

type CancelParams struct {
	AppointmentID  string
	OrganizationID string
	CancelledBy    string
	CancelReason   string
}
