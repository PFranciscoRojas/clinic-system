package handler

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	patientsrepo "sghcp/core-api/internal/patients/repository"
	patientssvc "sghcp/core-api/internal/patients/service"
	"sghcp/core-api/internal/shared/crypto"
)

type Handler struct {
	svc  svcPort
	pool *pgxpool.Pool
}

func New(db *pgxpool.Pool, km *crypto.KeyManager) *Handler {
	repo := patientsrepo.New(db)
	return &Handler{svc: patientssvc.New(repo, km), pool: db}
}

// writePatientAudit records a patient data-change event in audit_log (best-effort).
func (h *Handler) writePatientAudit(orgID, userID, emailHash, patientID, ip, userAgent string) {
	h.pool.Exec(context.Background(), `
		INSERT INTO audit_log
			(organization_id, user_id, user_email_hash, action, resource_type,
			 resource_id, ip_address, user_agent, success)
		VALUES ($1::uuid, $2::uuid, $3, 'PATIENT_UPDATE', 'patient',
		        $4::uuid, $5::inet, $6, true)
	`, orgID, userID, emailHash, patientID, ip, userAgent)
}
