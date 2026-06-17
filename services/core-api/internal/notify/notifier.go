package notify

import "context"

// BookingDetails carries the data needed to render notification emails.
// All pointer fields are already dereferenced (empty string if nil).
type BookingDetails struct {
	OrgID         string // tenant whose branding stamps the patient-facing email
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

// ConsentLinkDetails carries the data for the remote-signature email.
type ConsentLinkDetails struct {
	OrgID            string // tenant whose branding stamps the email
	PatientFirstName string
	ConsentTitle     string
	Link             string
}

// PasswordResetDetails carries the data for the self-service reset email.
type PasswordResetDetails struct {
	Name string // display name or email prefix — just a greeting
	Link string // one-time reset URL, expires within the hour
}

// VerificationDetails carries the data for the signup email-verification email.
type VerificationDetails struct {
	Name string // display name — just a greeting
	Link string // one-time verification URL, expires within 24h
}

// Notifier dispatches booking-lifecycle and consent emails.
// Implementations must not block — callers fire them in goroutines.
// Errors are logged internally; they never reach the HTTP response.
type Notifier interface {
	NewBooking(ctx context.Context, b BookingDetails, adminEmails []string)
	BookingPaidAdmin(ctx context.Context, b BookingDetails, adminEmails []string)
	BookingConfirmed(ctx context.Context, b BookingDetails)
	BookingRejected(ctx context.Context, b BookingDetails)
	AppointmentReminder(ctx context.Context, b BookingDetails, hoursBefore int)
	ConsentSignLink(ctx context.Context, toEmail string, d ConsentLinkDetails)
	PasswordReset(ctx context.Context, toEmail string, d PasswordResetDetails)
	AccountVerification(ctx context.Context, toEmail string, d VerificationDetails)
}

// NoopNotifier satisfies Notifier without sending anything.
// Used when RESEND_API_KEY is absent (dev/CI environments).
type NoopNotifier struct{}

func (NoopNotifier) NewBooking(_ context.Context, _ BookingDetails, _ []string)             {}
func (NoopNotifier) BookingPaidAdmin(_ context.Context, _ BookingDetails, _ []string)       {}
func (NoopNotifier) BookingConfirmed(_ context.Context, _ BookingDetails)                   {}
func (NoopNotifier) BookingRejected(_ context.Context, _ BookingDetails)                    {}
func (NoopNotifier) AppointmentReminder(_ context.Context, _ BookingDetails, _ int)         {}
func (NoopNotifier) ConsentSignLink(_ context.Context, _ string, _ ConsentLinkDetails)      {}
func (NoopNotifier) PasswordReset(_ context.Context, _ string, _ PasswordResetDetails)      {}
func (NoopNotifier) AccountVerification(_ context.Context, _ string, _ VerificationDetails) {}
