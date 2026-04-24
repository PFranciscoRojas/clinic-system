package crypto

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// KeyManager resolves Data Encryption Keys (DEKs) using envelope encryption.
// Bootstrap: master key from env var (key_source = "env:MASTER_KEY").
// Cloud (future): AWS KMS (key_source = "aws-kms:arn:...").
type KeyManager struct {
	masterKey []byte // pre-loaded, validated 32-byte key
}

// NewKeyManager creates a KeyManager from the given 64-char hex master key.
// Fails at startup if the key is missing or malformed — no silent failures.
func NewKeyManager(masterKeyHex string) (*KeyManager, error) {
	if masterKeyHex == "" {
		return nil, errors.New("crypto: MASTER_KEY is required")
	}
	key, err := hex.DecodeString(masterKeyHex)
	if err != nil {
		return nil, fmt.Errorf("crypto: MASTER_KEY must be a 64-char hex string: %w", err)
	}
	if len(key) != KeySize {
		return nil, fmt.Errorf("crypto: MASTER_KEY must decode to %d bytes, got %d", KeySize, len(key))
	}
	return &KeyManager{masterKey: key}, nil
}

// GenerateDEK creates a new random 32-byte Data Encryption Key and returns
// it in plaintext (for immediate use) and encrypted (for storage in DB).
// The plaintext DEK must be zeroized after use.
func (km *KeyManager) GenerateDEK() (plaintextDEK []byte, encryptedDEK []byte, keySource string, err error) {
	dek := make([]byte, KeySize)
	if _, err = rand.Read(dek); err != nil {
		return nil, nil, "", fmt.Errorf("crypto: failed to generate DEK: %w", err)
	}
	enc, err := Seal(km.masterKey, dek)
	if err != nil {
		return nil, nil, "", fmt.Errorf("crypto: failed to encrypt DEK: %w", err)
	}
	return dek, enc, "env:MASTER_KEY", nil
}

// DecryptDEK decrypts an encrypted DEK using the key identified by keySource.
// Caller must zeroize the returned DEK slice after use.
func (km *KeyManager) DecryptDEK(keySource string, encryptedDEK []byte) ([]byte, error) {
	if strings.HasPrefix(keySource, "env:") {
		// Bootstrap: only "env:MASTER_KEY" is supported; future versions can add
		// "env:MASTER_KEY_V2" during key rotation.
		return Open(km.masterKey, encryptedDEK)
	}
	// Future: "aws-kms:arn:..." → call AWS SDK
	return nil, fmt.Errorf("crypto: unsupported key source %q", keySource)
}

// Zeroize overwrites a byte slice with zeros to clear sensitive key material from memory.
func Zeroize(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
