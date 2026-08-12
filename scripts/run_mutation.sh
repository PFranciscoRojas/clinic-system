#!/usr/bin/env bash
#
# Mutation testing over the packages whose logic is worth breaking on purpose.
#
# What this measures, and why it is not coverage: coverage says a line ran.
# Mutation says that if the line had been WRONG, a test would have failed.
# gremlins flips a comparison (`>` to `>=`, `==` to `!=`, `+` to `-`), reruns the
# package's tests, and asks whether anything noticed. A mutant that survives is a
# line the suite executes but does not actually check.
#
# Three things had to be learned the hard way, all encoded below:
#
#   1. --timeout-coefficient. Without it gremlins reports every mutant as
#      TIMED OUT in under a second: it derives the per-mutant budget from a
#      baseline run it measures too optimistically, and the whole report is
#      garbage that looks like a result. 200 is generous on purpose — an honest
#      slow run beats a fast lie.
#   2. gremlins only ever runs the tests OF THE PACKAGE IT IS MUTATING. Logic
#      covered exclusively by internal/integration (SubscriptionGate, TenantScope)
#      shows up as surviving mutants here even though the behaviour is pinned.
#      That is a tool limitation, not a test gap. Do not "fix" it by duplicating
#      integration tests into the unit package.
#   3. A TIMED OUT mutant is a finding, not a rounding error. It means the flip
#      turned a loop into one that does not end, and the per-mutant budget is
#      generous by design (point 1), so the process gets minutes to allocate.
#      This is not hypothetical: two such mutants in ./internal/leadbooking grew
#      a test binary past 9 GB and the kernel killed the CI runner, eight nights
#      running. Efficacy is killed / (killed + lived) and cannot see them, which
#      is why they are counted, named and fatal here.
#
# Usage:
#   scripts/run_mutation.sh              # every package in the list
#   scripts/run_mutation.sh ./internal/shared/hash
#
# Sourcing this file defines the functions without running anything, which is
# how scripts/run_mutation_test.sh exercises the reader.
#
# Exit code is 1 if any package falls below THRESHOLD or has a mutant that hung;
# the nightly workflow turns that into an issue.

set -euo pipefail

# Raise by 5 points per quarter, per the plan. Bump this only after a green run
# proves the new floor holds — a threshold nobody can meet gets muted, and a
# muted gate is worse than no gate.
THRESHOLD="${MUTATION_THRESHOLD:-60}"

# Scope. Mutating all 227 files is hours of CI for no extra signal: these are the
# packages where a flipped comparison is a wrong invoice, a leaked record or an
# unenforced limit.
DEFAULT_PACKAGES=(
  ./internal/shared/crypto
  ./internal/shared/hash
  ./internal/shared/clinicalperm
  ./internal/shared/middleware
  ./internal/auth/service
  ./internal/invoicing
  ./internal/availability
  ./internal/leadbooking
  ./internal/recordtemplates
)

# "<killed> <lived> <timed out>", or "unparseable".
#
# The distinction in the last case is the point: gremlins that crashed before it
# printed a summary, and gremlins that judged nothing, both used to read as
# zeroes. One is a broken run and the other is a measurement.
parse_mutation_counts() {
  local out="$1" killed lived timedout
  killed=$(printf '%s' "$out" | grep -oE 'Killed: [0-9]+' | grep -oE '[0-9]+' | tail -1)
  if [ -z "$killed" ]; then
    echo unparseable
    return
  fi
  lived=$(printf '%s' "$out" | grep -oE 'Lived: [0-9]+' | grep -oE '[0-9]+' | tail -1)
  timedout=$(printf '%s' "$out" | grep -oE 'Timed out: [0-9]+' | grep -oE '[0-9]+' | tail -1)
  echo "$killed ${lived:-0} ${timedout:-0}"
}

# ok | below | timeout | no-mutants
#
# `timeout` is checked first on purpose. A hang outranks a low percentage because
# it is the more actionable of the two — a loop that can run forever is a defect
# in the code, where a surviving mutant is a gap in the tests — and because the
# percentage is computed without it and will happily read 95% on a package that
# just took the runner down.
mutation_verdict() {
  local killed="$1" lived="$2" timedout="$3" threshold="$4" efficacy
  if [ "$timedout" -gt 0 ]; then
    echo timeout
    return
  fi
  if [ "$((killed + lived))" -eq 0 ]; then
    echo no-mutants
    return
  fi
  efficacy=$(awk -v k="$killed" -v l="$lived" 'BEGIN{printf "%.2f", 100*k/(k+l)}')
  if awk -v e="$efficacy" -v t="$threshold" 'BEGIN{exit !(e < t)}'; then
    echo below
  else
    echo ok
  fi
}

