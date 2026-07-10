package hash

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// pepper keys every Normalize digest. Set once at startup via Init; kept
// package-level so the dozens of call sites keep their one-argument signature.
var pepper []byte

// Init loads the 64-char hex SEARCH_PEPPER used to key Normalize. Must be
// called once at process startup, before any request is served. Fails on a
// missing or malformed value — the alternative is silently writing unkeyed
// hashes that can never be matched again.
func Init(pepperHex string) error {
	if pepperHex == "" {
		return errors.New("hash: SEARCH_PEPPER is required")
	}
	key, err := hex.DecodeString(pepperHex)
	if err != nil {
		return fmt.Errorf("hash: SEARCH_PEPPER must be a 64-char hex string: %w", err)
	}
	if len(key) != 32 {
		return fmt.Errorf("hash: SEARCH_PEPPER must decode to 32 bytes, got %d", len(key))
	}
	pepper = key
	return nil
}

// Normalize lowercases, trims, and HMAC-SHA256s s under the SEARCH_PEPPER key.
// Used as the deterministic indexed lookup key for PII fields (email, paternal
// last name, document number) — same input always produces the same key
// regardless of the caller's layer. Keyed (not plain SHA-256) because the
// inputs are low-entropy: an unkeyed digest of a 6-10 digit document number is
// reversible by brute force from a leaked table snapshot.
//
// Panics if Init was not called — fail-closed by design: crashing beats
// persisting hashes under the wrong (empty) key.
func Normalize(s string) string {
	if pepper == nil {
		panic("hash: Normalize called before Init — SEARCH_PEPPER not loaded")
	}
	mac := hmac.New(sha256.New, pepper)
	mac.Write([]byte(strings.ToLower(strings.TrimSpace(s))))
	return hex.EncodeToString(mac.Sum(nil))
}

// deaccentTransformer strips combining marks after NFD decomposition, so
// "Muñoz" and "Munoz", "María" and "Maria" normalize to the same bytes.
var deaccentTransformer = transform.Chain(
	norm.NFD,
	runes.Remove(runes.In(unicode.Mn)),
	norm.NFC,
)

// foldToken lowercases, trims and strips diacritics — the canonical form
// every search token (write and read side) passes through before hashing.
func foldToken(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if out, _, err := transform.String(deaccentTransformer, s); err == nil {
		s = out
	}
	return s
}

// searchTokenMinPrefix/MaxPrefix bound the per-word prefix expansion: two
// characters is enough for type-ahead ("ma" → María) without exploding row
// counts, and no real name word needs more than 24.
const (
	searchTokenMinPrefix = 2
	searchTokenMaxPrefix = 24
)

// SearchTokenHashes is the WRITE side of encrypted patient search: for every
// word in the given fields it emits the peppered hash of each prefix from
// searchTokenMinPrefix runes up to the full word. Deduplicated; empty fields
// are skipped. Panics if Init was not called (same contract as Normalize).
func SearchTokenHashes(fields ...string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, f := range fields {
		for _, word := range strings.Fields(foldToken(f)) {
			r := []rune(word)
			if len(r) > searchTokenMaxPrefix {
				r = r[:searchTokenMaxPrefix]
			}
			for i := searchTokenMinPrefix; i <= len(r); i++ {
				h := Normalize(string(r[:i]))
				if _, dup := seen[h]; !dup {
					seen[h] = struct{}{}
					out = append(out, h)
				}
			}
		}
	}
	return out
}

// SearchQueryHashes is the READ side: one peppered hash per word of the typed
// query, folded exactly like the write side. A patient matches when its token
// set contains every one of these hashes (each typed word is a prefix of some
// name word). Words shorter than searchTokenMinPrefix are dropped — they have
// no counterpart in the index.
func SearchQueryHashes(q string) []string {
	var out []string
	for _, word := range strings.Fields(foldToken(q)) {
		r := []rune(word)
		if len(r) < searchTokenMinPrefix {
			continue
		}
		if len(r) > searchTokenMaxPrefix {
			r = r[:searchTokenMaxPrefix]
		}
		out = append(out, Normalize(string(r)))
	}
	return out
}

// Token SHA-256 hashes a high-entropy secret (password-reset link token,
// invite code) exactly as presented — no lowercasing or trimming, which
// would alter the value. Only the digest is ever stored in Redis, so a
// leaked snapshot cannot be replayed to take over an account. No pepper:
// the input already has 256 bits of entropy, brute force is not a threat.
func Token(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h)
}
