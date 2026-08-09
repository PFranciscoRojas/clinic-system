package integration

import (
	"context"
	"testing"
)

// The instrumentation columns from migration 000075 exist to settle one
// question: did a change to the pipeline actually make it faster? That makes
// `rtf` — seconds of CPU per second of audio — the number a decision rests on,
// and a generated column that computes something slightly different from what
// its name promises would be the worst possible bug here: silent, plausible,
// and pointing the wrong way.
//
// These tests pin the formula against a real Postgres, not against a comment.

// seedTimedDraft inserts a draft carrying the timings the worker would write.
// Nil arguments mean "not measured", which is a state the pipeline genuinely
// produces (a draft that failed before transcription, or a container whose
// ffprobe could not read the duration).
func seedTimedDraft(t *testing.T, tn tenant, transcribeMS *int, audioSeconds *float64) string {
	t.Helper()

	var draftID string
	err := adminPool.QueryRow(context.Background(), `
		INSERT INTO ai_drafts (
		    organization_id, patient_id, requested_by, dek_id,
		    ai_model_version, whisper_model,
		    transcribe_ms, audio_seconds
		) VALUES ($1, $2, $3, $4, 'test-model', 'base', $5, $6)
		RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, transcribeMS, audioSeconds,
	).Scan(&draftID)
	if err != nil {
		t.Fatalf("seed timed ai_draft: %v", err)
	}
	return draftID
}

func rtfOf(t *testing.T, draftID string) *float64 {
	t.Helper()
	var rtf *float64
	if err := adminPool.QueryRow(context.Background(),
		`SELECT rtf FROM ai_drafts WHERE id = $1`, draftID,
	).Scan(&rtf); err != nil {
		t.Fatalf("read rtf: %v", err)
	}
	return rtf
}

func ptrInt(v int) *int           { return &v }
func ptrFloat(v float64) *float64 { return &v }

func TestRTFIsCPUSecondsPerAudioSecond(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "draft-rtf-formula")

	// The measured production baseline: 58 min of audio, ~8.5 min of whisper
	// `base` on the 2-vCPU VPS. If this column ever stops returning ~0.15 for
	// these inputs, every comparison made with it is void.
	draftID := seedTimedDraft(t, tn, ptrInt(510_000), ptrFloat(3480))

	rtf := rtfOf(t, draftID)
	if rtf == nil {
		t.Fatal("rtf is NULL for a draft that has both operands")
	}
	if *rtf < 0.1455 || *rtf > 0.1475 {
		t.Fatalf("rtf = %v, want ~0.1466 (510 s of CPU over 3480 s of audio)", *rtf)
	}
}

func TestRTFIsNullWhenAnOperandIsMissing(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "draft-rtf-null")

	cases := []struct {
		name         string
		transcribeMS *int
		audioSeconds *float64
	}{
		// A container whose ffprobe cannot read a MediaRecorder WebM header and
		// whose transcript produced no segments: the duration is unknown, and a
		// guessed RTF would be worse than none.
		{"no duration", ptrInt(510_000), nil},
		{"no transcription time", nil, ptrFloat(3480)},
		{"nothing measured", nil, nil},
		// Division by zero must not raise and take the UPDATE — and the draft —
		// down with it. NULLIF turns it into "unknown", which it is.
		{"zero-length audio", ptrInt(510_000), ptrFloat(0)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			draftID := seedTimedDraft(t, tn, tc.transcribeMS, tc.audioSeconds)
			if rtf := rtfOf(t, draftID); rtf != nil {
				t.Fatalf("rtf = %v, want NULL when an operand is missing", *rtf)
			}
		})
	}
}

func TestRTFSurvivesAnAbsurdlyShortRecording(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "draft-rtf-overflow")

	// 10 ms of audio against 10 min of CPU is RTF 60000. A NUMERIC with a
	// declared precision would overflow here and abort the INSERT, which would
	// mean a telemetry column taking down a clinical draft.
	draftID := seedTimedDraft(t, tn, ptrInt(600_000), ptrFloat(0.01))

	rtf := rtfOf(t, draftID)
	if rtf == nil {
		t.Fatal("rtf is NULL for a draft that has both operands")
	}
	if *rtf != 60_000 {
		t.Fatalf("rtf = %v, want 60000", *rtf)
	}
}

func TestTimingsCannotBeNegative(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "draft-timings-check")

	cases := []struct {
		name   string
		column string
	}{
		{"upload_ms", "upload_ms"},
		{"transcribe_ms", "transcribe_ms"},
		{"llm_ms", "llm_ms"},
		{"audio_seconds", "audio_seconds"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := adminPool.Exec(context.Background(), `
				INSERT INTO ai_drafts (
				    organization_id, patient_id, requested_by, dek_id,
				    ai_model_version, whisper_model, `+tc.column+`
				) VALUES ($1, $2, $3, $4, 'test-model', 'base', -1)`,
				tn.OrgID, tn.PatientID, tn.UserID, tn.DekID,
			)
			if err == nil {
				t.Fatalf("a negative %s was accepted — a monotonic clock cannot produce one, so it is a bug worth refusing", tc.column)
			}
		})
	}
}
