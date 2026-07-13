package appointments

import "time"

// PendingNote is a COMPLETED session that still has no finalized clinical
// record — surfaced so the professional doesn't forget to close it.
type PendingNote struct {
	AppointmentID string    `json:"appointment_id"`
	PatientID     string    `json:"patient_id"`
	ScheduledAt   time.Time `json:"scheduled_at"`
	// Latest active AI draft status for the session ('' = none):
	// PENDING/PROCESSING/DRAFT_READY.
	DraftStatus string `json:"draft_status"`
}

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
	StartedAt      *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time

	// Payment, surfaced from the linked paid public booking (if any). Paid is
	// false for in-clinic appointments with no online payment.
	Paid         bool
	PaidAmount   int    // whole COP
	PaidCurrency string // e.g. "COP"
	PaymentRef   string // MercadoPago payment id
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
