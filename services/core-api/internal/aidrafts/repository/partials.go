package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/dbctx"
)

// EnsurePartial gives an upload in progress somewhere to accumulate its
// transcript, minting the DEK the window jobs will encrypt under. Idempotent:
// called once per part, it does the work on the first one and nothing on the
// rest.
//
// One statement rather than a SELECT followed by an INSERT, because the obvious
// shape leaks keys. Minting the DEK first and letting ON CONFLICT swallow the
// duplicate would leave one unreferenced encryption_keys row behind per part —
// sixty an hour, per session, forever. Here the key is inserted only when the
// NOT EXISTS says the partial is missing, so the steady state writes nothing at
// all.
//
// The EXISTS on appointments is what makes the foreign key safe to have. The
// appointment id reaches here straight off the URL and is only checked for
// being a uuid, so without it a caller could name any appointment in the
// database and read the answer off the FK: an id that exists inserts, one that
// does not raises. Under RLS that SELECT only sees the caller's own tenant, so
// a foreign id is simply absent and the row is quietly not created — the part
// itself is already safely on disk either way.
//
// Two parts arriving at the same instant can both pass the NOT EXISTS; the
// unique constraint then rejects one of them and it leaves a single orphan key.
// That is a rounding error against a lock on every part upload, and the orphan
// is unreachable: it decrypts nothing because it is named by no row.
func (r *Repository) EnsurePartial(ctx context.Context, p aidrafts.EnsurePartialParams) error {
	const q = `
		WITH minted AS (
		    INSERT INTO encryption_keys (encrypted_dek, key_source)
		    SELECT $4, $5
		    WHERE EXISTS (SELECT 1 FROM appointments WHERE id = $2)
		      AND NOT EXISTS (
		        SELECT 1 FROM partial_transcripts
		        WHERE organization_id = $1 AND appointment_id = $2 AND upload_id = $3
		    )
		    RETURNING id
		)
		INSERT INTO partial_transcripts (organization_id, appointment_id, upload_id, dek_id)
		SELECT $1, $2, $3, id FROM minted
		ON CONFLICT ON CONSTRAINT partial_transcripts_one_per_upload DO NOTHING`

	_, err := dbctx.From(ctx, r.db).Exec(ctx, q,
		p.OrganizationID, p.AppointmentID, p.UploadID, p.EncryptedDEK, p.KeySource,
	)
	if err != nil {
		return fmt.Errorf("ensure partial transcript: %w", err)
	}
	return nil
}

// FindPartial reads one upload's accumulated transcript along with the wrapped
// DEK needed to open it. Returns ErrNotFound when the upload has no partial —
// which is the ordinary case for a session recorded before this existed, or one
// whose windows never ran.
func (r *Repository) FindPartial(ctx context.Context, orgID, appointmentID, uploadID string) (*aidrafts.PartialTranscript, error) {
	const q = `
		SELECT p.id, p.organization_id, p.appointment_id, p.upload_id, p.dek_id,
		       p.transcript_enc, p.covered_parts, p.covered_ms, p.updated_at,
		       k.encrypted_dek, k.key_source
		  FROM partial_transcripts p
		  JOIN encryption_keys k ON k.id = p.dek_id
		 WHERE p.organization_id = $1 AND p.appointment_id = $2 AND p.upload_id = $3`

	var t aidrafts.PartialTranscript
	err := dbctx.From(ctx, r.db).QueryRow(ctx, q, orgID, appointmentID, uploadID).Scan(
		&t.ID, &t.OrganizationID, &t.AppointmentID, &t.UploadID, &t.DEKID,
		&t.TranscriptEnc, &t.CoveredParts, &t.CoveredMS, &t.UpdatedAt,
		&t.EncryptedDEK, &t.KeySource,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, aidrafts.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find partial transcript: %w", err)
	}
	return &t, nil
}

// DeletePartial drops the scratch row and the DEK that only it named.
//
// Called when the draft has absorbed the text, and by the sweep for uploads
// nobody finished. The key goes in the same statement: leaving it would leave a
// wrapped key for plaintext that no longer exists, which is not dangerous but
// is indistinguishable from a key somebody still needs.
func (r *Repository) DeletePartial(ctx context.Context, orgID, appointmentID, uploadID string) error {
	const q = `
		WITH gone AS (
		    DELETE FROM partial_transcripts
		     WHERE organization_id = $1 AND appointment_id = $2 AND upload_id = $3
		    RETURNING dek_id
		)
		DELETE FROM encryption_keys WHERE id IN (SELECT dek_id FROM gone)`

	if _, err := dbctx.From(ctx, r.db).Exec(ctx, q, orgID, appointmentID, uploadID); err != nil {
		return fmt.Errorf("delete partial transcript: %w", err)
	}
	return nil
}

// SweepPartials deletes the partials of uploads nobody finished, within
// whatever tenant scope the caller has set. Returns how many were removed.
//
// The cutoff is the caller's because it belongs next to the one the audio parts
// use: a transcript of parts that have already been swept off the disk is text
// nothing will ever finish, and keeping the two deadlines in one place is the
// only way they stay the same number.
func (r *Repository) SweepPartials(ctx context.Context, olderThan time.Time) (int64, error) {
	const q = `
		WITH gone AS (
		    DELETE FROM partial_transcripts
		     WHERE updated_at < $1
		    RETURNING dek_id
		)
		DELETE FROM encryption_keys WHERE id IN (SELECT dek_id FROM gone)`

	tag, err := dbctx.From(ctx, r.db).Exec(ctx, q, olderThan)
	if err != nil {
		return 0, fmt.Errorf("sweep partial transcripts: %w", err)
	}
	return tag.RowsAffected(), nil
}
