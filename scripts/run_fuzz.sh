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
# Sourcing this file defines the functions without running anything, which is
# how scripts/run_fuzz_test.sh exercises the classifier.
#
set -euo pipefail

# Crashers on disk for one target, one path per line. This is the ground truth
# about whether the fuzzer found something: Go writes the input here before it
# reports the failure, and the file is what a human would go commit.
fuzz_crashers() {
    local dir="$1/testdata/fuzz/$2"
    [[ -d "$dir" ]] || return 0
    find "$dir" -type f | sort
}

# Why a fuzz run came back red.
#
#   finding   the fuzzer found an input — the only outcome that should block a merge
#   deadline  the engine ran out of time mid-RPC and reported that as a failure
#   broken    anything else: a compile error, a panic, a target that cannot start
#
# The deadline case is a real Go behaviour, not a theory: when -fuzztime elapses
# the coordinator cancels the context, and a worker with a request in flight
# surfaces "context deadline exceeded" as a test failure. Observed on CI
# 2026-08-11 on a pull request that changed one Markdown file, with the same
# target passing 10 million executions locally straight afterwards.
#
# The order of the checks is the whole safety property. A crasher on disk wins
# over any amount of deadline noise in the output, so a genuine finding can
# never be mistaken for a flake and retried away.
classify_fuzz_failure() {
    local out="$1" new_crashers="$2"
    if [[ -n "$new_crashers" || "$out" == *"Failing input written"* ]]; then
        echo finding
    elif [[ "$out" == *"context deadline exceeded"* ]]; then
        echo deadline
    else
        echo broken
    fi
}

fuzz_one() {   # pkg target -> 0 ok, 1 red; prints go's output on failure
    local pkg="$1" target="$2" before after new out
    before="$(fuzz_crashers "$pkg" "$target")"

    if out=$(go test -run '^$' -fuzz "^${target}\$" -fuzztime="$FUZZTIME" "./${pkg}" 2>&1); then
        echo "ok"
        return 0
    fi

    after="$(fuzz_crashers "$pkg" "$target")"
    new="$(comm -13 <(echo "$before") <(echo "$after"))"

    if [[ "$(classify_fuzz_failure "$out" "$new")" != "deadline" ]]; then
        echo "FAIL"
        printf '%s\n\n' "$(echo "$out" | tail -25)"
        return 1
    fi

    # Out of time, nothing found. Once more — but only once, and the second run
    # is judged on its own merits. Two deadline failures in a row is not a
    # flake, it is a runner that cannot finish the budget, and that should be
    # visible rather than papered over.
    echo "deadline — reintentando"
    printf '%-46s ' "$target (2/2)"
    before="$(fuzz_crashers "$pkg" "$target")"
    if out=$(go test -run '^$' -fuzz "^${target}\$" -fuzztime="$FUZZTIME" "./${pkg}" 2>&1); then
        echo "ok"
        return 0
    fi
    after="$(fuzz_crashers "$pkg" "$target")"
    new="$(comm -13 <(echo "$before") <(echo "$after"))"
    echo "FAIL ($(classify_fuzz_failure "$out" "$new"))"
    printf '%s\n\n' "$(echo "$out" | tail -25)"
    return 1
}

run_all_fuzz_targets() {
    local REPO_ROOT API_DIR entry pkg target failed=0

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
        return 1
    fi

    echo "==> ${#targets[@]} fuzz targets, ${FUZZTIME} each"
    echo

    for entry in "${targets[@]}"; do
        pkg="${entry%% *}"
        target="${entry##* }"
        printf '%-46s ' "$target"
        fuzz_one "$pkg" "$target" || failed=1
    done

    if [[ $failed -ne 0 ]]; then
        echo
        echo "A fuzz target found a failing input. Go wrote it to"
        echo "services/core-api/<pkg>/testdata/fuzz/<Target>/ — commit that file."
        echo "It becomes a seed, so the case is replayed by every future 'go test'."
        return 1
    fi

    echo
    echo "==> all fuzz targets ok"
}

# Only run when executed, not when sourced by the test.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_all_fuzz_targets
fi
