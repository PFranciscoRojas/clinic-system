#!/usr/bin/env bash
#
# Tests for run_fuzz.sh's failure classifier.
#
# The classifier decides whether a red fuzz run means "the fuzzer found an
# input" or "the fuzzing engine ran out of time and reported that as a
# failure". Getting it wrong in one direction blocks every PR on a coin flip;
# getting it wrong in the other direction throws away a real finding. The
# second is much worse, so the cases below are weighted toward proving that a
# crasher is never mistaken for a flake.
#
set -euo pipefail

# shellcheck source=./run_fuzz.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run_fuzz.sh"

failures=0

check() {
    local name="$1" want="$2" got="$3"
    if [[ "$got" == "$want" ]]; then
        printf '  ok    %s\n' "$name"
    else
        printf '  FAIL  %s — want %s, got %s\n' "$name" "$want" "$got"
        failures=1
    fi
}

# What Go prints when -fuzztime elapses while a worker is mid-RPC. No input was
# found; nothing was written to testdata. Observed on CI 2026-08-11 on a PR
# that changed one Markdown file.
DEADLINE_OUT='fuzz: elapsed: 15s, execs: 335335 (22231/sec), new interesting: 77 (total: 82)
--- FAIL: FuzzNormalizeAmountIsIdempotent (15.09s)
    context deadline exceeded
FAIL
exit status 1
FAIL	sghcp/core-api/internal/invoicing	15.091s'

# What Go prints when it actually finds something.
FINDING_OUT='--- FAIL: FuzzNormalizeAmountIsIdempotent (0.03s)
    --- FAIL: FuzzNormalizeAmountIsIdempotent (0.00s)
        invoicing_fuzz_test.go:42: normalize is not idempotent: "0,,0" -> "0,0" -> "00"

    Failing input written to testdata/fuzz/FuzzNormalizeAmountIsIdempotent/a1b2c3
    To re-run:
    go test -run=FuzzNormalizeAmountIsIdempotent/a1b2c3
FAIL'

echo "==> run_fuzz.sh failure classifier"

check "a finding is a finding" \
    finding "$(classify_fuzz_failure "$FINDING_OUT" "")"

check "a crasher on disk is a finding even with no telltale line" \
    finding "$(classify_fuzz_failure "some truncated output" "testdata/fuzz/FuzzX/a1b2c3")"

# The case that matters most. A crasher file present must win over any amount
# of deadline noise in the output — otherwise a real bug gets retried, passes
# the second time, and is thrown away.
check "a crasher wins over deadline noise" \
    finding "$(classify_fuzz_failure "$DEADLINE_OUT" "testdata/fuzz/FuzzX/a1b2c3")"

check "the deadline flake is a deadline" \
    deadline "$(classify_fuzz_failure "$DEADLINE_OUT" "")"

# Anything that is neither must stay fatal. Retrying a compile error just wastes
# a minute and then fails anyway, and a panic outside the fuzzing loop is a real
# defect that has nothing to do with timing.
check "a compile error is broken" \
    broken "$(classify_fuzz_failure "./invoicing_test.go:9:2: undefined: normalizeAmount" "")"

check "a panic is broken" \
    broken "$(classify_fuzz_failure "panic: runtime error: index out of range [3]" "")"

check "an empty output is broken, not a flake" \
    broken "$(classify_fuzz_failure "" "")"

echo "==> run_fuzz.sh retry wiring"

# The classifier being right proves nothing on its own — fuzz_one still has to
# act on it. These drive fuzz_one against a fake `go` on PATH that answers from
# a script, so the retry is observed rather than assumed.
with_fake_go() {   # answers... -> prints how many times go was called
    local sandbox answer i=0
    sandbox="$(mktemp -d)"
    mkdir -p "$sandbox/bin" "$sandbox/work/pkg"

    {
        echo '#!/usr/bin/env bash'
        echo 'n=$(( $(cat "$FAKE_GO_CALLS") + 1 )); echo "$n" > "$FAKE_GO_CALLS"'
        echo 'case "$n" in'
        for answer in "$@"; do
            i=$((i + 1))
            # Each answer is "exit_code:::output".
            printf '  %d) cat <<%s\n%s\n%s\n     exit %s ;;\n' \
                "$i" "EOF_$i" "${answer#*:::}" "EOF_$i" "${answer%%:::*}"
        done
        echo '  *) echo "fake go called too many times"; exit 99 ;;'
        echo 'esac'
    } > "$sandbox/bin/go"
    chmod +x "$sandbox/bin/go"

    echo 0 > "$sandbox/calls"
    (
        export PATH="$sandbox/bin:$PATH" FAKE_GO_CALLS="$sandbox/calls" FUZZTIME=1s
        cd "$sandbox/work"
        fuzz_one pkg FuzzThing > /dev/null 2>&1
        echo "rc=$? calls=$(cat "$FAKE_GO_CALLS")"
    )
    rm -rf "$sandbox"
}

# The flake: red once with the deadline signature, green on the retry. This is
# the whole point of the change — before it, this was a blocked merge.
check "a deadline is retried and the retry is believed" \
    "rc=0 calls=2" "$(with_fake_go "1:::$DEADLINE_OUT" "0:::ok  	pkg	1.0s")"

# Two in a row is a runner that cannot finish the budget, not a coin flip.
check "two deadlines in a row still fail" \
    "rc=1 calls=2" "$(with_fake_go "1:::$DEADLINE_OUT" "1:::$DEADLINE_OUT")"

# A finding must fail on the first run and never get a second chance. Fuzzing
# explores at random, so a second run is not the same experiment: a property
# that fails on one input in a million can come back green and the finding
# disappears with it.
check "a finding fails immediately, without a retry" \
    "rc=1 calls=1" "$(with_fake_go "1:::$FINDING_OUT")"

check "a compile error fails immediately, without a retry" \
    "rc=1 calls=1" "$(with_fake_go "1:::./x_test.go:9:2: undefined: foo")"

if [[ $failures -ne 0 ]]; then
    echo
    echo "The fuzz classifier is wrong. It decides whether a red fuzz run blocks"
    echo "a merge or gets retried — do not loosen it to make this pass."
    exit 1
fi

echo "==> run_fuzz.sh ok"
