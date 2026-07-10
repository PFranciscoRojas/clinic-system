package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	aidraftsrepo "sghcp/core-api/internal/aidrafts/repository"
	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	rtrepo "sghcp/core-api/internal/recordtemplates/repository"
	"sghcp/core-api/internal/shared/crypto"
)

type Handler struct {
	svc svcPort
	crr crrPort
	db  *pgxpool.Pool
}

func New(db *pgxpool.Pool, km *crypto.KeyManager, rdb *redis.Client, audioDir string) *Handler {
	repo := aidraftsrepo.New(db)
	return &Handler{
		svc: aidraftssvc.New(repo, km, rdb, audioDir, db),
		// The template repo must be wired here too: approving a draft recorded
		// with a custom format calls Create with template_id, and a nil repo
		// makes every one of those fail as "datos inválidos".
		crr: crrsvc.New(crrrepo.New(db), km).WithTemplateRepo(rtrepo.New(db)),
		db:  db,
	}
}
