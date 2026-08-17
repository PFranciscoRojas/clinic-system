package service

import (
	"context"
	"math"

	"sghcp/core-api/internal/aidrafts"
)

// How long a professional still has to wait for a draft.
//
// The estimate is deliberately built from measured numbers rather than a fixed
// "unos minutos": the wait is dominated by the queue, and the queue is why the
// same recording can be ready in eight minutes or in forty. See
// docs/ai/PLAN_LATENCIA_AUDIO.md §1.1 for where each constant was measured.
const (
	// recorderBytesPerSecond converts a take's size back into its duration.
	// The session recorder encodes Opus at a fixed 24 kbps mono
	// (AUDIO_BITS_PER_SECOND in services/frontend/src/lib/recording.ts), so for
	// anything it produced this is exact rather than an approximation. A file
	// the professional picked by hand may be at any bitrate; the ETA is then a
	// guess, which is what it is labelled as on screen.
	recorderBytesPerSecond = 24_000 / 8

	// fallbackRTF is the real-time factor to assume before this box has
	// measured its own: 0,1224, from the production VPS on a 3368 s session
	// (§1.1). Not the 0,04 the published faster-whisper benchmarks suggest —
	// those run on desktop CPUs, and budgeting against them is the mistake the
	// latency plan already made once.
	fallbackRTF = 0.1224

	// rtfFloor and rtfCeil bound the measured median before it is trusted.
	// `rtf` is a generated column and a 10 ms recording yields an RTF in the
	// thousands (see migration 000075); the median absorbs most of that, and
	// these bounds absorb the rest. Without them one absurd row could quote a
	// professional a wait measured in days.
	rtfFloor = 0.02
	rtfCeil  = 1.0

	// draftOverheadSeconds is everything after the transcription: Claude wrote
	// the draft in ~28 s across every measured run. Charged once per job in the
	// queue, this one included.
	draftOverheadSeconds = 30

	// unknownSessionSeconds is what a job of unknown length is charged. Drafts
	// created before migration 000076 have no byte count, and so does one whose
	// file could not be stat'd. Fifty minutes is the ordinary consulting hour.
	unknownSessionSeconds = 50 * 60
)

// QueueETA is what the API reports for a draft that has not finished yet.
type QueueETA struct {
	// Seconds is the expected wait from now until the draft is ready.
	Seconds int
	// JobsAhead is how many recordings are being transcribed before this one.
	// Reported separately because it is the part that explains the number: a
	// professional who sees "12 min" and knows three sessions are ahead is
	// being told something true about a shared queue, not about their audio.
	JobsAhead int
}

// EstimateWait reports how long a PENDING or PROCESSING draft still has to
// wait. Returns nil when the draft is not one the caller can read, or when it
// has already finished and there is nothing to estimate.
func (s *Service) EstimateWait(ctx context.Context, orgID, draftID, status string) (*QueueETA, error) {
	if status != "PENDING" && status != "PROCESSING" {
		return nil, nil
	}
	est, err := s.repo.QueueEstimate(ctx, draftID)
	if err != nil {
		return nil, err
	}
	return waitFrom(est), nil
}

// waitFrom is the arithmetic, split out so it can be tested without a database.
func waitFrom(est *aidrafts.QueueEstimate) *QueueETA {
	if est == nil {
		return nil
	}
	rtf := fallbackRTF
	if est.P50RTF != nil && *est.P50RTF >= rtfFloor && *est.P50RTF <= rtfCeil {
		rtf = *est.P50RTF
	}

	// What is left to transcribe, not what was recorded. With window
	// transcription on (Fase 4) most of a session is already text by the time
	// it reaches the queue, and charging the whole recording would quote a wait
	// several times the real one — for this draft and, worse, for everyone
	// behind a queue of sessions that are nearly done.
	//
	// Clamped at zero per side rather than on the total: a draft whose covered
	// audio somehow exceeds its own size must not lend the surplus to the queue
	// ahead of it and make somebody else's wait read as instantaneous.
	audio := remaining(durationOf(est.OwnBytes), est.OwnCoveredMS) +
		remaining(float64(est.BytesAhead)/recorderBytesPerSecond, est.CoveredMSAhead) +
		float64(est.UnknownAhead)*unknownSessionSeconds

	seconds := audio*rtf + float64(est.JobsAhead+1)*draftOverheadSeconds

	// Ceil rather than round: quoting 0 for a job that has not started is the
	// one answer that is always wrong.
	return &QueueETA{Seconds: int(math.Ceil(seconds)), JobsAhead: est.JobsAhead}
}

// remaining is audio seconds minus the seconds already turned into text, never
// below zero.
func remaining(seconds float64, coveredMS int64) float64 {
	left := seconds - float64(coveredMS)/1000
	if left < 0 {
		return 0
	}
	return left
}

// durationOf converts a take's size to seconds, charging the default session
// length when the size is unknown. Zero bytes means "not recorded", never "an
// empty recording": a take with no audio in it never reaches the queue.
func durationOf(bytes int64) float64 {
	if bytes <= 0 {
		return unknownSessionSeconds
	}
	return float64(bytes) / recorderBytesPerSecond
}
