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

// TenantSignupDetails carries the operator-alert data for a self-serve signup.
// Verified distinguishes the two lifecycle moments: false = the tenant was just
// provisioned (email pending); true = the owner confirmed their address.
type TenantSignupDetails struct {
	OrgName   string
	Slug      string
	AdminName string
	Email     string
	Phone     string // optional WhatsApp contact from the signup form
	Source    string // optional "how did you hear about us" answer
	Verified  bool
}

// TenantWelcomeDetails carries the data for the post-verification welcome email
// sent to the new tenant's owner.
type TenantWelcomeDetails struct {
	Name            string // display name — just a greeting
	LoginURL        string
	SupportWhatsApp string // intl number for the wa.me link; empty hides the CTA
}

// InvoiceEmailDetails carries the data for emailing a patient their payment
// receipt (the PDF travels separately as an attachment).
type InvoiceEmailDetails struct {
	OrgID         string // tenant whose branding stamps the email
	PatientName   string
	InvoiceNumber string // e.g. "F-000001"
	Amount        string // already formatted (e.g. "$80.000 COP")
	StatusLabel   string // Spanish status (e.g. "Pagada")
}

// PaymentReminderDetails carries the data for a pending-balance reminder email.
type PaymentReminderDetails struct {
	OrgID         string
	PatientName   string
	InvoiceNumber string
	Balance       string // formatted outstanding balance
	DueDate       string // optional, formatted; empty if none
}

// BookingVoucherDetails carries the data for a deferred (Efecty/cash) voucher email.
type BookingVoucherDetails struct {
	OrgID         string
	GuestName     string
	PatientEmail  string
	Modality      string // "Virtual" or "Presencial"
	AppointmentAt string // formatted date+time in local TZ
	Deadline      string // formatted voucher payment deadline
	VoucherURL    string // URL to reopen/print the voucher
}

// Notifier dispatches booking-lifecycle and consent emails.
// Implementations must not block — callers fire them in goroutines.
// Errors are logged internally; they never reach the HTTP response.
type Notifier interface {
	NewBooking(ctx context.Context, b BookingDetails, adminEmails []string)
	BookingPaidAdmin(ctx context.Context, b BookingDetails, adminEmails []string)
	BookingDeferredAdmin(ctx context.Context, d BookingVoucherDetails, adminEmails []string)
	BookingConflictAdmin(ctx context.Context, d BookingVoucherDetails, adminEmails []string)
	BookingConfirmed(ctx context.Context, b BookingDetails)
	BookingRejected(ctx context.Context, b BookingDetails)
	BookingVoucher(ctx context.Context, d BookingVoucherDetails)
	AppointmentReminder(ctx context.Context, b BookingDetails, hoursBefore int)
	ConsentSignLink(ctx context.Context, toEmail string, d ConsentLinkDetails)
	PasswordReset(ctx context.Context, toEmail string, d PasswordResetDetails)
	AccountVerification(ctx context.Context, toEmail string, d VerificationDetails)
	// TenantSignupAlert tells the platform operator a tenant signed up / verified.
	TenantSignupAlert(ctx context.Context, toEmail string, d TenantSignupDetails)
	// TenantWelcome greets the new tenant's owner once their email is confirmed.
	TenantWelcome(ctx context.Context, toEmail string, d TenantWelcomeDetails)
	// InvoiceReceipt emails the patient their payment receipt with the PDF attached.
	InvoiceReceipt(ctx context.Context, toEmail string, d InvoiceEmailDetails, pdf []byte) error
	// PaymentReminder nudges a patient about a pending balance.
	PaymentReminder(ctx context.Context, toEmail string, d PaymentReminderDetails) error
}

// NoopNotifier satisfies Notifier without sending anything.
// Used when RESEND_API_KEY is absent (dev/CI environments).
type NoopNotifier struct{}

func (NoopNotifier) NewBooking(_ context.Context, _ BookingDetails, _ []string)                    {}
func (NoopNotifier) BookingPaidAdmin(_ context.Context, _ BookingDetails, _ []string)              {}
func (NoopNotifier) BookingDeferredAdmin(_ context.Context, _ BookingVoucherDetails, _ []string)   {}
func (NoopNotifier) BookingConflictAdmin(_ context.Context, _ BookingVoucherDetails, _ []string)   {}
func (NoopNotifier) BookingConfirmed(_ context.Context, _ BookingDetails)                          {}
func (NoopNotifier) BookingRejected(_ context.Context, _ BookingDetails)                           {}
func (NoopNotifier) BookingVoucher(_ context.Context, _ BookingVoucherDetails)                     {}
func (NoopNotifier) AppointmentReminder(_ context.Context, _ BookingDetails, _ int)         {}
func (NoopNotifier) ConsentSignLink(_ context.Context, _ string, _ ConsentLinkDetails)      {}
func (NoopNotifier) PasswordReset(_ context.Context, _ string, _ PasswordResetDetails)      {}
func (NoopNotifier) AccountVerification(_ context.Context, _ string, _ VerificationDetails) {}
func (NoopNotifier) TenantSignupAlert(_ context.Context, _ string, _ TenantSignupDetails)   {}
func (NoopNotifier) TenantWelcome(_ context.Context, _ string, _ TenantWelcomeDetails)      {}
func (NoopNotifier) InvoiceReceipt(_ context.Context, _ string, _ InvoiceEmailDetails, _ []byte) error {
	return nil
}
func (NoopNotifier) PaymentReminder(_ context.Context, _ string, _ PaymentReminderDetails) error {
	return nil
}
