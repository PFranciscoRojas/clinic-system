package service

import (
	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/recordtemplates"
	"sghcp/core-api/internal/shared/crypto"
)

// Service implements all clinical record use cases.
type Service struct {
	repo     clinicalrecords.Repository
	km       *crypto.KeyManager
	tmplRepo recordtemplates.Repository // optional: nil means no custom templates
}

func New(repo clinicalrecords.Repository, km *crypto.KeyManager) *Service {
	return &Service{repo: repo, km: km}
}

// WithTemplateRepo wires the record-template repository so clinical records
// created with a custom template_id can be validated against it.
func (s *Service) WithTemplateRepo(r recordtemplates.Repository) *Service {
	s.tmplRepo = r
	return s
}
