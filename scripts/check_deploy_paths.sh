#!/usr/bin/env bash
#
# check_deploy_paths.sh — que el despliegue busque la versión donde el build la
# publicó.
#
# El workflow de build construye una imagen cuando cambian ciertas rutas. El de
# despliegue tiene que averiguar qué SHA tiene imagen, y lo hace preguntándole a
# git cuál fue el último commit que tocó esas mismas rutas. Son dos listas en dos
# ficheros, y el 2026-08-20 se separaron: el build incluía
# `.github/workflows/build-core-api.yml` y el despliegue no, así que un commit
# que solo tocó el workflow publicó una imagen que el despliegue no supo ver.
#
# El resultado fue un despliegue hacia ATRÁS — de fb91985 a 09bbabd — sin que
# nada fallara ni nadie se enterara. No hubo daño porque el código de core-api
# era idéntico entre las dos, pero eso fue suerte, no diseño: con una migración
# de por medio habría sido un rollback silencioso del esquema.
#
# Dos listas que deben coincidir y nadie compara terminan separándose. Aquí se
# comparan.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - <<'PY'
import sys, yaml

build = yaml.safe_load(open('.github/workflows/build-core-api.yml'))
deploy = open('.github/workflows/deploy.yml').read()

# `on` es la palabra reservada True en YAML 1.1, que es lo que usa PyYAML.
on = build.get('on', build.get(True))
filtro = sorted(on['push']['paths'])

# La lista del despliegue vive en el comando de git, entre marcadores para que
# esto no dependa de cómo esté formateada la línea.
try:
    bloque = deploy.split('# deploy-paths:inicio')[1].split('# deploy-paths:fin')[0]
except IndexError:
    print("deploy.yml no tiene los marcadores deploy-paths:inicio/fin", file=sys.stderr)
    sys.exit(1)

# El bloque vive dentro de un comando de shell, así que trae continuaciones de
# línea y comillas invertidas de los propios marcadores. Una ruta lleva barra o
# termina en .yml; lo demás es puntuación.
def es_ruta(t):
    return ('/' in t or t.endswith('.yml')) and not t.startswith('`')

usadas = sorted(t.strip() for t in bloque.split() if es_ruta(t.strip()))

# El filtro trae comodines (services/core-api/**) que git entiende como prefijo.
norm = lambda xs: sorted(p.rstrip('/*') for p in xs)

if norm(filtro) != norm(usadas):
    print("Las rutas del build y las del despliegue no coinciden.\n", file=sys.stderr)
    print(f"  build-core-api.yml publica imagen cuando cambia: {norm(filtro)}", file=sys.stderr)
    print(f"  deploy.yml busca la versión mirando:             {norm(usadas)}\n", file=sys.stderr)
    print("Una ruta que construye imagen y el despliegue no mira produce un", file=sys.stderr)
    print("despliegue hacia atrás, en silencio. Iguala las dos listas.", file=sys.stderr)
    sys.exit(1)

print(f"rutas de build y despliegue coinciden ({len(norm(filtro))})")
PY
