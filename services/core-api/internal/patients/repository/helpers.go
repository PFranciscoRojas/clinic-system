package repository

import "github.com/jackc/pgx/v5/pgtype"

// nullableBytes passes a []byte through unchanged; pgx v5 treats nil as SQL NULL for BYTEA columns.
func nullableBytes(b []byte) []byte { return b }

// nullableString wraps a string so pgx stores NULL when empty.
func nullableString(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}
