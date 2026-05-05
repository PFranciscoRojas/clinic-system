package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	apptsrepo "sghcp/core-api/internal/appointments/repository"
	apptssvc "sghcp/core-api/internal/appointments/service"
)

type Handler struct {
	svc svcPort
}

func New(db *pgxpool.Pool) *Handler {
	repo := apptsrepo.New(db)
	return &Handler{svc: apptssvc.New(repo)}
}
