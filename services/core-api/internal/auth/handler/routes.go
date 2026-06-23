package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

func (h *Handler) Routes(jwtSecret []byte) chi.Router {
	r := chi.NewRouter()

	// Public — no JWT required.
	r.Post("/login", h.login)
	r.Post("/signup", h.signup)
	r.Post("/verify-email", h.verifyEmail)
	r.Post("/verify-email-change", h.verifyEmailChange)
	r.Post("/resend-verification", h.resendVerification)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout)
	r.Post("/register", h.register)
	r.Post("/forgot-password", h.forgotPassword)
	r.Post("/reset-password-confirm", h.confirmReset)

	// Protected — valid JWT required.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(jwtSecret))
		r.Get("/me", h.me)
		r.Patch("/profile", h.updateProfile)
		r.Patch("/me/email", h.requestEmailChange)
		r.Post("/change-password", h.changePassword)
		r.Post("/onboarding-complete", h.onboardingComplete)
		// Authorization is role-scoped inside the handler: a CLINIC_ADMIN may
		// invite any staff role, while a PROFESSIONAL may invite only support
		// roles (INTERN, RECEPTIONIST) for their own practice.
		r.Post("/invite", h.invite)
		r.With(middleware.RequirePermission("users:update")).Post("/reset-password", h.resetPassword)
	})

	return r
}
