package service

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
)

const (
	aiStream = "ai_jobs"
	// windowStream is a third lane, next to ai_jobs and ai_jobs_fast. A consumer
	// group hands out whatever entry is next and cannot route by content, so the
	// split is made at the producer — same reason the fast lane exists.
	//
	// Window jobs need a lane of their own rather than a share of the
	// transcription one: they run while sessions are being recorded, and if they
	// queued behind a finished session's full hour of audio they would arrive
	// after the moment they exist to get ahead of.
	windowStream = "ai_jobs_window"
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
	// windowTranscription enqueues window jobs during the session. Off by
	// default; see config.Config.WindowTranscription for why it is a decision
	// and not a default.
	windowTranscription bool
}

func New(repo aidrafts.Repository, km *crypto.KeyManager, rdb *redis.Client, audioDir string, db *pgxpool.Pool) *Service {
	return &Service{repo: repo, km: km, rdb: rdb, audioDir: audioDir, db: db}
}

// WithWindowTranscription turns on transcribing the session while it is still
// being recorded. Chainable rather than a constructor parameter so that every
// existing caller — and every test that builds a Service by hand — keeps the
// behaviour it has today without being edited.
func (s *Service) WithWindowTranscription(on bool) *Service {
	s.windowTranscription = on
	return s
}
