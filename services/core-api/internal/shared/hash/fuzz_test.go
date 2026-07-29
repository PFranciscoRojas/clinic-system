package hash

import (
	"strings"
	"testing"
)

// Fuzzing is the part of the gauntlet that cannot be gamed: the inputs come
// from the machine, so a test cannot be written to pass by construction.
//
// The property that matters here is the one CLAUDE.md rule 4 depends on.
// Patient names are encrypted, so search is only possible through these
// hashes — there is no LIKE to fall back on. If a name and the prefix a
// receptionist types disagree about folding for even one input, that patient
// becomes unfindable, and nothing anywhere reports an error. It just looks
// like the patient was never registered.

// fuzzPepper mirrors initTestPepper for the seedless fuzz entry point.
func fuzzPepper(f *testing.F) {
	f.Helper()
	if err := Init(strings.Repeat("ab", 32)); err != nil {
		f.Fatalf("Init: %v", err)
	}
}

// FuzzSearchRoundTrip is the core property: every prefix of every word in a
// name, from 2 runes up, must be findable by typing it. Written as an
// implication over machine-generated names rather than a list of examples,
// because the failures live in the inputs nobody thinks to write down —
// combining marks, invisible characters, exotic whitespace.
func FuzzSearchRoundTrip(f *testing.F) {
	fuzzPepper(f)

	for _, seed := range []string{
		"María Chapués", "MUÑOZ", "  josé  ramírez  ", "O'Connor",
		"Ana", "de la Cruz", "Ñandú", "Ana-María", "李", "Ünal",
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, name string) {
		tokens := SearchTokenHashes(name)
		index := make(map[string]struct{}, len(tokens))
		for _, h := range tokens {
			index[h] = struct{}{}
		}

		// Walk the same folding the write side does, then assert that typing
		// any prefix of any word finds it.
		for _, word := range strings.Fields(foldToken(name)) {
			r := []rune(word)
			if len(r) > searchTokenMaxPrefix {
				r = r[:searchTokenMaxPrefix]
			}
			for i := searchTokenMinPrefix; i <= len(r); i++ {
				prefix := string(r[:i])
				query := SearchQueryHashes(prefix)
				if len(query) != 1 {
					t.Fatalf("SearchQueryHashes(%q) returned %d hashes, want exactly 1 "+
						"(name %q)", prefix, len(query), name)
				}
				if _, ok := index[query[0]]; !ok {
					t.Fatalf("typing %q does not find %q — the write and read sides "+
						"disagree about folding", prefix, name)
				}
			}
		}
	})
}

// FuzzSearchTokensAreStable: the same input must always produce the same set.
// A non-deterministic write side would leave old rows unmatchable after any
// re-index, and the failure would only surface months later.
func FuzzSearchTokensAreStable(f *testing.F) {
	fuzzPepper(f)

	for _, seed := range []string{"María Chapués", "", "   ", "a", "ab", "Muñoz Pérez"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, name string) {
		first := SearchTokenHashes(name)
		second := SearchTokenHashes(name)

		if len(first) != len(second) {
			t.Fatalf("SearchTokenHashes(%q) returned %d then %d hashes", name, len(first), len(second))
		}
		for i := range first {
			if first[i] != second[i] {
				t.Fatalf("SearchTokenHashes(%q) is not deterministic at index %d", name, i)
			}
		}

		// And the set is deduplicated: a repeated hash would bloat the index
		// table for every patient with a repeated word.
		seen := make(map[string]struct{}, len(first))
		for _, h := range first {
			if _, dup := seen[h]; dup {
				t.Fatalf("SearchTokenHashes(%q) emitted a duplicate hash", name)
			}
			seen[h] = struct{}{}
		}
	})
}

// FuzzFoldTokenIsIdempotent asserts stability at the level that actually
// matters: the token list, not the raw folded string.
//
// The stronger claim — foldToken(foldToken(x)) == foldToken(x) — is false, and
// fuzzing found why. foldToken trims *before* running the deaccent transform,
// so a combining mark that the transform removes can expose whitespace that was
// never trimmed: "A\xc5 ֹ" folds to "a� " (trailing space), and folding
// that again yields "a�". The corpus keeps that input.
//
// Nothing depends on the stronger claim. Both callers — SearchTokenHashes and
// SearchQueryHashes — wrap foldToken in strings.Fields, which discards the
// difference. So the contract is: tokenising a folded value gives the same
// words as tokenising the original. That is what the write and read sides need
// to agree on, and it is what is asserted here.
//
// (If a future caller uses foldToken without strings.Fields, it will need the
// trim moved after the transform. Hence this note rather than a silent
// weakening of the test.)
func FuzzFoldTokenIsIdempotent(f *testing.F) {
	for _, seed := range []string{"María", "MUÑOZ", "  josé  ", "ﬁ", "Ⅻ", "ß", "İ", "́"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, s string) {
		once := foldToken(s)
		twice := foldToken(once)

		wordsOnce := strings.Fields(once)
		wordsTwice := strings.Fields(twice)
		if len(wordsOnce) != len(wordsTwice) {
			t.Fatalf("folding twice changed the token count: %q -> %v vs %v", s, wordsOnce, wordsTwice)
		}
		for i := range wordsOnce {
			if wordsOnce[i] != wordsTwice[i] {
				t.Fatalf("folding twice changed token %d: %q vs %q (input %q)",
					i, wordsOnce[i], wordsTwice[i], s)
			}
		}

		// Stated as "equals its own ToLower", not as "contains no rune where
		// unicode.IsUpper". Those are different claims, and the second one is
		// false: fuzzing found U+2145 (ⅅ, DOUBLE-STRUCK ITALIC CAPITAL D),
		// which reports IsUpper but has no lowercase mapping in Go, so no
		// amount of folding will ever satisfy it. The corpus keeps that input.
		if lower := strings.ToLower(once); once != lower {
			t.Errorf("foldToken(%q) = %q, which is not fully lower-cased (%q)", s, once, lower)
		}
	})
}

