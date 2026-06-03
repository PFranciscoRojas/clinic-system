package service

import (
	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/shared/crypto"
)

// Service implements all clinical record use cases.
type Service struct {
	repo clinicalrecords.Repository
	km   *crypto.KeyManager
}

func New(repo clinicalrecords.Repository, km *crypto.KeyManager) *Service {
	return &Service{repo: repo, km: km}
}
