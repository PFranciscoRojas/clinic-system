package integration

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"sghcp/core-api/internal/aidrafts"
	aidraftsrepo "sghcp/core-api/internal/aidrafts/repository"
	"sghcp/core-api/internal/shared/dbctx"
)

// Where a session's transcript accumulates while the session is still running
// (migration 000077, Fase 4 of docs/ai/PLAN_LATENCIA_AUDIO.md).
//
// The row is scratch space holding clinical text, created from a request that
// carries three ids off a URL. Every test here runs through the repository as
// sghcp_app with the tenant GUC set — the way a part upload actually reaches
// it — because the questions worth asking are all about what RLS lets through.

// partialRepo is the real repository, bound to the app pool, so these tests
// exercise the SQL that ships rather than a paraphrase of it.
func partialRepo() *aidraftsrepo.Repository { return aidraftsrepo.New(appPool) }

// scoped returns a context carrying orgID's RLS-scoped connection, which is
// what TenantScope hands every repository in a real request.
func scoped(t *testing.T, orgID string) context.Context {
	t.Helper()
	return dbctx.WithQuerier(context.Background(), asOrg(t, orgID))
}

// apptOf returns the appointment seedTenant created for this org.
func apptOf(t *testing.T, tn tenant) string {
	t.Helper()
	var id string
	err := adminPool.QueryRow(context.Background(),
		`SELECT id FROM appointments WHERE organization_id = $1 LIMIT 1`, tn.OrgID).Scan(&id)
	if err != nil {
		t.Fatalf("find seeded appointment: %v", err)
	}
	return id
}

func ensure(t *testing.T, ctx context.Context, orgID, apptID, uploadID string) {
	t.Helper()
	err := partialRepo().EnsurePartial(ctx, aidrafts.EnsurePartialParams{
		OrganizationID: orgID,
		AppointmentID:  apptID,
		UploadID:       uploadID,
		EncryptedDEK:   []byte("wrapped-" + uploadID),
		KeySource:      "env:MASTER_KEY",
	})
	if err != nil {
		t.Fatalf("ensure partial: %v", err)
	}
}

