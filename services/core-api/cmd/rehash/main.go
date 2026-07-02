// Command rehash recomputes every stored PII search hash under the current
// SEARCH_PEPPER (HMAC-SHA256). One-shot migration for the switch away from
// unsalted SHA-256; safe to re-run (hashes are derived data, recomputed from
// the authoritative plaintext/ciphertext columns).
//
// Touches: users.email_hash (from the plaintext email column) and
// patients.{paternal_last_name_hash, full_name_search_hash, doc_search_hash}
// (decrypting the name/document ciphertexts with each patient's DEK).
//
// Runs inside the core-api container, which already has the required env:
//
//	docker compose exec core-api ./rehash
//
// Everything happens in ONE transaction — a failure leaves the table exactly
// as it was, never half-migrated (a mixed old/new state would break login and
// patient search for whichever half didn't run).
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5"

	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/hash"
)

func main() {
	if err := run(context.Background()); err != nil {
		slog.Error("rehash failed — no rows were changed", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	km, err := crypto.NewKeyManager(mustEnv("MASTER_KEY"))
	if err != nil {
		return err
	}
	if err := hash.Init(mustEnv("SEARCH_PEPPER")); err != nil {
		return err
	}

	conn, err := pgx.Connect(ctx, mustEnv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck — no-op after commit

	users, err := rehashUsers(ctx, tx)
	if err != nil {
		return fmt.Errorf("users: %w", err)
	}

	patients, err := rehashPatients(ctx, tx, km)
	if err != nil {
		return fmt.Errorf("patients: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	slog.Info("rehash complete", "users", users, "patients", patients)
	return nil
}

// rehashUsers recomputes email_hash from the plaintext email column.
func rehashUsers(ctx context.Context, tx pgx.Tx) (int, error) {
	rows, err := tx.Query(ctx, `SELECT id, email FROM users`)
	if err != nil {
		return 0, err
	}
	type row struct{ id, email string }
	var all []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.email); err != nil {
			rows.Close()
			return 0, err
		}
		all = append(all, r)
	}
	rows.Close()
	if rows.Err() != nil {
		return 0, rows.Err()
	}

	for _, r := range all {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET email_hash = $2 WHERE id = $1`,
			r.id, hash.Normalize(r.email)); err != nil {
			return 0, err
		}
	}
	return len(all), nil
}

// rehashPatients decrypts each patient's name/document fields with their DEK
// and recomputes the three search hashes, reproducing exactly what
// patients/service.Create writes (fullName = first + paternal [+ maternal];
// the middle name is NOT part of the search key).
//
// patients has FORCE row-level security, so the org GUC must be set before
// its rows are visible — iterate org by org (organizations itself is not
// RLS-scoped).
func rehashPatients(ctx context.Context, tx pgx.Tx, km *crypto.KeyManager) (int, error) {
	orgRows, err := tx.Query(ctx, `SELECT id FROM organizations`)
	if err != nil {
		return 0, err
	}
	var orgs []string
	for orgRows.Next() {
		var id string
		if err := orgRows.Scan(&id); err != nil {
			orgRows.Close()
			return 0, err
		}
		orgs = append(orgs, id)
	}
	orgRows.Close()
	if orgRows.Err() != nil {
		return 0, orgRows.Err()
	}

	total := 0
	for _, orgID := range orgs {
		// true = transaction-local, so the GUC dies with the tx no matter what.
		if _, err := tx.Exec(ctx, `SELECT set_config('app.current_org', $1, true)`, orgID); err != nil {
			return 0, err
		}
		n, err := rehashOrgPatients(ctx, tx, km)
		if err != nil {
			return 0, fmt.Errorf("org %s: %w", orgID, err)
		}
		total += n
	}
	return total, nil
}

func rehashOrgPatients(ctx context.Context, tx pgx.Tx, km *crypto.KeyManager) (int, error) {
	type row struct {
		id                                  string
		firstEnc, paternalEnc, maternalEnc  []byte
		docEnc, encryptedDEK                []byte
		keySource                           string
	}

	rows, err := tx.Query(ctx, `
		SELECT p.id, p.first_name_enc, p.paternal_last_name_enc,
		       p.maternal_last_name_enc, p.document_number_enc,
		       k.encrypted_dek, k.key_source
		FROM patients p
		JOIN encryption_keys k ON k.id = p.dek_id
	`)
	if err != nil {
		return 0, err
	}
	var all []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.firstEnc, &r.paternalEnc, &r.maternalEnc,
			&r.docEnc, &r.encryptedDEK, &r.keySource); err != nil {
			rows.Close()
			return 0, err
		}
		all = append(all, r)
	}
	rows.Close()
	if rows.Err() != nil {
		return 0, rows.Err()
	}

	for _, r := range all {
		if err := rehashOnePatient(ctx, tx, km, r.id, r.keySource, r.encryptedDEK,
			r.firstEnc, r.paternalEnc, r.maternalEnc, r.docEnc); err != nil {
			return 0, fmt.Errorf("patient %s: %w", r.id, err)
		}
	}
	return len(all), nil
}

func rehashOnePatient(ctx context.Context, tx pgx.Tx, km *crypto.KeyManager,
	id, keySource string, encryptedDEK, firstEnc, paternalEnc, maternalEnc, docEnc []byte) error {
	dek, err := km.DecryptDEK(keySource, encryptedDEK)
	if err != nil {
		return fmt.Errorf("decrypt DEK: %w", err)
	}
	defer crypto.Zeroize(dek)

	first, err := openField(dek, firstEnc)
	if err != nil {
		return fmt.Errorf("first_name: %w", err)
	}
	paternal, err := openField(dek, paternalEnc)
	if err != nil {
		return fmt.Errorf("paternal_last_name: %w", err)
	}
	maternal, err := openField(dek, maternalEnc)
	if err != nil {
		return fmt.Errorf("maternal_last_name: %w", err)
	}
	doc, err := openField(dek, docEnc)
	if err != nil {
		return fmt.Errorf("document_number: %w", err)
	}

	fullName := first + " " + paternal
	if maternal != "" {
		fullName += " " + maternal
	}
	var docHash *string
	if doc != "" {
		h := hash.Normalize(doc)
		docHash = &h
	}

	_, err = tx.Exec(ctx, `
		UPDATE patients
		SET paternal_last_name_hash = $2,
		    full_name_search_hash   = $3,
		    doc_search_hash         = $4
		WHERE id = $1
	`, id, hash.Normalize(paternal), hash.Normalize(fullName), docHash)
	return err
}

// openField decrypts a nullable BYTEA field; nil ciphertext means "" (the
// column was never set — e.g. no maternal last name, no document number).
func openField(dek, enc []byte) (string, error) {
	if enc == nil {
		return "", nil
	}
	b, err := crypto.Open(dek, enc)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required environment variable not set", "key", key)
		os.Exit(1)
	}
	return v
}
