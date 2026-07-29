#!/usr/bin/env bash
#
# Runs every Go fuzz target in core-api for a bounded time.
#
# `go test ./...` only replays the seed corpus, which proves nothing a table
# test would not. This is what actually generates input. It discovers targets
# instead of listing them, so a new FuzzXxx is exercised the moment it is
# committed — a list would silently go stale, which is the failure mode this
# whole phase exists to avoid.
#
# Usage:
#   scripts/run_fuzz.sh          30s per target (the CI default)
#   FUZZTIME=5m scripts/run_fuzz.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/services/core-api"
FUZZTIME="${FUZZTIME:-30s}"

cd "$API_DIR"

# One (package, target) pair per line.
mapfile -t targets < <(
    grep -rn '^func Fuzz' --include='*_test.go' . \
        | sed -E 's|^\./([^:]*)/[^/:]+_test\.go:[0-9]+:func (Fuzz[A-Za-z0-9_]+).*|\1 \2|' \
        | sort -u
)

if [[ ${#targets[@]} -eq 0 ]]; then
    echo "No fuzz targets found. That is almost certainly a bug in this script's"
    echo "discovery pattern rather than an empty repository — failing loudly."
    exit 1
fi

echo "==> ${#targets[@]} fuzz targets, ${FUZZTIME} each"
echo

failed=0
for entry in "${targets[@]}"; do
    pkg="${entry%% *}"
    target="${entry##* }"
    printf '%-46s ' "$target"
    if out=$(go test -run '^$' -fuzz "^${target}\$" -fuzztime="$FUZZTIME" "./${pkg}" 2>&1); then
        echo "ok"
    else
        echo "FAIL"
        echo "$out" | tail -25
        echo
        failed=1
    fi
done

if [[ $failed -ne 0 ]]; then
    echo
    echo "A fuzz target found a failing input. Go wrote it to"
    echo "services/core-api/<pkg>/testdata/fuzz/<Target>/ — commit that file."
    echo "It becomes a seed, so the case is replayed by every future 'go test'."
    exit 1
fi

echo
echo "==> all fuzz targets ok"
