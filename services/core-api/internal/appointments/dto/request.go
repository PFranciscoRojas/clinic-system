package dto

type CreateRequest struct {
	PatientID   string `json:"patient_id"`
	StaffID     string `json:"staff_id"`
	ScheduledAt string `json:"scheduled_at"`
	DurationMin int    `json:"duration_min"`
	Modality    string `json:"modality"`
}

type CancelRequest struct {
	Reason string `json:"reason"`
}
