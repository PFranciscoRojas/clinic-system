package hash

import (
	"strings"
	"testing"
)

func initTestPepper(t *testing.T) {
	t.Helper()
	if err := Init(strings.Repeat("ab", 32)); err != nil {
		t.Fatalf("Init: %v", err)
	}
}

func contains(hashes []string, h string) bool {
	for _, x := range hashes {
		if x == h {
			return true
		}
	}
	return false
}

func TestSearchTokensAccentInsensitive(t *testing.T) {
	initTestPepper(t)

	index := SearchTokenHashes("María José", "Muñoz", "Gómez")

	// Accented, unaccented and differently-cased queries must all hit.
	for _, q := range []string{"maria", "María", "MUNOZ", "muñoz", "gómez", "gomez"} {
		qh := SearchQueryHashes(q)
		if len(qh) != 1 || !contains(index, qh[0]) {
			t.Errorf("query %q should match the index", q)
		}
	}
}

func TestSearchTokensPrefixTyping(t *testing.T) {
	initTestPepper(t)

	index := SearchTokenHashes("María", "Muñoz")

	// Typing progressively (2+ chars) must match at every step.
	for _, q := range []string{"ma", "mar", "mari", "mu", "muñ", "muno"} {
		qh := SearchQueryHashes(q)
		if len(qh) != 1 || !contains(index, qh[0]) {
			t.Errorf("prefix %q should match the index", q)
		}
	}
	// A non-prefix must not match.
	if qh := SearchQueryHashes("perez"); contains(index, qh[0]) {
		t.Error("unrelated word must not match")
	}
}

func TestSearchQueryHashesMultiWordAndShort(t *testing.T) {
	initTestPepper(t)

	if got := SearchQueryHashes("mari gome"); len(got) != 2 {
		t.Errorf("two words → two hashes, got %d", len(got))
	}
	// Single characters have no index counterpart and are dropped.
	if got := SearchQueryHashes("m"); len(got) != 0 {
		t.Errorf("1-char query must produce no hashes, got %d", len(got))
	}
	if got := SearchQueryHashes("   "); len(got) != 0 {
		t.Errorf("blank query must produce no hashes, got %d", len(got))
	}
}

func TestSearchTokenHashesDedup(t *testing.T) {
	initTestPepper(t)

	// "Ana Ana" repeats every prefix — the index must not.
	tokens := SearchTokenHashes("Ana Ana")
	seen := map[string]bool{}
	for _, h := range tokens {
		if seen[h] {
			t.Fatalf("duplicate token hash in index")
		}
		seen[h] = true
	}
}

// TestSearchTokensCapLongWords pins the searchTokenMaxPrefix cap. Mutation
// testing found it untested in both directions: no example used a word longer
// than 24 runes, so flipping the comparison or moving its boundary changed
// nothing that any test could see.
//
// The cap is what stops one absurd input from writing hundreds of index rows
// per patient, and it has to apply identically on both sides — if the write
// side truncated at 24 and the read side did not, typing the full word would
// find nobody.
func TestSearchTokensCapLongWords(t *testing.T) {
	initTestPepper(t)

	// 30 runes: past the cap by six.
	long := strings.Repeat("a", 30)
	tokens := SearchTokenHashes(long)

	// Prefixes from 2 to 24 runes inclusive: 23 of them.
	if len(tokens) != searchTokenMaxPrefix-searchTokenMinPrefix+1 {
		t.Errorf("got %d tokens for a %d-rune word, want %d — the cap is not applied",
			len(tokens), len([]rune(long)), searchTokenMaxPrefix-searchTokenMinPrefix+1)
	}

	// Exactly at the cap must be indexed; one past it must not add anything.
	atCap := SearchQueryHashes(strings.Repeat("a", searchTokenMaxPrefix))
	if len(atCap) != 1 || !contains(tokens, atCap[0]) {
		t.Errorf("a %d-rune query does not match the indexed word", searchTokenMaxPrefix)
	}

	// Typing more than the cap still finds it: the read side truncates too, so
	// both sides land on the same hash.
	over := SearchQueryHashes(strings.Repeat("a", searchTokenMaxPrefix+6))
	if len(over) != 1 {
		t.Fatalf("a query past the cap produced %d hashes, want 1", len(over))
	}
	if over[0] != atCap[0] {
		t.Error("a query past the cap hashes differently from one at the cap — " +
			"the write and read sides truncate inconsistently")
	}
	if !contains(tokens, over[0]) {
		t.Error("typing the full 30-rune word does not find the patient")
	}
}

// TestSearchTokensJustUnderTheCap is the other side of the boundary: a word of
// exactly the cap length must produce prefixes up to its full length, with no
// truncation applied.
func TestSearchTokensJustUnderTheCap(t *testing.T) {
	initTestPepper(t)

	exact := strings.Repeat("b", searchTokenMaxPrefix)
	if got := len(SearchTokenHashes(exact)); got != searchTokenMaxPrefix-searchTokenMinPrefix+1 {
		t.Errorf("a word of exactly %d runes produced %d tokens, want %d",
			searchTokenMaxPrefix, got, searchTokenMaxPrefix-searchTokenMinPrefix+1)
	}

	shorter := strings.Repeat("c", searchTokenMaxPrefix-1)
	if got := len(SearchTokenHashes(shorter)); got != searchTokenMaxPrefix-searchTokenMinPrefix {
		t.Errorf("a word of %d runes produced %d tokens, want %d",
			searchTokenMaxPrefix-1, got, searchTokenMaxPrefix-searchTokenMinPrefix)
	}
}

// Two mutants survive in this package and always will, both CONDITIONALS_BOUNDARY
// on the cap check (`len(r) > searchTokenMaxPrefix`, hash.go:94 and hash.go:121).
// Flipping `>` to `>=` makes a word of exactly 24 runes take the truncating
// branch, which truncates 24 runes to 24 runes and produces the identical slice.
// The two programs are indistinguishable by any input, so no test can kill them.
// That is an equivalent mutant, not a gap: TestSearchTokensJustUnderTheCap above
// already pins the behaviour at the boundary. Do not chase them.
