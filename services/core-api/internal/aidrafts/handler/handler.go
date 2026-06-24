package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	aidraftsrepo "sghcp/core-api/internal/aidrafts/repository"
	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
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
		svc: aidraftssvc.New(repo, km, rdb, audioDir),
		crr: crrsvc.New(crrrepo.New(db), km),
		db:  db,
	}
}
