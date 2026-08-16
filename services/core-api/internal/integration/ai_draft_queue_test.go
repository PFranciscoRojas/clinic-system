package integration

import (
	"context"
	"testing"
	"time"
)

// What the queue ETA rests on (migration 000076).
//
// The number on screen is only useful if it accounts for the recordings the
// professional cannot see. One worker serves every tenant and transcribes one
// session at a time, so the draft someone is waiting on is routinely behind
// another clinic's hour of audio. A tenant-scoped count would answer "nobody is
// ahead of you" and then take forty minutes — a confident, wrong number, which
// is worse than the "unos minutos" it replaced.
//
// These tests run the function as sghcp_app with the tenant GUC set, which is
// exactly how a request reaches it. Running them as the admin pool would prove
// nothing: the whole question is whether RLS lets the answer through.

// queueEpoch is where these tests build their queue: long before anything else
// in the suite. The function counts every waiting draft in the database, which
// is the point of it, so a test that seeded its drafts at `now` would also be
// counting whatever the rest of the suite left behind. Anchoring here means the
// only drafts that can be ahead of one of these are the others in the same
// test, and enqueueDraft removes those when the test ends.
var queueEpoch = time.Date(1990, 1, 1, 0, 0, 0, 0, time.UTC)

// enqueueDraft inserts a draft in a waiting state, at a controllable position in
// the queue. audioBytes nil is a draft from before this migration.
func enqueueDraft(t *testing.T, tn tenant, status string, createdAt time.Time, audioBytes *int64) string {
	t.Helper()
	var id string
	err := adminPool.QueryRow(context.Background(), `
		INSERT INTO ai_drafts (
		    organization_id, patient_id, requested_by, dek_id,
		    ai_model_version, whisper_model, status, created_at, audio_bytes
		) VALUES ($1, $2, $3, $4, 'test-model', 'base', $5, $6, $7)
		RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, status, createdAt, audioBytes,
	).Scan(&id)
	if err != nil {
		t.Fatalf("enqueue ai_draft: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(), `DELETE FROM ai_drafts WHERE id = $1`, id)
	})
	return id
}

type queueEstimate struct {
	JobsAhead    int
	BytesAhead   int64
	UnknownAhead int
	OwnBytes     int64
	P50RTF       *float64
}

// estimateAsOrg calls the function the way core-api does: as sghcp_app, on a
// connection scoped to one tenant.
func estimateAsOrg(t *testing.T, orgID, draftID string) queueEstimate {
	t.Helper()
	var q queueEstimate
	err := asOrg(t, orgID).QueryRow(context.Background(),
		`SELECT jobs_ahead, bytes_ahead, unknown_ahead, own_bytes, p50_rtf
		   FROM ai_queue_estimate($1)`, draftID,
	).Scan(&q.JobsAhead, &q.BytesAhead, &q.UnknownAhead, &q.OwnBytes, &q.P50RTF)
	if err != nil {
		t.Fatalf("ai_queue_estimate: %v", err)
	}
	return q
}

func bytesPtr(v int64) *int64 { return &v }

// The reason the function exists at all.
func TestTheQueueCountsRecordingsFromOtherTenants(t *testing.T) {
	skipIfShort(t)
	mine := seedTenant(t, "queue-mine")
	theirs := seedTenant(t, "queue-theirs")

	base := queueEpoch
	enqueueDraft(t, theirs, "PROCESSING", base, bytesPtr(3600*3000))
	enqueueDraft(t, theirs, "PENDING", base.Add(time.Minute), bytesPtr(1800*3000))
	me := enqueueDraft(t, mine, "PENDING", base.Add(2*time.Minute), bytesPtr(600*3000))

	got := estimateAsOrg(t, mine.OrgID, me)
	if got.JobsAhead != 2 {
		t.Fatalf("jobs ahead = %d, want 2 — a queue that stops at the tenant boundary "+
			"quotes a wait that ignores the worker's actual backlog", got.JobsAhead)
	}
	if want := int64((3600 + 1800) * 3000); got.BytesAhead != want {
		t.Fatalf("bytes ahead = %d, want %d", got.BytesAhead, want)
	}
	if got.OwnBytes != int64(600*3000) {
		t.Fatalf("own bytes = %d, want %d", got.OwnBytes, 600*3000)
	}
}

func TestOnlyWaitingDraftsAreAhead(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-finished")
	base := queueEpoch

	for _, status := range []string{"DRAFT_READY", "APPROVED", "REJECTED", "ERROR", "EMPTY", "SUPERSEDED"} {
		enqueueDraft(t, tn, status, base, bytesPtr(3600*3000))
	}
	me := enqueueDraft(t, tn, "PENDING", base.Add(time.Minute), bytesPtr(600*3000))

	if got := estimateAsOrg(t, tn.OrgID, me); got.JobsAhead != 0 {
		t.Fatalf("jobs ahead = %d, want 0 — a finished draft is not occupying the worker", got.JobsAhead)
	}
}

func TestADraftIsNotAheadOfItself(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-self")
	me := enqueueDraft(t, tn, "PROCESSING", queueEpoch, bytesPtr(600*3000))

	if got := estimateAsOrg(t, tn.OrgID, me); got.JobsAhead != 0 {
		t.Fatalf("jobs ahead = %d, want 0", got.JobsAhead)
	}
}

// Two drafts created in the same instant must not each count the other, or both
// professionals are quoted the longer wait and neither number is right.
func TestASharedTimestampBreaksTheTie(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-tie")
	at := queueEpoch

	a := enqueueDraft(t, tn, "PENDING", at, bytesPtr(600*3000))
	b := enqueueDraft(t, tn, "PENDING", at, bytesPtr(600*3000))

	ahead := estimateAsOrg(t, tn.OrgID, a).JobsAhead + estimateAsOrg(t, tn.OrgID, b).JobsAhead
	if ahead != 1 {
		t.Fatalf("the two drafts see %d jobs ahead between them, want exactly 1", ahead)
	}
}

// A draft created before migration 000076 has no byte count. Summing it as zero
// would tell whoever is behind it that an unknown recording costs nothing.
func TestARecordingOfUnknownLengthIsReportedAsUnknown(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-legacy")
	base := queueEpoch

	enqueueDraft(t, tn, "PENDING", base, nil)
	enqueueDraft(t, tn, "PENDING", base.Add(time.Minute), bytesPtr(600*3000))
	me := enqueueDraft(t, tn, "PENDING", base.Add(2*time.Minute), bytesPtr(600*3000))

	got := estimateAsOrg(t, tn.OrgID, me)
	if got.UnknownAhead != 1 {
		t.Fatalf("unknown ahead = %d, want 1", got.UnknownAhead)
	}
	if got.BytesAhead != int64(600*3000) {
		t.Fatalf("bytes ahead = %d, want only the draft whose size is known", got.BytesAhead)
	}
}

// The speed used to turn audio into minutes is this box's own, measured, and it
// must reach a tenant that has never finished a draft of its own.
func TestTheObservedSpeedComesFromEveryTenant(t *testing.T) {
	skipIfShort(t)
	measured := seedTenant(t, "queue-rtf-source")
	fresh := seedTenant(t, "queue-rtf-reader")

	for range 3 {
		var id string
		err := adminPool.QueryRow(context.Background(), `
			INSERT INTO ai_drafts (
			    organization_id, patient_id, requested_by, dek_id,
			    ai_model_version, whisper_model, status,
			    transcribe_ms, audio_seconds
			) VALUES ($1, $2, $3, $4, 'test-model', 'base', 'DRAFT_READY', 440000, 3600)
			RETURNING id`,
			measured.OrgID, measured.PatientID, measured.UserID, measured.DekID,
		).Scan(&id)
		if err != nil {
			t.Fatalf("seed finished draft: %v", err)
		}
	}

	me := enqueueDraft(t, fresh, "PENDING", queueEpoch, bytesPtr(600*3000))
	got := estimateAsOrg(t, fresh.OrgID, me)
	if got.P50RTF == nil {
		t.Fatal("p50 rtf is NULL although finished drafts exist — a new clinic would " +
			"be quoted against a constant forever")
	}
	if *got.P50RTF <= 0 || *got.P50RTF > 1 {
		t.Fatalf("p50 rtf = %v, want a plausible real-time factor", *got.P50RTF)
	}
}

// The function is reachable from the app role but hands back nothing that
// identifies anyone: five numbers, no row, no organization, no patient.
func TestTheEstimateCarriesNoTenantData(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-shape")
	me := enqueueDraft(t, tn, "PENDING", queueEpoch, bytesPtr(600*3000))

	rows, err := asOrg(t, tn.OrgID).Query(context.Background(),
		`SELECT * FROM ai_queue_estimate($1)`, me)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()

	want := map[string]bool{
		"jobs_ahead": true, "bytes_ahead": true, "unknown_ahead": true,
		"own_bytes": true, "p50_rtf": true,
	}
	for _, fd := range rows.FieldDescriptions() {
		if !want[string(fd.Name)] {
			t.Fatalf("ai_queue_estimate returns %q; the function crosses the tenant "+
				"boundary and may only return aggregates", fd.Name)
		}
		delete(want, string(fd.Name))
	}
	if len(want) != 0 {
		t.Fatalf("missing columns: %v", want)
	}
}
