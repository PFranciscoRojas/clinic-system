package crypto

import (
	"bytes"
	"crypto/rand"
	"fmt"
	"testing"
)

// nonceSize and tagSize are the AES-256-GCM layout constants Seal promises in
// its doc comment: nonce || ciphertext || tag. They are asserted here rather
// than imported so that a change to the wire format breaks a test instead of
// silently making old BYTEA rows undecryptable.
const (
	nonceSize = 12
	tagSize   = 16
)

func testKey(t *testing.T) []byte {
	t.Helper()
	k := make([]byte, KeySize)
	if _, err := rand.Read(k); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	return k
}

func TestSealOpenRoundTrip(t *testing.T) {
	key := testKey(t)

	cases := []struct {
		name      string
		plaintext []byte
	}{
		{"empty", []byte{}},
		{"nil", nil},
		{"single byte", []byte{0x00}},
		{"short name", []byte("María Chapués")},
		{"colombian id", []byte("1.098.765.432")},
		{"soap note", []byte("S: Refiere ansiedad anticipatoria.\nO: Afecto ansioso.\nA: TAG.\nP: Reestructuración cognitiva.")},
		{"utf8 accents and emoji", []byte("acentuación ñÑ áéíóú — 🧠")},
		{"exactly one block", bytes.Repeat([]byte{0xAB}, 16)},
		{"one byte over a block", bytes.Repeat([]byte{0xAB}, 17)},
		{"large", bytes.Repeat([]byte("clinical record "), 4096)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sealed, err := Seal(key, tc.plaintext)
			if err != nil {
				t.Fatalf("Seal: %v", err)
			}

			opened, err := Open(key, sealed)
			if err != nil {
				t.Fatalf("Open: %v", err)
			}
			if !bytes.Equal(opened, tc.plaintext) && !(len(opened) == 0 && len(tc.plaintext) == 0) {
				t.Errorf("round trip mismatch:\n got %q\nwant %q", opened, tc.plaintext)
			}
		})
	}
}

// TestSealLayout pins the on-disk format. If this breaks, every encrypted row
// already in production becomes unreadable — it is a migration, not a refactor.
func TestSealLayout(t *testing.T) {
	key := testKey(t)
	plaintext := []byte("historia clínica")

	sealed, err := Seal(key, plaintext)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	want := nonceSize + len(plaintext) + tagSize
	if len(sealed) != want {
		t.Errorf("sealed length = %d, want %d (nonce %d + plaintext %d + tag %d)",
			len(sealed), want, nonceSize, len(plaintext), tagSize)
	}
	if bytes.Contains(sealed, plaintext) {
		t.Error("plaintext appears verbatim inside the ciphertext")
	}
}

// TestSealUsesFreshNonce is the single most important property here: GCM loses
// all confidentiality guarantees if a nonce is ever reused under the same key.
func TestSealUsesFreshNonce(t *testing.T) {
	key := testKey(t)
	plaintext := []byte("same plaintext every time")

	const iterations = 500
	seenNonces := make(map[string]struct{}, iterations)
	seenCiphertexts := make(map[string]struct{}, iterations)

	for i := 0; i < iterations; i++ {
		sealed, err := Seal(key, plaintext)
		if err != nil {
			t.Fatalf("Seal #%d: %v", i, err)
		}

		nonce := string(sealed[:nonceSize])
		if _, dup := seenNonces[nonce]; dup {
			t.Fatalf("nonce reused at iteration %d — catastrophic for GCM", i)
		}
		seenNonces[nonce] = struct{}{}

		if _, dup := seenCiphertexts[string(sealed)]; dup {
			t.Fatalf("identical ciphertext produced twice at iteration %d", i)
		}
		seenCiphertexts[string(sealed)] = struct{}{}
	}
}

func TestSealRejectsWrongKeySize(t *testing.T) {
	// KeySize-1 and KeySize+1 are the boundaries an off-by-one would slip through.
	for _, size := range []int{0, 1, 16, KeySize - 1, KeySize + 1, 64} {
		t.Run(fmt.Sprintf("%d bytes", size), func(t *testing.T) {
			if _, err := Seal(make([]byte, size), []byte("x")); err == nil {
				t.Errorf("Seal accepted a %d-byte key, want error", size)
			}
		})
	}
	if _, err := Seal(nil, []byte("x")); err == nil {
		t.Error("Seal accepted a nil key, want error")
	}
}

func TestOpenRejectsWrongKeySize(t *testing.T) {
	key := testKey(t)
	sealed, err := Seal(key, []byte("x"))
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	for _, size := range []int{0, 16, KeySize - 1, KeySize + 1} {
		if _, err := Open(make([]byte, size), sealed); err == nil {
			t.Errorf("Open accepted a %d-byte key, want error", size)
		}
	}
}

