package service

import "sghcp/core-api/internal/appointments"

type Service struct {
	repo appointments.Repository
}

func New(repo appointments.Repository) *Service {
	return &Service{repo: repo}
}
