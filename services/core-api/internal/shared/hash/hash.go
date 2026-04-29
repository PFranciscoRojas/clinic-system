package hash

import (
	"crypto/sha256"
	"fmt"
	"strings"
)

// Normalize lowercases, trims whitespace, and SHA-256 hashes s.
// Used as the deterministic indexed lookup key for PII fields
// (email, paternal last name, document number) — same input always
// produces the same key regardless of the caller's layer.
func Normalize(s string) string {
	h := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(s))))
	return fmt.Sprintf("%x", h)
}
