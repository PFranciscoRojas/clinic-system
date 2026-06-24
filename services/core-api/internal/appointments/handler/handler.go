package handler

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	apptsrepo "sghcp/core-api/internal/appointments/repository"
	apptssvc "sghcp/core-api/internal/appointments/service"
)

type calSyncer interface {
	PushCreate(ctx context.Context, apptID, staffID, modality string, at time.Time, durMin int)
	PushCancel(ctx context.Context, apptID string)
}

type Handler struct {
	svc svcPort
	cal calSyncer
}

func New(db *pgxpool.Pool, cal calSyncer) *Handler {
	repo := apptsrepo.New(db)
	return &Handler{svc: apptssvc.New(repo), cal: cal}
}
