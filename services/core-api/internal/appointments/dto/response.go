package dto

import (
	"sghcp/core-api/internal/appointments"
)

type AppointmentResponse struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	PatientID      string `json:"patient_id"`
	GuestName      string `json:"guest_name,omitempty"`
	StaffID        string `json:"staff_id"`
	ScheduledAt    string `json:"scheduled_at"`
	DurationMin    int    `json:"duration_min"`
	Modality       string `json:"modality"`
	Status         string `json:"status"`
	RescheduledTo  string `json:"rescheduled_to,omitempty"`
	CancelReason   string `json:"cancel_reason,omitempty"`
	StartedAt      string `json:"started_at,omitempty"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`

	Paid         bool   `json:"paid"`
	PaidAmount   int    `json:"paid_amount,omitempty"`
	PaidCurrency string `json:"paid_currency,omitempty"`
	PaymentRef   string `json:"payment_ref,omitempty"`
}

func ToResponse(a *appointments.Appointment) AppointmentResponse {
	startedAt := ""
	if a.StartedAt != nil {
		startedAt = a.StartedAt.Format("2006-01-02T15:04:05Z07:00")
	}
	return AppointmentResponse{
		ID:             a.ID,
		OrganizationID: a.OrganizationID,
		PatientID:      a.PatientID,
		GuestName:      a.GuestName,
		StaffID:        a.StaffID,
		ScheduledAt:    a.ScheduledAt.Format("2006-01-02T15:04:05Z07:00"),
		DurationMin:    a.DurationMin,
		Modality:       a.Modality,
		Status:         a.Status,
		RescheduledTo:  a.RescheduledTo,
		CancelReason:   a.CancelReason,
		StartedAt:      startedAt,
		CreatedAt:      a.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:      a.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		Paid:           a.Paid,
		PaidAmount:     a.PaidAmount,
		PaidCurrency:   a.PaidCurrency,
		PaymentRef:     a.PaymentRef,
	}
}
