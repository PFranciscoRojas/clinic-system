package dto

type CreateRequest struct {
	PatientID   string `json:"patient_id"`
	GuestName   string `json:"guest_name"`
	StaffID     string `json:"staff_id"`
	ScheduledAt string `json:"scheduled_at"`
	DurationMin int    `json:"duration_min"`
	Modality    string `json:"modality"`
}

type AssignPatientRequest struct {
	PatientID string `json:"patient_id"`
}

type CancelRequest struct {
	Reason string `json:"reason"`
}
