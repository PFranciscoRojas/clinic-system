package crypto

import (
	"crypto/rand"
	"errors"
	"io"
	"testing"
)

// errReader stands in for a crypto/rand that has failed. Real-world causes are
// rare but real: a hardened container without /dev/urandom, a seccomp filter
// blocking getrandom(2), or an exhausted file descriptor table.
type errReader struct{ err error }

func (r errReader) Read([]byte) (int, error) { return 0, r.err }

// shortReader returns fewer bytes than asked for and then EOF, which is the
// subtler failure: a naive rand.Read call would accept a partially filled
// nonce without noticing.
type shortReader struct{ n int }

func (r *shortReader) Read(p []byte) (int, error) {
	if r.n <= 0 {
		return 0, io.EOF
	}
	n := r.n
	if n > len(p) {
		n = len(p)
	}
	r.n = 0
	for i := 0; i < n; i++ {
		p[i] = 0xAA
	}
	return n, nil
}

// withRandReader swaps the package entropy source for the duration of a test.
// These tests must not run in parallel: randReader is package-level state.
func withRandReader(t *testing.T, r io.Reader) {
	t.Helper()
	original := randReader
	randReader = r
	t.Cleanup(func() { randReader = original })
}

func TestSealFailsClosedWhenEntropyFails(t *testing.T) {
	sentinel := errors.New("entropy source unavailable")
	withRandReader(t, errReader{err: sentinel})

	sealed, err := Seal(make([]byte, KeySize), []byte("historia clínica"))
	if err == nil {
		t.Fatal("Seal succeeded with a failing entropy source — it would have used a predictable nonce")
	}
	if !errors.Is(err, sentinel) {
		t.Errorf("error = %v, want it to wrap %v", err, sentinel)
	}
	if sealed != nil {
		t.Errorf("Seal returned %d bytes alongside an error, want nil", len(sealed))
	}
}

// TestSealFailsClosedOnShortRead is the case a bare rand.Read would miss:
// io.ReadFull must reject a partially filled nonce.
func TestSealFailsClosedOnShortRead(t *testing.T) {
	withRandReader(t, &shortReader{n: 4}) // 4 of the 12 nonce bytes

	if _, err := Seal(make([]byte, KeySize), []byte("x")); err == nil {
		t.Fatal("Seal succeeded with a short entropy read — the nonce was only partially random")
	}
}

func TestGenerateDEKFailsClosedWhenEntropyFails(t *testing.T) {
	km, err := NewKeyManager("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatalf("NewKeyManager: %v", err)
	}

	sentinel := errors.New("entropy source unavailable")
	withRandReader(t, errReader{err: sentinel})

	dek, encDEK, keySource, err := km.GenerateDEK()
	if err == nil {
		t.Fatal("GenerateDEK succeeded with a failing entropy source — the DEK would be predictable")
	}
	if !errors.Is(err, sentinel) {
		t.Errorf("error = %v, want it to wrap %v", err, sentinel)
	}
	if dek != nil || encDEK != nil || keySource != "" {
		t.Errorf("GenerateDEK returned dek=%v encDEK=%v keySource=%q alongside an error, want all zero", dek, encDEK, keySource)
	}
}

func TestGenerateDEKFailsClosedOnShortRead(t *testing.T) {
	km, err := NewKeyManager("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatalf("NewKeyManager: %v", err)
	}

	withRandReader(t, &shortReader{n: 8}) // 8 of the 32 DEK bytes

	if _, _, _, err := km.GenerateDEK(); err == nil {
		t.Fatal("GenerateDEK succeeded with a short entropy read — the DEK was only partially random")
	}
}

// TestGenerateDEKFailsClosedWhenSealFails covers the narrow window where
// entropy lasts long enough to produce the DEK but runs out while sealing it.
// The DEK must not escape unencrypted.
func TestGenerateDEKFailsClosedWhenSealFails(t *testing.T) {
	km, err := NewKeyManager("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatalf("NewKeyManager: %v", err)
	}

	// Exactly enough for the 32-byte DEK, nothing left for Seal's 12-byte nonce.
	withRandReader(t, &shortReader{n: KeySize})

	dek, encDEK, keySource, err := km.GenerateDEK()
	if err == nil {
		t.Fatal("GenerateDEK succeeded although sealing the DEK must have failed")
	}
	if dek != nil || encDEK != nil || keySource != "" {
		t.Errorf("GenerateDEK leaked dek=%v encDEK=%v keySource=%q alongside an error", dek, encDEK, keySource)
	}
}

func TestSealSecretFailsClosedWhenEntropyFails(t *testing.T) {
	km, err := NewKeyManager("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatalf("NewKeyManager: %v", err)
	}

	withRandReader(t, errReader{err: errors.New("entropy source unavailable")})

	enc, keySource, err := km.SealSecret([]byte("tenant access token"))
	if err == nil {
		t.Fatal("SealSecret succeeded with a failing entropy source")
	}
	if enc != nil || keySource != "" {
		t.Errorf("SealSecret returned enc=%v keySource=%q alongside an error, want both zero", enc, keySource)
	}
}

// TestRandReaderDefaultsToCryptoRand guards the seam itself: if someone points
// randReader at math/rand or forgets to restore it, this fails.
func TestRandReaderDefaultsToCryptoRand(t *testing.T) {
	if randReader != rand.Reader {
		t.Error("randReader is not crypto/rand.Reader — production entropy source was replaced")
	}
}
