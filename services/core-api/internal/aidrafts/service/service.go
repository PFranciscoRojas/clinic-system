package service

import (
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
)

const (
	aiStream      = "ai_jobs"
	aiModelVer    = "claude-sonnet-4-6"
	whisperModel  = "base"
)

type Service struct {
	repo     aidrafts.Repository
	km       *crypto.KeyManager
	rdb      *redis.Client
	audioDir string
}

func New(repo aidrafts.Repository, km *crypto.KeyManager, rdb *redis.Client, audioDir string) *Service {
	return &Service{repo: repo, km: km, rdb: rdb, audioDir: audioDir}
}
