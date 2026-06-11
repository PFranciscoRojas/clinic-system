package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

func (h *Handler) Routes(jwtSecret []byte) chi.Router {
	r := chi.NewRouter()

	// Public — no JWT required.
	r.Post("/login", h.login)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout)
	r.Post("/register", h.register)

	// Protected — valid JWT required.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(jwtSecret))
		r.Get("/me", h.me)
		r.Patch("/profile", h.updateProfile)
		r.Post("/change-password", h.changePassword)
		r.Post("/onboarding-complete", h.onboardingComplete)
		r.With(middleware.RequirePermission("users:create")).Post("/invite", h.invite)
		r.With(middleware.RequirePermission("users:update")).Post("/reset-password", h.resetPassword)
	})

	return r
}
