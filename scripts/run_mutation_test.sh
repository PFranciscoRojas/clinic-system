#!/usr/bin/env bash
#
# Tests for run_mutation.sh's reading of a gremlins run.
#
# The nightly mutation job failed eight nights in a row, every night in
# ./internal/leadbooking, with `exit code 143` and nothing in the log to say
# why. The cause was two mutants that turn a bounded loop into an unbounded one:
# the test binary grew past 9 GB and the kernel took the runner down with it.
#
# What made that take eight nights instead of one was not the mutants. It was
# that this script threw away the only line that named them. gremlins reports
# them as TIMED OUT, the summary counted killed and lived and nothing else, and
# efficacy — killed / (killed + lived) — is blind to a mutant that never
# finished. A hang was arithmetically indistinguishable from a mutant that does
# not exist.
#
# So the cases below are about the reading, not the mutating: a timed-out mutant
# must be counted, named, and must fail the run.
#
set -euo pipefail

# shellcheck source=./run_mutation.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run_mutation.sh"

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

# An ordinary run: everything judged one way or the other.
CLEAN_OUT='Gathering coverage... done in 102.066814ms
      KILLED CONDITIONALS_NEGATION at service.go:75:9
       LIVED CONDITIONALS_BOUNDARY at service.go:160:22

Mutation testing completed in 40 seconds
Killed: 23, Lived: 1, Not covered: 69
Timed out: 0, Not viable: 0, Skipped: 0
Test efficacy: 95.83%
Mutator coverage: 25.81%'

# The real ./internal/leadbooking output of 2026-08-12, from the run that had to
# be reproduced locally because CI never got far enough to print it.
HANG_OUT='Gathering coverage... done in 102.066814ms
      KILLED CONDITIONALS_NEGATION at service.go:75:9
   TIMED OUT CONDITIONALS_BOUNDARY at service.go:164:10
   TIMED OUT CONDITIONALS_NEGATION at service.go:164:10

Mutation testing completed in 55 seconds
Killed: 23, Lived: 1, Not covered: 69
Timed out: 2, Not viable: 0, Skipped: 0
Test efficacy: 95.83%
Mutator coverage: 25.81%'

# A package where nothing is covered: gremlins runs, finds mutants, tests none.
EMPTY_OUT='Gathering coverage... done in 30ms
Killed: 0, Lived: 0, Not covered: 12
Timed out: 0, Not viable: 0, Skipped: 0'

echo "==> run_mutation.sh counts"

check "reads killed, lived and timed out" \
    "23 1 0" "$(parse_mutation_counts "$CLEAN_OUT")"

# The one that was missing. Before this, the 2 was read as a 0 and the run
# reported 95.83% efficacy on a package that had just crashed the runner.
check "a timed-out mutant is counted, not dropped" \
    "23 1 2" "$(parse_mutation_counts "$HANG_OUT")"

check "a package with nothing covered reads as zeroes" \
    "0 0 0" "$(parse_mutation_counts "$EMPTY_OUT")"

# gremlins crashed, or was killed before it printed anything. Reading that as
# "0 killed, 0 lived" and moving on is how a broken run looks green.
check "no counts at all is not the same as zero" \
    "unparseable" "$(parse_mutation_counts "installing gremlins…")"

echo "==> run_mutation.sh verdict"

check "above the threshold is ok" \
    ok "$(mutation_verdict 23 1 0 60)"

check "below the threshold fails" \
    below "$(mutation_verdict 5 15 0 60)"

# Efficacy is computed over killed + lived, so 23/24 still reads as 95.83% here.
# The verdict has to come from the timeout, not from the percentage — otherwise
# the number keeps saying the suite is fine while the runner dies.
check "a timeout fails even when efficacy is high" \
    timeout "$(mutation_verdict 23 1 2 60)"

# And it must outrank a low percentage too, because it is the more actionable of
# the two: a hang is a loop that can run forever, which is a defect in the code
# rather than a gap in the tests.
check "a timeout outranks being below the threshold" \
    timeout "$(mutation_verdict 1 19 2 60)"

check "nothing measured is its own verdict" \
    "no-mutants" "$(mutation_verdict 0 0 0 60)"

# A threshold exactly met passes. Raising the floor is a deliberate act (the
# comment in run_mutation.sh says so); a strict > would silently move it.
check "exactly at the threshold passes" \
    ok "$(mutation_verdict 6 4 0 60)"

echo "==> run_mutation.sh log lines"

# The lines a human needs are the ones naming a file and a position. LIVED says
# where the suite is not looking; TIMED OUT says where the code can hang. Both
# have to survive into mutation.log, which is the job's only deliverable.
check "surviving and hanging mutants are both named" \
    "   TIMED OUT CONDITIONALS_BOUNDARY at service.go:164:10
   TIMED OUT CONDITIONALS_NEGATION at service.go:164:10" \
    "$(mutation_notable_lines "$HANG_OUT" | grep 'TIMED OUT')"

check "a killed mutant is not worth a line" \
    "" "$(mutation_notable_lines "$HANG_OUT" | grep 'KILLED' || true)"

if [[ $failures -ne 0 ]]; then
    echo
    echo "The mutation reader is wrong. It decides whether a nightly run is"
    echo "reported as a measurement or as a failure — do not loosen it to make"
    echo "this pass."
    exit 1
fi

echo "==> run_mutation.sh ok"