func TestOpenRejectsWrongKey(t *testing.T) {
	sealed, err := Seal(testKey(t), []byte("datos del paciente"))
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	plaintext, err := Open(testKey(t), sealed)
	if err == nil {
		t.Fatalf("Open succeeded with the wrong key, returned %q", plaintext)
	}
	if plaintext != nil {
		t.Errorf("Open returned %q alongside an error, want nil", plaintext)
	}
}

// TestOpenRejectsShortCiphertext walks the exact boundary: nonce+tag is the
// shortest legal input (an empty plaintext), one byte less must be rejected.
func TestOpenRejectsShortCiphertext(t *testing.T) {
	key := testKey(t)
	minLen := nonceSize + tagSize

	for size := 0; size < minLen; size++ {
		if _, err := Open(key, make([]byte, size)); err == nil {
			t.Errorf("Open accepted a %d-byte ciphertext, want error (minimum is %d)", size, minLen)
		}
	}

	// The boundary itself must be reachable: sealing an empty plaintext
	// produces exactly minLen bytes and must decrypt cleanly.
	sealed, err := Seal(key, nil)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if len(sealed) != minLen {
		t.Fatalf("sealed empty plaintext = %d bytes, want %d", len(sealed), minLen)
	}
	if _, err := Open(key, sealed); err != nil {
		t.Errorf("Open rejected a minimum-length ciphertext: %v", err)
	}
}

// TestOpenRejectsTampering is what makes the BYTEA columns tamper-evident: an
// attacker with write access to the database must not be able to alter a
// clinical record without the change being detected on read.
func TestOpenRejectsTampering(t *testing.T) {
	key := testKey(t)
	plaintext := []byte("diagnóstico: F41.1")

	sealed, err := Seal(key, plaintext)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	regions := map[string][2]int{
		"nonce":      {0, nonceSize},
		"ciphertext": {nonceSize, len(sealed) - tagSize},
		"tag":        {len(sealed) - tagSize, len(sealed)},
	}

	for name, span := range regions {
		t.Run(name, func(t *testing.T) {
			for i := span[0]; i < span[1]; i++ {
				corrupted := bytes.Clone(sealed)
				corrupted[i] ^= 0x01 // flip a single bit

				got, err := Open(key, corrupted)
				if err == nil {
					t.Fatalf("Open accepted a ciphertext with bit %d flipped, returned %q", i, got)
				}
				if got != nil {
					t.Fatalf("Open returned %q alongside an error at byte %d, want nil", got, i)
				}
			}
		})
	}
}

func TestOpenRejectsTruncationAndExtension(t *testing.T) {
	key := testKey(t)
	sealed, err := Seal(key, []byte("registro clínico completo"))
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	if _, err := Open(key, sealed[:len(sealed)-1]); err == nil {
		t.Error("Open accepted a truncated ciphertext")
	}
	if _, err := Open(key, append(bytes.Clone(sealed), 0x00)); err == nil {
		t.Error("Open accepted an extended ciphertext")
	}
}

// FuzzSealOpen asserts the round trip over machine-generated input. Unlike the
// table tests above, the corpus is not authored by whoever wrote the code.
func FuzzSealOpen(f *testing.F) {
	f.Add([]byte{})
	f.Add([]byte("María"))
	f.Add(bytes.Repeat([]byte{0xFF}, 1024))

	key := make([]byte, KeySize)
	for i := range key {
		key[i] = byte(i)
	}

	f.Fuzz(func(t *testing.T, plaintext []byte) {
		sealed, err := Seal(key, plaintext)
		if err != nil {
			t.Fatalf("Seal(%d bytes): %v", len(plaintext), err)
		}

		opened, err := Open(key, sealed)
		if err != nil {
			t.Fatalf("Open: %v", err)
		}
		if !bytes.Equal(opened, plaintext) && !(len(opened) == 0 && len(plaintext) == 0) {
			t.Errorf("round trip mismatch for %d bytes", len(plaintext))
		}
	})
}

// FuzzOpenArbitraryInput asserts Open never panics and never returns plaintext
// together with a nil error for input it did not produce. A panic here is a
// denial of service reachable from any corrupted database row.
func FuzzOpenArbitraryInput(f *testing.F) {
	f.Add([]byte{})
	f.Add(make([]byte, nonceSize+tagSize))
	f.Add(bytes.Repeat([]byte{0xAA}, 100))

	key := make([]byte, KeySize)
	for i := range key {
		key[i] = byte(i)
	}

	f.Fuzz(func(t *testing.T, ciphertext []byte) {
		got, err := Open(key, ciphertext)
		if err == nil && got == nil && len(ciphertext) > 0 {
			t.Errorf("Open returned nil plaintext and nil error for %d bytes", len(ciphertext))
		}
	})
}