func countPartials(t *testing.T, orgID, apptID, uploadID string) int {
	t.Helper()
	var n int
	err := adminPool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM partial_transcripts
		 WHERE organization_id = $1 AND appointment_id = $2 AND upload_id = $3`,
		orgID, apptID, uploadID).Scan(&n)
	if err != nil {
		t.Fatalf("count partials: %v", err)
	}
	return n
}

func TestOnePartialPerUploadNoMatterHowManyPartsArrive(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-idem-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	upload := uuid.NewString()
	ctx := scoped(t, tn.OrgID)

	// The service calls this once per part on purpose — sixty times in an hour —
	// so that nothing has to remember whether it is the first. All of the
	// idempotence lives in the statement.
	var keysBefore int
	if err := adminPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM encryption_keys`).Scan(&keysBefore); err != nil {
		t.Fatal(err)
	}
	for range 5 {
		ensure(t, ctx, tn.OrgID, appt, upload)
	}

	if n := countPartials(t, tn.OrgID, appt, upload); n != 1 {
		t.Fatalf("want exactly one partial for the upload, got %d", n)
	}

	// And the keys are the real cost of getting this wrong: minting one per
	// part and letting ON CONFLICT swallow the row would leave four wrapped
	// keys behind that name nothing.
	var keysAfter int
	if err := adminPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM encryption_keys`).Scan(&keysAfter); err != nil {
		t.Fatal(err)
	}
	if keysAfter-keysBefore != 1 {
		t.Fatalf("want one new encryption key for five ensures, got %d", keysAfter-keysBefore)
	}
}

func TestAPartialIsInvisibleToEveryOtherTenant(t *testing.T) {
	skipIfShort(t)
	mine := seedTenant(t, "partial-mine-"+uuid.NewString()[:8])
	theirs := seedTenant(t, "partial-theirs-"+uuid.NewString()[:8])
	appt := apptOf(t, mine)
	upload := uuid.NewString()

	ensure(t, scoped(t, mine.OrgID), mine.OrgID, appt, upload)

	if _, err := partialRepo().FindPartial(scoped(t, mine.OrgID), mine.OrgID, appt, upload); err != nil {
		t.Fatalf("the owning tenant cannot read its own partial: %v", err)
	}
	_, err := partialRepo().FindPartial(scoped(t, theirs.OrgID), mine.OrgID, appt, upload)
	if !errors.Is(err, aidrafts.ErrNotFound) {
		t.Fatalf("another tenant reached the partial: err=%v", err)
	}
}

func TestAnAppointmentTheTenantCannotSeeGetsNoPartial(t *testing.T) {
	skipIfShort(t)
	mine := seedTenant(t, "partial-probe-a-"+uuid.NewString()[:8])
	theirs := seedTenant(t, "partial-probe-b-"+uuid.NewString()[:8])
	foreign := apptOf(t, theirs)
	upload := uuid.NewString()

	// The appointment id comes straight off the URL and is only checked for
	// being a uuid. Without the EXISTS guard the foreign key would answer the
	// question for an attacker: a real id inserts, an invented one raises. Both
	// have to look the same from outside, and neither may fail the part upload
	// that is carrying a live session.
	err := partialRepo().EnsurePartial(scoped(t, mine.OrgID), aidrafts.EnsurePartialParams{
		OrganizationID: mine.OrgID,
		AppointmentID:  foreign,
		UploadID:       upload,
		EncryptedDEK:   []byte("wrapped"),
		KeySource:      "env:MASTER_KEY",
	})
	if err != nil {
		t.Fatalf("probing another tenant's appointment must be silent, got: %v", err)
	}
	if n := countPartials(t, mine.OrgID, foreign, upload); n != 0 {
		t.Fatalf("a partial was created against another tenant's appointment")
	}

	invented := uuid.NewString()
	err = partialRepo().EnsurePartial(scoped(t, mine.OrgID), aidrafts.EnsurePartialParams{
		OrganizationID: mine.OrgID,
		AppointmentID:  invented,
		UploadID:       upload,
		EncryptedDEK:   []byte("wrapped"),
		KeySource:      "env:MASTER_KEY",
	})
	if err != nil {
		t.Fatalf("an appointment id that exists nowhere must look the same, got: %v", err)
	}
}

func TestCoveredAudioCannotExistWithoutTheTextForIt(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-check-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	upload := uuid.NewString()
	ensure(t, scoped(t, tn.OrgID), tn.OrgID, appt, upload)

	// This is the constraint that protects the note. A row claiming covered
	// audio while holding no text makes the tail-only pass at /audio/complete
	// start after minutes it has no words for, and what comes out is a fluent
	// note describing a conversation with a hole in it. Nothing downstream
	// would ever notice, which is exactly why the database has to.
	_, err := adminPool.Exec(context.Background(), `
		UPDATE partial_transcripts SET covered_ms = 60000
		 WHERE organization_id = $1 AND upload_id = $2`, tn.OrgID, upload)
	if err == nil {
		t.Fatal("covered audio with no transcript was accepted")
	}
	if !strings.Contains(err.Error(), "partial_transcripts_covered_audio_has_text") {
		t.Fatalf("rejected for the wrong reason: %v", err)
	}
}

func TestDeletingAPartialTakesItsKeyWithIt(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-del-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	upload := uuid.NewString()
	ctx := scoped(t, tn.OrgID)
	ensure(t, ctx, tn.OrgID, appt, upload)

	got, err := partialRepo().FindPartial(ctx, tn.OrgID, appt, upload)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	dekID := got.DEKID

	if err := partialRepo().DeletePartial(ctx, tn.OrgID, appt, upload); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if n := countPartials(t, tn.OrgID, appt, upload); n != 0 {
		t.Fatal("the partial survived its own deletion")
	}

	// A wrapped key for plaintext that no longer exists is not dangerous, but it
	// is indistinguishable from one somebody still needs — and the org purge
	// decides what to drop by walking exactly these references.
	var keys int
	if err := adminPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM encryption_keys WHERE id = $1`, dekID).Scan(&keys); err != nil {
		t.Fatal(err)
	}
	if keys != 0 {
		t.Fatal("the partial's DEK outlived the partial")
	}
}

func TestTheSweepTakesOnlyWhatIsPastTheDeadline(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-sweep-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	ctx := scoped(t, tn.OrgID)

	stale, fresh := uuid.NewString(), uuid.NewString()
	ensure(t, ctx, tn.OrgID, appt, stale)
	ensure(t, ctx, tn.OrgID, appt, fresh)

	cutoff := time.Now().Add(-12 * time.Hour)
	if _, err := adminPool.Exec(context.Background(),
		`UPDATE partial_transcripts SET updated_at = $1 WHERE upload_id = $2`,
		cutoff.Add(-time.Hour), stale); err != nil {
		t.Fatal(err)
	}

	if _, err := partialRepo().SweepPartials(ctx, cutoff); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if n := countPartials(t, tn.OrgID, appt, stale); n != 0 {
		t.Fatal("an abandoned partial survived the sweep")
	}
	if n := countPartials(t, tn.OrgID, appt, fresh); n != 1 {
		t.Fatal("the sweep took a session that is still being recorded")
	}
}

