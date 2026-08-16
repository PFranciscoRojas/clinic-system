package service

import (
	"testing"

	"sghcp/core-api/internal/aidrafts"
)

func f(v float64) *float64 { return &v }

// One hour of the recorder's own audio: 24 kbps mono.
const hourOfAudio int64 = 60 * 60 * recorderBytesPerSecond

func TestAnEmptyQueueQuotesOnlyThisRecording(t *testing.T) {
	got := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio, P50RTF: f(0.1224)})
	if got.JobsAhead != 0 {
		t.Fatalf("jobs ahead = %d, want 0", got.JobsAhead)
	}
	// 3600 s * 0,1224 = 440,6 s of transcription, plus the draft itself.
	if got.Seconds < 460 || got.Seconds > 480 {
		t.Fatalf("seconds = %d, want ~471 (one hour at RTF 0,1224 plus the draft)", got.Seconds)
	}
}

// The whole reason the estimate exists: the wait is dominated by other people's
// recordings, not by your own.
func TestRecordingsAheadDominateTheWait(t *testing.T) {
	alone := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio, P50RTF: f(0.1224)})
	queued := waitFrom(&aidrafts.QueueEstimate{
		OwnBytes: hourOfAudio, JobsAhead: 3, BytesAhead: 3 * hourOfAudio, P50RTF: f(0.1224),
	})
	if queued.Seconds < 4*alone.Seconds-120 {
		t.Fatalf("three hours of audio ahead gave %d s, barely more than %d s alone",
			queued.Seconds, alone.Seconds)
	}
	if queued.JobsAhead != 3 {
		t.Fatalf("jobs ahead = %d, want 3", queued.JobsAhead)
	}
}

func TestAJobOfUnknownLengthIsChargedASession(t *testing.T) {
	// A draft created before migration 000076 carries no byte count. Charging
	// it zero would quote the professional behind it a wait of seconds.
	got := waitFrom(&aidrafts.QueueEstimate{
		OwnBytes: hourOfAudio, JobsAhead: 1, UnknownAhead: 1, P50RTF: f(0.1224),
	})
	alone := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio, P50RTF: f(0.1224)})
	if got.Seconds <= alone.Seconds+60 {
		t.Fatalf("a job of unknown length ahead added %d s, want most of a session",
			got.Seconds-alone.Seconds)
	}
}

func TestOwnRecordingOfUnknownLengthIsNotInstantaneous(t *testing.T) {
	got := waitFrom(&aidrafts.QueueEstimate{OwnBytes: 0, P50RTF: f(0.1224)})
	if got.Seconds < 300 {
		t.Fatalf("seconds = %d, want a whole session charged when the size is unknown", got.Seconds)
	}
}

func TestWithoutASampleItFallsBackToTheMeasuredRTF(t *testing.T) {
	withSample := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio, P50RTF: f(fallbackRTF)})
	none := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio})
	if withSample.Seconds != none.Seconds {
		t.Fatalf("no sample gave %d s, the measured RTF gives %d s", none.Seconds, withSample.Seconds)
	}
}

// migration 000075 documents that `rtf` is generated and that a 10 ms recording
// yields an RTF in the thousands. One such row surviving into the median must
// not quote anyone a wait measured in days.
func TestAnAbsurdMedianIsNotTrusted(t *testing.T) {
	for _, rtf := range []float64{60_000, 0.0000001} {
		got := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio, P50RTF: f(rtf)})
		sane := waitFrom(&aidrafts.QueueEstimate{OwnBytes: hourOfAudio})
		if got.Seconds != sane.Seconds {
			t.Fatalf("RTF %v gave %d s; out-of-range medians must fall back to %d s",
				rtf, got.Seconds, sane.Seconds)
		}
	}
}

func TestAFinishedDraftHasNothingToEstimate(t *testing.T) {
	if got := waitFrom(nil); got != nil {
		t.Fatalf("waitFrom(nil) = %+v, want nil", got)
	}
}

// Never zero. A spinner next to "listo en 0 minutos" is the one answer that is
// always wrong.
func TestTheEstimateIsNeverZero(t *testing.T) {
	got := waitFrom(&aidrafts.QueueEstimate{OwnBytes: 1, P50RTF: f(0.02)})
	if got.Seconds <= 0 {
		t.Fatalf("seconds = %d, want more than zero", got.Seconds)
	}
}
