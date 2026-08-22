package service

import (
	"context"
	"log/slog"

	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/redisstream"
)

// ensurePartialTranscript gives this upload somewhere to accumulate the
// transcript the window jobs will produce, and mints the DEK they encrypt
// under. Idempotent, so calling it on every part is the whole coordination:
// nothing has to remember whether it is the first.
//
// Deliberately returns nothing. Everything about Fase 4 is an optimization
// layered on a pipeline that already works, and the moment a scratch row can
// fail a part upload it stops being one — the professional loses a minute of a
// real session so that a later transcription could have started earlier. The
// audio is already on disk when this runs; if this fails, the session simply
// gets transcribed the way it is transcribed today.
//
// This is also the reason it does not check whether windowing is enabled. The
// row is a few hundred bytes and a wrapped key, it is swept if nobody uses it,
// and having it exist unconditionally means turning windowing on is a decision
// about scheduling work rather than about schema that may or may not be there.
func (s *Service) ensurePartialTranscript(ctx context.Context, in AppendPartInput) {
	plainDEK, encDEK, keySource, err := s.km.GenerateDEK()
	if err != nil {
		slog.Default().Warn("partial transcript: cannot mint dek", "err", err)
		return
	}
	// Minted and immediately thrown away: nothing is encrypted here, the key
	// exists so the worker has one to open later. Zeroized anyway rather than
	// left for the GC, because "this copy does not matter" is how a key ends up
	// in a core dump.
	crypto.Zeroize(plainDEK)

	if err := s.repo.EnsurePartial(ctx, aidrafts.EnsurePartialParams{
		OrganizationID: in.OrganizationID,
		AppointmentID:  in.AppointmentID,
		UploadID:       in.UploadID,
		EncryptedDEK:   encDEK,
		KeySource:      keySource,
	}); err != nil {
		slog.Default().Warn("partial transcript: cannot create row",
			"appointment", in.AppointmentID, "err", err)
	}
}

// windowEveryParts is how much of the recording accumulates before a window job
// is enqueued. At the recorder's 60 s parts this is five minutes of audio, which
// is the same size the chunked transcriber already uses inside one job.
//
// Smaller windows would spread the work more evenly, and each one would pay the
// decode of everything before it again — the concatenation has to start at part
// zero, because a webm chunk that is not the first carries no header. Five is
// where that overhead stays a rounding error against the transcription itself.
const windowEveryParts = 5

// enqueueWindow asks for the session so far to be transcribed, up to the last
// silence the worker can find.
//
// Silent about its own failures, like everything else on this path. A window
// that is never enqueued costs nothing but the time it would have saved: the
// job at "Finalizar sesión" reads how far the partial got, which is zero, and
// transcribes the whole take exactly as it does today.
func (s *Service) enqueueWindow(ctx context.Context, in AppendPartInput) {
	if !s.windowTranscription {
		return
	}
	// Parts are numbered from zero, so this closes a window on the 5th, 10th,
	// 15th part. A part that is retried re-enqueues, which is harmless: the
	// worker refuses to redo work the partial already covers.
	if (in.Index+1)%windowEveryParts != 0 {
		return
	}

	dir, err := s.uploadDir(in.OrganizationID, in.AppointmentID, in.UploadID)
	if err != nil {
		return
	}

	err = s.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: windowStream,
		ID:     "*",
		MaxLen: redisstream.MaxLen,
		Approx: true,
		Values: map[string]any{
			"kind":           "window",
			"org_id":         in.OrganizationID,
			"appointment_id": in.AppointmentID,
			"upload_id":      in.UploadID,
			// How many parts exist, not the index of the last one. The worker
			// needs a count to compare against covered_parts, and off-by-one
			// here would make every window redo the previous one's last minute.
			"parts": in.Index + 1,
			// The directory rather than a convention the worker rebuilds. It
			// still has to know the part filenames; that shared shape is pinned
			// by TestTheWorkerAndCoreAPIAgreeOnPartFilenames.
			"parts_dir": dir,
		},
	}).Err()
	if err != nil {
		slog.Default().Warn("window transcription: cannot enqueue",
			"appointment", in.AppointmentID, "parts", in.Index+1, "err", err)
	}
}
