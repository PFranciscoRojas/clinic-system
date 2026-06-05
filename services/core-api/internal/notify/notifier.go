package notify

import "context"

// BookingDetails carries the data needed to render notification emails.
// All pointer fields are already dereferenced (empty string if nil).
type BookingDetails struct {
	ID            string
	FirstName     string
	LastName      string
	PatientEmail  string
	Modality      string // "Virtual" or "Presencial"
	PreferredDate string
	PreferredTime string
	Notes         string
	StaffNote     string
}

// Notifier dispatches booking-lifecycle emails.
// Implementations must not block — callers fire them in goroutines.
// Errors are logged internally; they never reach the HTTP response.
type Notifier interface {
	NewBooking(ctx context.Context, b BookingDetails, adminEmail string)
	BookingConfirmed(ctx context.Context, b BookingDetails)
	BookingRejected(ctx context.Context, b BookingDetails)
}

// NoopNotifier satisfies Notifier without sending anything.
// Used when RESEND_API_KEY is absent (dev/CI environments).
type NoopNotifier struct{}

func (NoopNotifier) NewBooking(_ context.Context, _ BookingDetails, _ string)  {}
func (NoopNotifier) BookingConfirmed(_ context.Context, _ BookingDetails)       {}
func (NoopNotifier) BookingRejected(_ context.Context, _ BookingDetails)        {}
