#!/usr/bin/env bash
#
# Every shell script this repo runs by path must be executable in git.
#
# This repo lives on a filesystem with core.fileMode = false, so git never
# looks at the mode on disk. A script created with chmod +x locally gets
# committed 100644 and nothing complains: `make verify` keeps passing, because
# the working copy still has the bit the index does not.
#
# It goes wrong at the far end. On 2026-08-19 scripts/monitor.sh was committed
# 100644, and the moment the VPS replaced its scp'd copy with the tracked one,
# cron started getting "permission denied" every five minutes. The monitor was
# not down — it never ran, and the log it would have complained in was the same
# log that stayed silent. A watcher that cannot be executed is worse than none,
# because the empty log reads like good news.
#
# The rule is blunt on purpose: a .sh file is either something we run, and then
# it is 100755, or it is not a .sh file.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

offenders="$(git ls-files -s '*.sh' | awk '$1 != "100755" {print "  " $1 "  " $4}')"

if [[ -z "$offenders" ]]; then
    echo "exec bits ok — todos los .sh rastreados son 100755"
    exit 0
fi

echo "Estos scripts están commiteados sin bit de ejecución:"
echo "$offenders"
echo
echo "Arréglalo en el índice, no en el disco — con core.fileMode = false un"
echo "chmod local no cambia nada de lo que se commitea:"
echo
echo "  git update-index --chmod=+x <ruta>"
echo
echo "No relajes esta comprobación para pasar el build: el modo es lo que"
echo "decide si el script corre en el servidor."
exit 1
