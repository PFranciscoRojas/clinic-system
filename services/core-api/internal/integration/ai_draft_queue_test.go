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
	JobsAhead      int
	BytesAhead     int64
	UnknownAhead   int
	OwnBytes       int64
	P50RTF         *float64
	CoveredMSAhead int64
	OwnCoveredMS   int64
}

// estimateAsOrg calls the function the way core-api does: as sghcp_app, on a
// connection scoped to one tenant.
func estimateAsOrg(t *testing.T, orgID, draftID string) queueEstimate {
	t.Helper()
	var q queueEstimate
	err := asOrg(t, orgID).QueryRow(context.Background(),
		`SELECT jobs_ahead, bytes_ahead, unknown_ahead, own_bytes, p50_rtf,
		        covered_ms_ahead, own_covered_ms
		   FROM ai_queue_estimate($1)`, draftID,
	).Scan(&q.JobsAhead, &q.BytesAhead, &q.UnknownAhead, &q.OwnBytes, &q.P50RTF,
		&q.CoveredMSAhead, &q.OwnCoveredMS)
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
		"covered_ms_ahead": true, "own_covered_ms": true,
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

// ── What the windows already transcribed (migration 000079) ─────────────────

// enqueueUpload is enqueueDraft plus the recording session the take came from,
// so the draft can be joined to a partial transcript.
func enqueueUpload(t *testing.T, tn tenant, apptID, uploadID string, createdAt time.Time, audioBytes *int64) string {
	t.Helper()
	var id string
	err := adminPool.QueryRow(context.Background(), `
		INSERT INTO ai_drafts (
		    organization_id, patient_id, requested_by, dek_id,
		    ai_model_version, whisper_model, status, created_at, audio_bytes,
		    appointment_id, upload_id
		) VALUES ($1, $2, $3, $4, 'test-model', 'base', 'PENDING', $5, $6, $7, $8)
		RETURNING id`,
		tn.OrgID, tn.PatientID, tn.UserID, tn.DekID, createdAt, audioBytes, apptID, uploadID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("enqueue ai_draft with upload: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(), `DELETE FROM ai_drafts WHERE id = $1`, id)
	})
	return id
}

func seedCoveredPartial(t *testing.T, tn tenant, apptID, uploadID string, coveredMS int64) {
	t.Helper()
	ctx := context.Background()
	var dekID string
	if err := adminPool.QueryRow(ctx,
		`INSERT INTO encryption_keys (encrypted_dek, key_source)
		 VALUES ($1, 'env:MASTER_KEY') RETURNING id`, []byte("dek-"+uploadID)).Scan(&dekID); err != nil {
		t.Fatal(err)
	}
	if _, err := adminPool.Exec(ctx, `
		INSERT INTO partial_transcripts
		       (organization_id, appointment_id, upload_id, dek_id, transcript_enc,
		        covered_parts, covered_ms)
		VALUES ($1, $2, $3, $4, $5, 5, $6)`,
		tn.OrgID, apptID, uploadID, dekID, []byte("cipher"), coveredMS); err != nil {
		t.Fatalf("seed partial: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(ctx, `DELETE FROM partial_transcripts WHERE upload_id = $1`, uploadID)
		_, _ = adminPool.Exec(ctx, `DELETE FROM encryption_keys WHERE id = $1`, dekID)
	})
}

func TestTheQueueKnowsHowMuchOfEachRecordingIsAlreadyText(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-covered")
	var appt string
	if err := adminPool.QueryRow(context.Background(),
		`SELECT id FROM appointments WHERE organization_id = $1 LIMIT 1`, tn.OrgID).Scan(&appt); err != nil {
		t.Fatal(err)
	}

	upload := "44444444-4444-4444-4444-444444444444"
	seedCoveredPartial(t, tn, appt, upload, 3_300_000) // 55 minutes
	me := enqueueUpload(t, tn, appt, upload, queueEpoch.Add(time.Minute), bytesPtr(10_800_000))

	got := estimateAsOrg(t, tn.OrgID, me)
	if got.OwnCoveredMS != 3_300_000 {
		t.Fatalf("own_covered_ms = %d, want 3300000: the session transcribed itself and the "+
			"estimate is about to quote the whole hour again", got.OwnCoveredMS)
	}
}

func TestARecordingAheadIsChargedForWhatIsLeftOfIt(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-covered-ahead")
	var appt string
	if err := adminPool.QueryRow(context.Background(),
		`SELECT id FROM appointments WHERE organization_id = $1 LIMIT 1`, tn.OrgID).Scan(&appt); err != nil {
		t.Fatal(err)
	}

	upload := "55555555-5555-5555-5555-555555555555"
	seedCoveredPartial(t, tn, appt, upload, 3_300_000)
	enqueueUpload(t, tn, appt, upload, queueEpoch.Add(time.Minute), bytesPtr(10_800_000))
	me := enqueueDraft(t, tn, "PENDING", queueEpoch.Add(2*time.Minute), bytesPtr(600_000))

	got := estimateAsOrg(t, tn.OrgID, me)
	if got.JobsAhead != 1 {
		t.Fatalf("jobs ahead = %d, want 1", got.JobsAhead)
	}
	if got.CoveredMSAhead != 3_300_000 {
		t.Fatalf("covered_ms_ahead = %d, want 3300000: the recording ahead is nearly done "+
			"and this professional is being told to come back after lunch", got.CoveredMSAhead)
	}
}

func TestADraftOfUnknownLengthLendsNoCoveredAudioToTheQueue(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "queue-covered-unknown")
	var appt string
	if err := adminPool.QueryRow(context.Background(),
		`SELECT id FROM appointments WHERE organization_id = $1 LIMIT 1`, tn.OrgID).Scan(&appt); err != nil {
		t.Fatal(err)
	}

	// A draft with no byte count is charged the default session length, and
	// that charge already stands for the whole of it. Subtracting covered audio
	// from a guess takes the estimate below the work that is actually left.
	upload := "66666666-6666-6666-6666-666666666666"
	seedCoveredPartial(t, tn, appt, upload, 3_300_000)
	enqueueUpload(t, tn, appt, upload, queueEpoch.Add(time.Minute), nil)
	me := enqueueDraft(t, tn, "PENDING", queueEpoch.Add(2*time.Minute), bytesPtr(600_000))

	got := estimateAsOrg(t, tn.OrgID, me)
	if got.UnknownAhead != 1 {
		t.Fatalf("unknown ahead = %d, want 1", got.UnknownAhead)
	}
	if got.CoveredMSAhead != 0 {
		t.Fatalf("covered_ms_ahead = %d, want 0 for a draft charged the default length", got.CoveredMSAhead)
	}
}

