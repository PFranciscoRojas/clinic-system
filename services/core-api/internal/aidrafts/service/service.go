package service

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
)

const (
	aiStream     = "ai_jobs"
	aiModelVer   = "claude-sonnet-4-6"
	whisperModel = "base"
)

type Service struct {
	repo     aidrafts.Repository
	km       *crypto.KeyManager
	rdb      *redis.Client
	audioDir string
	db       *pgxpool.Pool
	// maxUploadBytes overrides MaxUploadBytes when non-zero. Only the tests set
	// it; see uploadCap in parts.go for why it exists.
	maxUploadBytes int64
}

func New(repo aidrafts.Repository, km *crypto.KeyManager, rdb *redis.Client, audioDir string, db *pgxpool.Pool) *Service {
	return &Service{repo: repo, km: km, rdb: rdb, audioDir: audioDir, db: db}
}
