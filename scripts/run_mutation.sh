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
# Two things had to be learned the hard way, both encoded below:
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
#
# Usage:
#   scripts/run_mutation.sh              # every package in the list
#   scripts/run_mutation.sh ./internal/shared/hash
#
# Exit code is 1 if any package falls below THRESHOLD (efficacy = killed /
# (killed + lived)); the nightly workflow turns that into an issue.

set -euo pipefail

cd "$(dirname "$0")/../services/core-api"

# Raise by 5 points per quarter, per the plan. Bump this only after a green run
# proves the new floor holds — a threshold nobody can meet gets muted, and a
# muted gate is worse than no gate.
THRESHOLD="${MUTATION_THRESHOLD:-60}"

# Scope. Mutating all 227 files is hours of CI for no extra signal: these are the
# packages where a flipped comparison is a wrong invoice, a leaked record or an
# unenforced limit.
PACKAGES=(
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

if [ $# -gt 0 ]; then
  PACKAGES=("$@")
fi

if ! command -v gremlins >/dev/null 2>&1; then
  echo "installing gremlins…" >&2
  go install github.com/go-gremlins/gremlins/cmd/gremlins@latest
  export PATH="$PATH:$(go env GOPATH)/bin"
fi

failed=0
summary=""

for pkg in "${PACKAGES[@]}"; do
  echo "=== $pkg"
  out=$(gremlins unleash --tags='' --timeout-coefficient 200 "$pkg" 2>&1) || true

  # gremlins prints "Killed: N, Lived: M, Not covered: K" then an efficacy line.
  killed=$(printf '%s' "$out" | grep -oE 'Killed: [0-9]+' | grep -oE '[0-9]+' | tail -1 || echo 0)
  lived=$(printf '%s' "$out"  | grep -oE 'Lived: [0-9]+'  | grep -oE '[0-9]+' | tail -1 || echo 0)
  killed=${killed:-0}
  lived=${lived:-0}

  if [ "$((killed + lived))" -eq 0 ]; then
    echo "  no mutants generated — nothing to measure"
    summary="${summary}\n| ${pkg#./internal/} | – | – | no mutants |"
    continue
  fi

  efficacy=$(awk -v k="$killed" -v l="$lived" 'BEGIN{printf "%.2f", 100*k/(k+l)}')
  echo "  killed=$killed lived=$lived efficacy=${efficacy}%"

  # Surviving mutants, so the log says WHERE and not just how many.
  printf '%s' "$out" | grep -E '^\s+LIVED' || true

  verdict="ok"
  if awk -v e="$efficacy" -v t="$THRESHOLD" 'BEGIN{exit !(e < t)}'; then
    echo "  BELOW THRESHOLD (${THRESHOLD}%)"
    verdict="**below ${THRESHOLD}%**"
    failed=1
  fi
  summary="${summary}\n| ${pkg#./internal/} | $killed | $lived | ${efficacy}% ${verdict} |"
done

echo
echo "| package | killed | lived | efficacy |"
echo "|---|---|---|---|"
printf '%b\n' "$summary" | sed '/^$/d'

if [ "$failed" -ne 0 ]; then
  echo
  echo "At least one package is below the ${THRESHOLD}% threshold." >&2
  exit 1
fi
