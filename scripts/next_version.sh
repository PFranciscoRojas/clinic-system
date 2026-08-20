#!/usr/bin/env bash
#
# next_version.sh — el número de versión de un despliegue, calculado, no anotado.
#
# Este repo ya trabajó con etiquetas: hay cinco, de v0.2.0 a v0.5.0, y la última
# es del 10 de junio de 2026. Desde entonces entraron 475 commits sin una sola.
# No fue descuido: nada dependía del número, así que dejó de ponerse en cuanto
# hubo prisa. Un proceso que exige un acto humano por despliegue se abandona en
# el primer día ocupado.
#
# Así que el número no se anota, se deriva: la etiqueta más reciente da el
# major.minor, y los commits que hay encima dan el patch. Es determinista, no
# necesita permisos de escritura en el repositorio y no puede desincronizarse,
# porque no hay estado que mantener.
#
# Subir el major o el minor sigue siendo una decisión humana — se etiqueta a
# mano — y ahí es donde el número dice algo: que hay algo nuevo que contarle a
# una psicóloga. El patch solo cuenta.
set -uo pipefail

# ── pure ────────────────────────────────────────────────────────────────────

# parse_tag <tag> — "v0.9.0" → "0 9 0". Vacío si no es una versión.
# Falla en cerrado a propósito: inventar un número a partir de una etiqueta que
# no se entiende es peor que no dar ninguno.
parse_tag() {
    local t="${1#v}"
    [[ "$t" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || { echo ""; return; }
    echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]}"
}

# compose_version <base tag> <commits desde esa etiqueta>
# El patch es el de la etiqueta más los commits encima, así que etiquetar
# v0.10.0 a mano reinicia la cuenta desde ahí sin ningún caso especial.
compose_version() {
    local base="$1" count="${2:-0}" parts
    parts="$(parse_tag "$base")"
    [[ -z "$parts" ]] && { echo ""; return; }
    [[ ! "$count" =~ ^[0-9]+$ ]] && { echo ""; return; }
    # shellcheck disable=SC2086
    set -- $parts
    printf 'v%s.%s.%s\n' "$1" "$2" "$(( $3 + count ))"
}

# ── the world ───────────────────────────────────────────────────────────────

main() {
    local ref="${1:-}" base count version

    # Un push de etiqueta es una decisión explícita y manda sobre el cálculo.
    if [[ "$ref" == refs/tags/* ]]; then
        local tag="${ref#refs/tags/}"
        [[ -n "$(parse_tag "$tag")" ]] && { echo "$tag"; return 0; }
    fi

    base="$(git describe --tags --abbrev=0 2>/dev/null || echo '')"
    if [[ -z "$(parse_tag "$base")" ]]; then
        echo "next_version: no hay ninguna etiqueta de versión de la que partir" >&2
        return 1
    fi
    count="$(git rev-list --count "$base"..HEAD 2>/dev/null || echo 0)"
    version="$(compose_version "$base" "$count")"
    [[ -z "$version" ]] && { echo "next_version: no pude componer la versión" >&2; return 1; }
    echo "$version"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
