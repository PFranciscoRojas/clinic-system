package service

import (
	"math"
	"testing"
	"time"
)

// upload_ms is one of the four numbers the latency plan is measured against
// (docs/ai/PLAN_LATENCIA_AUDIO.md). The value only earns its place if a draft
// that was never timed stays out of the data: a missing measurement recorded as
// 0 ms would pull every percentile toward zero and quietly turn a slow upload
// path into a fast-looking one.
func TestUploadMillisReportsTheElapsedTime(t *testing.T) {
	start := time.Date(2026, 8, 8, 10, 0, 0, 0, time.UTC)
	got := uploadMillis(start, start.Add(1500*time.Millisecond))
	if got == nil {
		t.Fatal("a measured upload must produce a value")
	}
	if *got != 1500 {
		t.Fatalf("upload_ms = %d, want 1500", *got)
	}
}

func TestUploadMillisIsNilWhenNobodyMeasured(t *testing.T) {
	// The zero time.Time is what a caller that never set UploadStartedAt sends.
	// Turning it into a duration would report an upload that started in year 1.
	if got := uploadMillis(time.Time{}, time.Now()); got != nil {
		t.Fatalf("unmeasured upload produced %d ms, want NULL", *got)
	}
}

func TestUploadMillisKeepsAFastUploadDistinctFromNoMeasurement(t *testing.T) {
	// Zero is a legitimate reading (a tiny file on a fast link) and must reach
	// the column as 0, not as NULL — otherwise the two cases the nil return
	// exists to separate collapse back together.
	start := time.Date(2026, 8, 8, 10, 0, 0, 0, time.UTC)
	got := uploadMillis(start, start)
	if got == nil {
		t.Fatal("an upload measured at 0 ms must record 0, not NULL")
	}
	if *got != 0 {
		t.Fatalf("upload_ms = %d, want 0", *got)
	}
}

func TestUploadMillisRefusesToWriteANegative(t *testing.T) {
	// Unreachable through the handler, where both timestamps carry a monotonic
	// reading. Reachable from any other caller, and the column's CHECK would
	// reject it — failing the upload of a real clinical session over a
	// telemetry value.
	start := time.Date(2026, 8, 8, 10, 0, 0, 0, time.UTC)
	if got := uploadMillis(start, start.Add(-time.Second)); got != nil {
		t.Fatalf("backwards clock produced %d ms, want NULL", *got)
	}
}

func TestUploadMillisClampsInsteadOfWrapping(t *testing.T) {
	// The column is INTEGER. A duration past MaxInt32 that wrapped would land as
	// a negative and hit the same CHECK as above; clamping keeps the row
	// writable and the value obviously pinned.
	start := time.Date(2026, 8, 8, 10, 0, 0, 0, time.UTC)
	got := uploadMillis(start, start.Add(60*24*time.Hour))
	if got == nil {
		t.Fatal("an absurd but positive duration must still produce a value")
	}
	if *got != math.MaxInt32 {
		t.Fatalf("upload_ms = %d, want the clamp at %d", *got, math.MaxInt32)
	}
}
