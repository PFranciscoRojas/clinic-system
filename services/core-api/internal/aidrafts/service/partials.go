package service

import (
	"context"
	"log/slog"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
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
