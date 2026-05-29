package dto

// LoginRequest is the JSON body for POST /api/v1/auth/login.
type LoginRequest struct {
	OrgSlug  string `json:"org_slug"`
	Email    string `json:"email"`
	Password string `json:"password"`
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