// FuzzNormalizeIsDeterministic covers the keyed digest itself: same input,
// same 64-char hex, always. It is the primary key of every encrypted lookup,
// so instability here silently orphans rows.
func FuzzNormalizeIsDeterministic(f *testing.F) {
	fuzzPepper(f)

	for _, seed := range []string{"", "a", "MARÍA", "  spaced  ", "1020304050", "\x00\xff"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, s string) {
		first := Normalize(s)
		if first != Normalize(s) {
			t.Fatalf("Normalize(%q) is not deterministic", s)
		}
		if len(first) != 64 {
			t.Fatalf("Normalize(%q) returned %d chars, want 64 hex", s, len(first))
		}
		for _, r := range first {
			if !strings.ContainsRune("0123456789abcdef", r) {
				t.Fatalf("Normalize(%q) = %q is not lowercase hex", s, first)
			}
		}

		// Case and surrounding whitespace must not change the digest — that is
		// the whole contract of a "normalized" lookup key.
		//
		// Phrased against ToLower rather than ToUpper. The ToUpper version is
		// not a property of this code but of Unicode, and it is false: fuzzing
		// found "ſ" (U+017F, long s), whose ToUpper is "S", whose ToLower is
		// "s" — so upper-casing is not reversible and the digests legitimately
		// differ. The corpus keeps that input.
		if got := Normalize(strings.ToLower(s)); got != first {
			t.Errorf("Normalize is case sensitive: %q vs its own ToLower %q", s, strings.ToLower(s))
		}
		if got := Normalize("  " + s + "  "); got != first {
			t.Errorf("Normalize is whitespace sensitive for %q", s)
		}
	})
}

// FuzzTokenIsExact is the opposite contract, and easy to break by copying the
// wrong helper: Token hashes a high-entropy secret exactly as presented. Any
// folding here would make two different reset links collide.
func FuzzTokenIsExact(f *testing.F) {
	for _, seed := range []string{"abc", "ABC", " abc ", "", "\x00"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, s string) {
		h := Token(s)
		if h != Token(s) {
			t.Fatalf("Token(%q) is not deterministic", s)
		}
		if len(h) != 64 {
			t.Fatalf("Token(%q) returned %d chars, want 64", s, len(h))
		}

		// Distinct-but-equivalent-after-folding inputs must NOT collide.
		if upper := strings.ToUpper(s); upper != s && Token(upper) == h {
			t.Errorf("Token folded case: %q and %q hash the same", s, upper)
		}
		if padded := " " + s + " "; Token(padded) == h {
			t.Errorf("Token trimmed whitespace: %q and %q hash the same", s, padded)
		}
	})
}

// FuzzSearchQueryHashesNeverPanics: the query string comes straight from a
// search box, so it is the one input in this package an attacker fully
// controls. It must survive anything without panicking and without emitting a
// hash for a word too short to have a counterpart in the index.
func FuzzSearchQueryHashesNeverPanics(f *testing.F) {
	fuzzPepper(f)

	for _, seed := range []string{"", " ", "a", "ab", "a b c", strings.Repeat("x", 500), "\x00\x01", "🙂🙂"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, q string) {
		hashes := SearchQueryHashes(q)

		var expected int
		for _, word := range strings.Fields(foldToken(q)) {
			if len([]rune(word)) >= searchTokenMinPrefix {
				expected++
			}
		}
		if len(hashes) != expected {
			t.Fatalf("SearchQueryHashes(%q) returned %d hashes, want %d — one per word "+
				"of at least %d runes", q, len(hashes), expected, searchTokenMinPrefix)
		}
		for _, h := range hashes {
			if len(h) != 64 {
				t.Fatalf("SearchQueryHashes(%q) produced a %d-char hash", q, len(h))
			}
		}
	})
}
