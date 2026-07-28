#!/usr/bin/env bash
#
# Coverage ratchet for core-api.
#
# Reads services/core-api/coverage-floors.txt and enforces every floor in it
# against a fresh `go test -short` coverage profile. Fails on three conditions:
#
#   1. a target measured BELOW its floor  — a PR added untested code
#   2. a target measured too far ABOVE it — the floor needs bumping, and saying
#      so is the only thing that makes a ratchet actually ratchet
#   3. a floor naming a package that no longer exists — a stale entry
#
# Usage:
#   scripts/check_coverage.sh          check
#   scripts/check_coverage.sh --bump   rewrite the floors to what was measured
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/services/core-api"
FLOORS="$API_DIR/coverage-floors.txt"

# How far above a floor a measurement may sit before we demand a bump. Small
# enough that the floor tracks reality, large enough that adding one covered
# helper does not fail the build.
DRIFT="${COVERAGE_DRIFT:-1.0}"

BUMP=0
[[ "${1:-}" == "--bump" ]] && BUMP=1

PROFILE="$(mktemp)"
trap 'rm -f "$PROFILE" "$PROFILE.measured"' EXIT

echo "==> go test -short -coverprofile (core-api)"
(cd "$API_DIR" && go test -short -covermode=atomic -coverprofile="$PROFILE" ./... >/dev/null)

# Aggregate the raw profile rather than `go tool cover -func`: the profile
# carries the statement count per block, so package totals are exact instead of
# an unweighted average of per-function percentages.
#
# Profile line: <import/path/file.go>:<start>,<end> <numStatements> <count>
awk '
    NR == 1 { next }                                   # "mode:" header
    {
        split($1, loc, ":")
        path = loc[1]
        pkg  = substr(path, 1, match(path, /\/[^\/]*$/) - 1)
        stmts[pkg] += $2
        total_stmts += $2
        if ($3 > 0) { covered[pkg] += $2; total_covered += $2 }
    }
    END {
        for (p in stmts) printf "%s %.1f\n", p, 100 * covered[p] / stmts[p]
        if (total_stmts > 0) printf "total %.1f\n", 100 * total_covered / total_stmts
        else print "total 0.0"
    }
' "$PROFILE" | sort > "$PROFILE.measured"

fail=0
bumped="$(mktemp)"

while IFS= read -r line; do
    # Preserve comments and blank lines verbatim when bumping.
    if [[ -z "$line" || "$line" == \#* ]]; then
        echo "$line" >> "$bumped"
        continue
    fi

    target="$(awk '{print $1}' <<<"$line")"
    floor="$(awk '{print $2}' <<<"$line")"
    got="$(awk -v t="$target" '$1 == t { print $2 }' "$PROFILE.measured")"

    if [[ -z "$got" ]]; then
        echo "STALE   $target — floor set but the package produced no statements (renamed? deleted?)"
        fail=1
        echo "$line" >> "$bumped"
        continue
    fi

    if awk -v g="$got" -v f="$floor" 'BEGIN { exit !(g + 0 < f + 0) }'; then
        echo "BELOW   $target — ${got}% < floor ${floor}%"
        fail=1
        echo "$line" >> "$bumped"
    elif awk -v g="$got" -v f="$floor" -v d="$DRIFT" 'BEGIN { exit !(g + 0 > f + 0 + d) }'; then
        echo "BUMP    $target — ${got}% is above floor ${floor}%; raise the floor to ${got}"
        fail=1
        echo "$target $got" >> "$bumped"
    else
        echo "ok      $target — ${got}% (floor ${floor}%)"
        echo "$line" >> "$bumped"
    fi
done < "$FLOORS"

if [[ $BUMP -eq 1 ]]; then
    mv "$bumped" "$FLOORS"
    echo
    echo "==> floors rewritten in $FLOORS"
    exit 0
fi
rm -f "$bumped"

if [[ $fail -ne 0 ]]; then
    echo
    echo "Coverage ratchet failed. Run 'scripts/check_coverage.sh --bump' to accept"
    echo "the measured numbers, then commit coverage-floors.txt with the tests that"
    echo "earned them."
    exit 1
fi

echo
echo "==> coverage ratchet ok"
