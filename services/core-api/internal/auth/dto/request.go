package dto

// LoginRequest is the JSON body for POST /api/v1/auth/login.
// Login resolves the tenant from the email alone — no org slug needed.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SignupRequest is the JSON body for POST /api/v1/auth/signup (public, self-serve).
// Signup creates a new organization, so the clinic/practice name (OrgName) is
// separate from the admin's own name (FullName).
type SignupRequest struct {
	OrgName        string `json:"org_name"`  // clinic/practice name → organization + slug
	FullName       string `json:"full_name"` // the admin's name → display name + profile
	Email          string `json:"email"`
	Password       string `json:"password"`
	IsProfessional bool   `json:"is_professional"` // true = owner also practices (bookable agenda)
}

// VerifyEmailRequest is the JSON body for POST /api/v1/auth/verify-email (public).
type VerifyEmailRequest struct {
	Token string `json:"token"`
}

// RefreshRequest is the JSON body for POST /api/v1/auth/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// LogoutRequest is the JSON body for POST /api/v1/auth/logout.
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// InviteRequest is the JSON body for POST /api/v1/auth/invite (admin only).
type InviteRequest struct {
	// RoleName defaults to PROFESSIONAL when empty.
	RoleName string `json:"role_name"`
}

// InviteResponse is returned by POST /api/v1/auth/invite.
type InviteResponse struct {
	InviteCode string `json:"invite_code"`
	ExpiresAt  string `json:"expires_at"` // RFC3339
}

// RegisterRequest is the JSON body for POST /api/v1/auth/register.
type RegisterRequest struct {
	InviteCode  string `json:"invite_code"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// ResetPasswordRequest is the JSON body for POST /api/v1/auth/reset-password (admin only).
type ResetPasswordRequest struct {
	// TargetEmail identifies the user to reset within the caller's org.
	TargetEmail string `json:"target_email"`
	NewPassword string `json:"new_password"`
}

// ForgotPasswordRequest is the JSON body for POST /api/v1/auth/forgot-password (public).
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ConfirmResetRequest is the JSON body for POST /api/v1/auth/reset-password-confirm (public).
type ConfirmResetRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}