func TestTheRTFDividesByTheAudioThatWasActuallyTranscribed(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "rtf-tail")
	id := enqueueDraft(t, tn, "DRAFT_READY", queueEpoch.Add(time.Minute), bytesPtr(10_800_000))

	// An hour of session, of which only the last five minutes reached Whisper.
	if _, err := adminPool.Exec(context.Background(), `
		UPDATE ai_drafts SET transcribe_ms = 36000, audio_seconds = 3600,
		                     transcribed_seconds = 300
		 WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}

	var rtf float64
	if err := adminPool.QueryRow(context.Background(),
		`SELECT rtf FROM ai_drafts WHERE id = $1`, id).Scan(&rtf); err != nil {
		t.Fatal(err)
	}
	// 36 s of CPU on 300 s of audio is 0,12 — the box's real speed. Dividing by
	// the hour instead would report 0,01 and every ETA on screen would inherit
	// it and quote a tenth of the true wait.
	if rtf < 0.11 || rtf > 0.13 {
		t.Fatalf("rtf = %v, want ~0,12: the estimate is about to promise a tenth of the real wait", rtf)
	}
}

func TestARecordingTranscribedWholeStillMeasuresItsRTF(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "rtf-whole")
	id := enqueueDraft(t, tn, "DRAFT_READY", queueEpoch.Add(time.Minute), bytesPtr(10_800_000))

	// Every draft from before this migration, and every file picked by hand.
	if _, err := adminPool.Exec(context.Background(), `
		UPDATE ai_drafts SET transcribe_ms = 440000, audio_seconds = 3600 WHERE id = $1`,
		id); err != nil {
		t.Fatal(err)
	}
	var rtf float64
	if err := adminPool.QueryRow(context.Background(),
		`SELECT rtf FROM ai_drafts WHERE id = $1`, id).Scan(&rtf); err != nil {
		t.Fatal(err)
	}
	if rtf < 0.11 || rtf > 0.13 {
		t.Fatalf("rtf = %v, want ~0,122 from audio_seconds alone", rtf)
	}
}
