package auth

import (
	"crypto/sha256"
	"fmt"
)

// HashEmail returns the SHA-256 hex digest used as the lookup key in users.email_hash.
func HashEmail(email string) string {
	h := sha256.Sum256([]byte(email))
	return fmt.Sprintf("%x", h)
}
