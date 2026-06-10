package consents

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	ChannelInOffice   = "IN_OFFICE"
	ChannelRemoteLink = "REMOTE_LINK"

	maxSignatureB64 = 500 * 1024       // 500 KB drawn-signature PNG (data URL)
	maxUploadBytes  = 10 * 1024 * 1024 // 10 MB scanned document
	signTokenTTL    = 7 * 24 * time.Hour

	signatureDataURLPrefix = "data:image/png;base64,"
)

var (
	ErrTokenExpired = errors.New("sign token expired")
	ErrTokenUsed    = errors.New("sign token already used")
	ErrNotAccepted  = errors.New("consent must be explicitly accepted")
	ErrBadSignature = errors.New("signature must be a PNG data URL under 500KB")
	ErrBadUpload    = errors.New("upload must be PDF/JPEG/PNG under 10MB")
)

// NewSignToken returns a 32-byte random URL-safe token. Only its hash is persisted.
func NewSignToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate sign token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum[:])
}

func TokenTTL() time.Duration { return signTokenTTL }

func ValidateSignature(accepted bool, signatureDataURL string) error {
	if !accepted {
		return ErrNotAccepted
	}
	if !strings.HasPrefix(signatureDataURL, signatureDataURLPrefix) {
		return ErrBadSignature
	}
	if len(signatureDataURL) > maxSignatureB64 || len(signatureDataURL) == len(signatureDataURLPrefix) {
		return ErrBadSignature
	}
	return nil
}

func ValidateUpload(contentType string, size int64) error {
	switch contentType {
	case "application/pdf", "image/jpeg", "image/png":
	default:
		return ErrBadUpload
	}
	if size <= 0 || size > maxUploadBytes {
		return ErrBadUpload
	}
	return nil
}

// BuildEvidence serializes the read-and-accepted proof; callers encrypt it with the row DEK.
func BuildEvidence(acceptedAt time.Time, channel, ip, userAgent string) []byte {
	out, _ := json.Marshal(map[string]string{
		"accepted_at": acceptedAt.UTC().Format(time.RFC3339),
		"channel":     channel,
		"ip":          ip,
		"user_agent":  userAgent,
	})
	return out
}

// Usable reports whether a sign token can still be redeemed.
func (t SignToken) Usable(now time.Time) error {
	if t.UsedAt != nil {
		return ErrTokenUsed
	}
	if now.After(t.ExpiresAt) {
		return ErrTokenExpired
	}
	return nil
}