# The lines worth keeping out of a run that is otherwise hundreds of lines of
# KILLED. LIVED says where the suite is not looking; TIMED OUT says where the
# code can hang. Both name a file and a position, which is the only part of the
# output a human can act on.
mutation_notable_lines() {
  printf '%s' "$1" | grep -E '^[[:space:]]+(LIVED|TIMED OUT)' || true
}

mutation_efficacy() {
  awk -v k="$1" -v l="$2" 'BEGIN{ if (k+l == 0) { print "–" } else { printf "%.2f", 100*k/(k+l) } }'
}

install_gremlins_if_missing() {
  command -v gremlins >/dev/null 2>&1 && return 0
  echo "installing gremlins…" >&2
  go install github.com/go-gremlins/gremlins/cmd/gremlins@latest
  PATH="$PATH:$(go env GOPATH)/bin"
  export PATH
}

run_mutation_packages() {
  local packages=("$@") pkg out counts killed lived timedout verdict efficacy
  local failed=0 hung=0 summary=""

  cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../services/core-api" && pwd)"
  install_gremlins_if_missing

  [ ${#packages[@]} -eq 0 ] && packages=("${DEFAULT_PACKAGES[@]}")

  for pkg in "${packages[@]}"; do
    echo "=== $pkg"
    out=$(gremlins unleash --tags='' --timeout-coefficient 200 "$pkg" 2>&1) || true

    counts=$(parse_mutation_counts "$out")
    if [ "$counts" = "unparseable" ]; then
      # No summary line at all. gremlins did not get to the end, so there is
      # nothing to compare against a threshold — and swallowing that is how the
      # nightly job reported eight green-looking zeroes.
      echo "  gremlins printed no summary — the run did not finish"
      printf '%s\n' "$out" | tail -15
      summary="${summary}\n| ${pkg#./internal/} | – | – | – | **no summary** |"
      failed=1
      continue
    fi
    read -r killed lived timedout <<<"$counts"

    efficacy=$(mutation_efficacy "$killed" "$lived")
    echo "  killed=$killed lived=$lived timedout=$timedout efficacy=${efficacy}%"
    mutation_notable_lines "$out"

    verdict=$(mutation_verdict "$killed" "$lived" "$timedout" "$THRESHOLD")
    case "$verdict" in
      timeout)
        echo "  MUTANT HUNG — a flip here turns a bounded loop into an unbounded one"
        summary="${summary}\n| ${pkg#./internal/} | $killed | $lived | $timedout | **hung** |"
        failed=1
        hung=1
        ;;
      below)
        echo "  BELOW THRESHOLD (${THRESHOLD}%)"
        summary="${summary}\n| ${pkg#./internal/} | $killed | $lived | $timedout | **below ${THRESHOLD}%** |"
        failed=1
        ;;
      no-mutants)
        echo "  no mutants generated — nothing to measure"
        summary="${summary}\n| ${pkg#./internal/} | – | – | – | no mutants |"
        ;;
      *)
        summary="${summary}\n| ${pkg#./internal/} | $killed | $lived | $timedout | ${efficacy}% ok |"
        ;;
    esac
  done

  echo
  echo "| package | killed | lived | timed out | verdict |"
  echo "|---|---|---|---|---|"
  printf '%b\n' "$summary" | sed '/^$/d'

  [ "$failed" -eq 0 ] && return 0

  echo
  if [ "$hung" -ne 0 ]; then
    echo "A mutant timed out. Find the TIMED OUT line above: at that position a" >&2
    echo "single flipped operator makes a loop stop advancing, and the per-mutant" >&2
    echo "budget lets it allocate until something dies — on a CI runner that is" >&2
    echo "the runner. Fix it by making the loop terminate by construction (bound" >&2
    echo "the iteration count), not by shortening the budget." >&2
  else
    echo "At least one package is below the ${THRESHOLD}% threshold." >&2
  fi
  return 1
}

# Only run when executed, not when sourced by the test.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_mutation_packages "$@"
fi
