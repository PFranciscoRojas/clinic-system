package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	aidraftsrepo "sghcp/core-api/internal/aidrafts/repository"
	aidraftssvc "sghcp/core-api/internal/aidrafts/service"
	crrrepo "sghcp/core-api/internal/clinicalrecords/repository"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	rtrepo "sghcp/core-api/internal/recordtemplates/repository"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	svc svcPort
	crr crrPort
	db  *pgxpool.Pool

	// One limiter per route rather than one shared pool, built here so the
	// semaphores are per-server and not per-call to the route constructors.
	// See audio_limits.go for the sizes and for why the two pools are separate.
	limitWholeUpload func(http.Handler) http.Handler
	limitPartUpload  func(http.Handler) http.Handler
}

func New(db *pgxpool.Pool, km *crypto.KeyManager, rdb *redis.Client, audioDir string) *Handler {
	repo := aidraftsrepo.New(db)
	return &Handler{
		svc: aidraftssvc.New(repo, km, rdb, audioDir, db),

		limitWholeUpload: middleware.MaxInFlight(
			maxConcurrentWholeUploads, wholeUploadRetryAfter, busyMessage),
		limitPartUpload: middleware.MaxInFlight(
			maxConcurrentPartUploads, partUploadRetryAfter, busyMessage),
		// The template repo must be wired here too: approving a draft recorded
		// with a custom format calls Create with template_id, and a nil repo
		// makes every one of those fail as "datos inválidos".
		crr: crrsvc.New(crrrepo.New(db), km).WithTemplateRepo(rtrepo.New(db)),
		db:  db,
	}
}
