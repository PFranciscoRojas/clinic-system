package service

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// Enqueuing the transcription of the session while the session is still
// running (Fase 4, rebanada 3).
//
// Two things decide whether this is safe to have in the path of a live
// recording: that it is off unless somebody turned it on, and that nothing it
// does can cost a part.

func windowService(t *testing.T, on bool) (*Service, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	svc := &Service{
		audioDir: t.TempDir(),
		km:       testKeyManager(t),
		repo:     &fakePartialRepo{},
		rdb:      rdb,
	}
	return svc.WithWindowTranscription(on), mr
}

func windowJobs(t *testing.T, svc *Service) []redis.XMessage {
	t.Helper()
	entries, err := svc.rdb.XRange(context.Background(), windowStream, "-", "+").Result()
	if err != nil {
		t.Fatalf("read window stream: %v", err)
	}
	return entries
}

func TestNoWindowIsEnqueuedUntilSomebodyTurnsItOn(t *testing.T) {
	svc, _ := windowService(t, false)

	for i := range 12 {
		if err := appendPart(t, svc, i, "audio"); err != nil {
			t.Fatalf("part %d: %v", i, err)
		}
	}

	// Off is not a degraded mode: /audio/complete still transcribes the whole
	// take. What the flag decides is whether Whisper competes for the CPU at
	// the moment the professional is in the room, and that is a decision, not a
	// default.
	if n := len(windowJobs(t, svc)); n != 0 {
		t.Fatalf("the flag is off and %d window jobs were enqueued anyway", n)
	}
}

func TestAWindowIsEnqueuedOncePerFiveParts(t *testing.T) {
	svc, _ := windowService(t, true)

	for i := range 12 {
		if err := appendPart(t, svc, i, "audio"); err != nil {
			t.Fatalf("part %d: %v", i, err)
		}
	}

	// Parts 0..11 close a window on the 5th and the 10th. The two left over are
	// the tail, and the tail is what /audio/complete is for.
	if n := len(windowJobs(t, svc)); n != 2 {
		t.Fatalf("want 2 window jobs for 12 parts, got %d", n)
	}
}

func TestTheWindowJobCountsPartsNotIndexes(t *testing.T) {
	svc, _ := windowService(t, true)

	for i := range 5 {
		if err := appendPart(t, svc, i, "audio"); err != nil {
			t.Fatal(err)
		}
	}

	entries := windowJobs(t, svc)
	if len(entries) != 1 {
		t.Fatalf("want one window job, got %d", len(entries))
	}
	// Off by one here is not a crash, it is a minute of the session
	// re-transcribed by every window — or worse, skipped by the next one.
	if got := entries[0].Values["parts"]; got != "5" {
		t.Fatalf("window job claims %v parts, want 5", got)
	}
	if got := entries[0].Values["upload_id"]; got != testUp {
		t.Fatalf("window job addressed upload %v, want %s", got, testUp)
	}
}

func TestAPartIsNotLostBecauseTheWindowCouldNotBeEnqueued(t *testing.T) {
	svc, mr := windowService(t, true)
	mr.Close() // Redis is gone, mid-session

	// Same rule as the scratch row: the audio is already on disk when this
	// runs, and a professional does not lose a minute of a real session so that
	// a transcription could have started earlier.
	if err := appendPart(t, svc, 4, "audio"); err != nil {
		t.Fatalf("an unreachable Redis took the part down with it: %v", err)
	}
}

func TestTheWindowStreamIsNotTheOneFinishedSessionsQueueOn(t *testing.T) {
	// A window job that queued behind a finished session's full hour of audio
	// would arrive after the moment it exists to get ahead of. This is the one
	// property of the third lane that a rename could silently undo.
	if windowStream == aiStream {
		t.Fatal("window jobs share the transcription stream")
	}
	if windowStream == "" {
		t.Fatal("window jobs have no stream")
	}
}
