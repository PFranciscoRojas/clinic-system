#!/usr/bin/env bash
#
# Tests for predeploy_dump.sh's decisions.
#
# This script is the last thing that runs before a migration changes production
# data, and its only job is to say "yes, there is a copy" or to stop the deploy.
# Both answers are pure. The dangerous one is a false yes: a deploy that believes
# it has a backup and does not, which is indistinguishable from having one right
# up until the afternoon somebody needs it.
#
set -euo pipefail

# shellcheck source=./predeploy_dump.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/predeploy_dump.sh"

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

echo "==> predeploy_dump.sh is there really a copy"

check "a clean dump of a normal size is ok" \
    ok "$(dump_verdict 0 450000 20000)"

check "a non-zero pg_dump is a failure" \
    failed "$(dump_verdict 1 450000 20000)"

# The one that matters. pg_dump exits 0 for a database with nothing in it, and
# writes a small, perfectly valid file. If that is accepted as a backup, the
# deploy proceeds believing it can go back, and it cannot.
check "an exit code of 0 with almost no bytes is NOT a backup" \
    suspicious "$(dump_verdict 0 300 20000)"

check "exactly at the floor is still not enough" \
    suspicious "$(dump_verdict 0 19999 20000)"
check "one byte over the floor passes" \
    ok "$(dump_verdict 0 20000 20000)"

check "a size we could not read is not a success" \
    unreadable "$(dump_verdict 0 x 20000)"
check "an empty size is not a success" \
    unreadable "$(dump_verdict 0 '' 20000)"

echo "==> predeploy_dump.sh sweeping old copies"

check "yesterday's copy stays"        keep   "$(retention_verdict 86400 7)"
check "a copy from six days ago stays" keep  "$(retention_verdict 518400 7)"
check "a copy from eight days ago goes" delete "$(retention_verdict 691200 7)"
check "a copy made this second stays"  keep   "$(retention_verdict 0 7)"

# Deleting a backup because its timestamp would not parse is the wrong way
# round: an unreadable date is a reason to look, not a reason to remove.
check "a copy whose age we cannot read is kept, not deleted" \
    keep "$(retention_verdict x 7)"

echo "==> predeploy_dump.sh naming"

check "the name carries the moment and the commit" \
    "predeploy-20260820-153000-5073cdb.sql.gz" \
    "$(dump_name 20260820-153000 5073cdb)"
check "a deploy with no ref still produces a usable name" \
    "predeploy-20260820-153000-unknown.sql.gz" \
    "$(dump_name 20260820-153000 '')"

if [[ "$failures" -ne 0 ]]; then
    echo
    echo "predeploy_dump.sh is wrong. Fix the script — do not loosen a case: each"
    echo "one is a way to migrate production with no copy behind it."
    exit 1
fi
echo "==> predeploy_dump.sh ok"