// ── A partial transcript may only move forward (migration 000078) ────────────

// advance is the guarded UPDATE the worker runs: it claims the session up to
// coveredMS, and is a no-op if somebody already claimed further.
func advance(t *testing.T, orgID, upload string, coveredMS int64, text string) int64 {
	t.Helper()
	tag, err := adminPool.Exec(context.Background(), `
		UPDATE partial_transcripts
		   SET transcript_enc = $4, covered_parts = covered_parts + 1, covered_ms = $3
		 WHERE organization_id = $1 AND upload_id = $2
		   AND covered_ms < $3`,
		orgID, upload, coveredMS, []byte(text))
	if err != nil {
		t.Fatalf("advance to %d ms: %v", coveredMS, err)
	}
	return tag.RowsAffected()
}

func TestALateWindowCannotRewindTheSession(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-rewind-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	upload := uuid.NewString()
	ensure(t, scoped(t, tn.OrgID), tn.OrgID, appt, upload)

	if n := advance(t, tn.OrgID, upload, 1_200_000, "veinte minutos"); n != 1 {
		t.Fatalf("the first window did not land: %d rows", n)
	}

	// A window that covered the first five minutes, reclaimed from the PEL and
	// re-run after the one that covered twenty already finished. Redelivery in
	// a consumer group is not ordered, so this is a Tuesday, not a disaster
	// scenario.
	if n := advance(t, tn.OrgID, upload, 300_000, "cinco minutos"); n != 0 {
		t.Fatalf("a late window rewound the session: %d rows updated", n)
	}

	var coveredMS int64
	var text []byte
	err := adminPool.QueryRow(context.Background(),
		`SELECT covered_ms, transcript_enc FROM partial_transcripts WHERE upload_id = $1`,
		upload).Scan(&coveredMS, &text)
	if err != nil {
		t.Fatal(err)
	}
	if coveredMS != 1_200_000 || string(text) != "veinte minutos" {
		t.Fatalf("the session lost ground: covered_ms=%d text=%q", coveredMS, text)
	}
}

func TestAWriterThatDropsTheGuardIsStoppedByTheDatabase(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-trigger-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	upload := uuid.NewString()
	ensure(t, scoped(t, tn.OrgID), tn.OrgID, appt, upload)
	advance(t, tn.OrgID, upload, 1_200_000, "veinte minutos")

	// The guarded UPDATE above makes the ordinary losing job a silent no-op,
	// which is the right shape for it. This is for the writer that does not
	// have the guard — the second one somebody adds, in a hurry, six months
	// from now. Replacing twenty minutes of session with five produces a note
	// that reads perfectly and is missing the middle.
	_, err := adminPool.Exec(context.Background(), `
		UPDATE partial_transcripts SET covered_ms = 300000, transcript_enc = $2
		 WHERE upload_id = $1`, upload, []byte("cinco minutos"))
	if err == nil {
		t.Fatal("an unguarded rewind was accepted")
	}
	if !strings.Contains(err.Error(), "would go backwards") {
		t.Fatalf("rejected for the wrong reason: %v", err)
	}
}

func TestASessionMakingProgressIsNotSweptAway(t *testing.T) {
	skipIfShort(t)
	tn := seedTenant(t, "partial-touch-"+uuid.NewString()[:8])
	appt := apptOf(t, tn)
	upload := uuid.NewString()
	ensure(t, scoped(t, tn.OrgID), tn.OrgID, appt, upload)

	// A session recorded across a long afternoon keeps producing windows. If
	// updated_at only meant "created", the sweep would delete the transcript of
	// a session still being recorded and the professional would never know why
	// the draft took the old eleven minutes.
	if _, err := adminPool.Exec(context.Background(),
		`UPDATE partial_transcripts SET updated_at = now() - interval '20 hours'
		  WHERE upload_id = $1`, upload); err != nil {
		t.Fatal(err)
	}
	advance(t, tn.OrgID, upload, 600_000, "media hora")

	var age time.Duration
	if err := adminPool.QueryRow(context.Background(),
		`SELECT now() - updated_at FROM partial_transcripts WHERE upload_id = $1`,
		upload).Scan(&age); err != nil {
		t.Fatal(err)
	}
	if age > time.Minute {
		t.Fatalf("a window landed and updated_at stayed %v old", age)
	}
}
