package crypto

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"strings"
	"testing"
)

func testMasterKeyHex(t *testing.T) string {
	t.Helper()
	k := make([]byte, KeySize)
	if _, err := rand.Read(k); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	return hex.EncodeToString(k)
}

func newTestKeyManager(t *testing.T) *KeyManager {
	t.Helper()
	km, err := NewKeyManager(testMasterKeyHex(t))
	if err != nil {
		t.Fatalf("NewKeyManager: %v", err)
	}
	return km
}

// TestNewKeyManagerRejectsBadMasterKey covers the fail-closed startup contract:
// a malformed MASTER_KEY must stop the process, never degrade to a weak key.
func TestNewKeyManagerRejectsBadMasterKey(t *testing.T) {
	cases := []struct {
		name string
		hex  string
	}{
		{"empty", ""},
		{"not hex", strings.Repeat("z", 64)},
		{"odd length", strings.Repeat("a", 63)},
		{"one byte short", strings.Repeat("ab", KeySize-1)},
		{"one byte long", strings.Repeat("ab", KeySize+1)},
		{"aes-128 sized", strings.Repeat("ab", 16)},
		{"whitespace only", "   "},
		{"valid hex with trailing newline", strings.Repeat("ab", KeySize) + "\n"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			km, err := NewKeyManager(tc.hex)
			if err == nil {
				t.Fatalf("NewKeyManager accepted %q, want error", tc.hex)
			}
			if km != nil {
				t.Error("NewKeyManager returned a non-nil manager alongside an error")
			}
		})
	}
}

func TestNewKeyManagerAcceptsValidMasterKey(t *testing.T) {
	for _, tc := range []struct {
		name string
		hex  string
	}{
		{"lowercase", strings.Repeat("ab", KeySize)},
		{"uppercase", strings.Repeat("AB", KeySize)},
		{"mixed case", strings.Repeat("aB", KeySize)},
		{"all zeros", strings.Repeat("00", KeySize)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			km, err := NewKeyManager(tc.hex)
			if err != nil {
				t.Fatalf("NewKeyManager(%q): %v", tc.hex, err)
			}
			if km == nil {
				t.Fatal("NewKeyManager returned nil manager and nil error")
			}
		})
	}
}

func TestGenerateDEK(t *testing.T) {
	km := newTestKeyManager(t)

	dek, encDEK, keySource, err := km.GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK: %v", err)
	}

	if len(dek) != KeySize {
		t.Errorf("plaintext DEK is %d bytes, want %d", len(dek), KeySize)
	}
	if keySource != "env:MASTER_KEY" {
		t.Errorf("keySource = %q, want %q", keySource, "env:MASTER_KEY")
	}
	if bytes.Equal(dek, encDEK) {
		t.Error("encrypted DEK equals the plaintext DEK")
	}
	if bytes.Contains(encDEK, dek) {
		t.Error("plaintext DEK appears verbatim inside the encrypted DEK")
	}

	// The DEK it hands out must be the DEK it stored.
	got, err := km.DecryptDEK(keySource, encDEK)
	if err != nil {
		t.Fatalf("DecryptDEK: %v", err)
	}
	if !bytes.Equal(got, dek) {
		t.Error("DecryptDEK did not return the DEK that GenerateDEK produced")
	}
}

// TestGenerateDEKIsUniquePerCall guards the per-patient key model: two patients
// sharing a DEK would mean one leaked key exposes both records.
func TestGenerateDEKIsUniquePerCall(t *testing.T) {
	km := newTestKeyManager(t)

	const iterations = 200
	seen := make(map[string]struct{}, iterations)

	for i := 0; i < iterations; i++ {
		dek, _, _, err := km.GenerateDEK()
		if err != nil {
			t.Fatalf("GenerateDEK #%d: %v", i, err)
		}
		if _, dup := seen[string(dek)]; dup {
			t.Fatalf("DEK repeated at iteration %d", i)
		}
		seen[string(dek)] = struct{}{}

		if bytes.Equal(dek, make([]byte, KeySize)) {
			t.Fatalf("GenerateDEK returned an all-zero key at iteration %d", i)
		}
	}
}

// TestDecryptDEKRejectsForeignMasterKey is the key-rotation safety net: a DEK
// sealed under one master key must not open under another. Silent success here
// would mean the ciphertext was never really bound to the key.
func TestDecryptDEKRejectsForeignMasterKey(t *testing.T) {
	kmA := newTestKeyManager(t)
	kmB := newTestKeyManager(t)

	_, encDEK, keySource, err := kmA.GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK: %v", err)
	}

	got, err := kmB.DecryptDEK(keySource, encDEK)
	if err == nil {
		t.Fatalf("DecryptDEK succeeded with a foreign master key, returned %d bytes", len(got))
	}
}

func TestDecryptDEKRejectsUnknownKeySource(t *testing.T) {
	km := newTestKeyManager(t)
	_, encDEK, _, err := km.GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK: %v", err)
	}

	// "aws-kms:" is the documented future source: it must fail loudly today,
	// not fall through to the master key.
	for _, source := range []string{"", "aws-kms:arn:aws:kms:us-east-1:1234:key/abc", "vault:secret", "ENV:MASTER_KEY", "env", " env:MASTER_KEY"} {
		t.Run(source, func(t *testing.T) {
			if _, err := km.DecryptDEK(source, encDEK); err == nil {
				t.Errorf("DecryptDEK accepted key source %q, want error", source)
			}
		})
	}
}

