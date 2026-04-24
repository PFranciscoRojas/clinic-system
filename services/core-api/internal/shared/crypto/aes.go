package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
)

const KeySize = 32 // AES-256

// Seal encrypts plaintext with AES-256-GCM using key.
// Output layout: nonce (12 bytes) || ciphertext || GCM tag (16 bytes).
// Store the returned []byte directly in a BYTEA PostgreSQL column.
func Seal(key, plaintext []byte) ([]byte, error) {
	if len(key) != KeySize {
		return nil, errors.New("crypto: key must be 32 bytes for AES-256-GCM")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	// gcm.Seal appends ciphertext+tag to nonce slice
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// Open decrypts AES-256-GCM ciphertext produced by Seal.
func Open(key, ciphertext []byte) ([]byte, error) {
	if len(key) != KeySize {
		return nil, errors.New("crypto: key must be 32 bytes for AES-256-GCM")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := gcm.NonceSize()
	minLen := ns + gcm.Overhead()
	if len(ciphertext) < minLen {
		return nil, errors.New("crypto: ciphertext too short")
	}
	return gcm.Open(nil, ciphertext[:ns], ciphertext[ns:], nil)
}