func TestDecryptDEKRejectsTamperedDEK(t *testing.T) {
	km := newTestKeyManager(t)
	_, encDEK, keySource, err := km.GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK: %v", err)
	}

	for i := range encDEK {
		corrupted := bytes.Clone(encDEK)
		corrupted[i] ^= 0x01

		if _, err := km.DecryptDEK(keySource, corrupted); err == nil {
			t.Fatalf("DecryptDEK accepted an encrypted DEK with bit %d flipped", i)
		}
	}
}

func TestSealOpenSecretRoundTrip(t *testing.T) {
	km := newTestKeyManager(t)

	cases := [][]byte{
		{},
		[]byte("EAAG...whatsapp-access-token"),
		[]byte("contraseña con acentós y símbolos ñ"),
		bytes.Repeat([]byte{0x00}, 64),
	}

	for _, plaintext := range cases {
		enc, keySource, err := km.SealSecret(plaintext)
		if err != nil {
			t.Fatalf("SealSecret: %v", err)
		}
		if keySource != "env:MASTER_KEY" {
			t.Errorf("keySource = %q, want %q", keySource, "env:MASTER_KEY")
		}
		if len(plaintext) > 0 && bytes.Contains(enc, plaintext) {
			t.Error("secret appears verbatim inside the ciphertext")
		}

		got, err := km.OpenSecret(keySource, enc)
		if err != nil {
			t.Fatalf("OpenSecret: %v", err)
		}
		if !bytes.Equal(got, plaintext) && !(len(got) == 0 && len(plaintext) == 0) {
			t.Errorf("round trip mismatch: got %q, want %q", got, plaintext)
		}
	}
}

func TestSealSecretIsNonDeterministic(t *testing.T) {
	km := newTestKeyManager(t)
	secret := []byte("same token twice")

	first, _, err := km.SealSecret(secret)
	if err != nil {
		t.Fatalf("SealSecret: %v", err)
	}
	second, _, err := km.SealSecret(secret)
	if err != nil {
		t.Fatalf("SealSecret: %v", err)
	}

	if bytes.Equal(first, second) {
		t.Error("SealSecret produced identical ciphertext for the same input")
	}
}

func TestOpenSecretRejectsUnknownKeySource(t *testing.T) {
	km := newTestKeyManager(t)
	enc, _, err := km.SealSecret([]byte("token"))
	if err != nil {
		t.Fatalf("SealSecret: %v", err)
	}

	for _, source := range []string{"", "aws-kms:arn:...", "ENV:MASTER_KEY"} {
		if _, err := km.OpenSecret(source, enc); err == nil {
			t.Errorf("OpenSecret accepted key source %q, want error", source)
		}
	}
}

func TestOpenSecretRejectsForeignMasterKey(t *testing.T) {
	kmA := newTestKeyManager(t)
	kmB := newTestKeyManager(t)

	enc, keySource, err := kmA.SealSecret([]byte("tenant secret"))
	if err != nil {
		t.Fatalf("SealSecret: %v", err)
	}

	if _, err := kmB.OpenSecret(keySource, enc); err == nil {
		t.Error("OpenSecret succeeded with a foreign master key")
	}
}

// TestSecretsAreNotInterchangeableWithDEKs documents that both helpers seal
// under the same master key today. If that ever stops being true, this test
// fails and forces the change to be deliberate rather than incidental.
func TestSecretsAreNotInterchangeableWithDEKs(t *testing.T) {
	km := newTestKeyManager(t)

	_, encDEK, keySource, err := km.GenerateDEK()
	if err != nil {
		t.Fatalf("GenerateDEK: %v", err)
	}

	opened, err := km.OpenSecret(keySource, encDEK)
	if err != nil {
		t.Fatalf("OpenSecret on an encrypted DEK: %v", err)
	}
	if len(opened) != KeySize {
		t.Errorf("opened DEK is %d bytes, want %d", len(opened), KeySize)
	}
}

func TestZeroize(t *testing.T) {
	t.Run("clears every byte", func(t *testing.T) {
		b := []byte("sensitive key material")
		Zeroize(b)
		for i, v := range b {
			if v != 0 {
				t.Fatalf("byte %d = %#x after Zeroize, want 0", i, v)
			}
		}
	})

	t.Run("preserves length", func(t *testing.T) {
		b := make([]byte, 32)
		Zeroize(b)
		if len(b) != 32 {
			t.Errorf("length = %d after Zeroize, want 32", len(b))
		}
	})

	t.Run("handles empty and nil", func(t *testing.T) {
		Zeroize(nil)
		Zeroize([]byte{})
	})

	t.Run("clears a real DEK", func(t *testing.T) {
		km := newTestKeyManager(t)
		dek, _, _, err := km.GenerateDEK()
		if err != nil {
			t.Fatalf("GenerateDEK: %v", err)
		}
		Zeroize(dek)
		if !bytes.Equal(dek, make([]byte, KeySize)) {
			t.Error("DEK still holds key material after Zeroize")
		}
	})
}
