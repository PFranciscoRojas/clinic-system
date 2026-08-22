#!/usr/bin/env bash
#
# check_compose_files.sh — que nadie hable con producción con medio fichero.
#
# En el VPS los volúmenes de datos no son volúmenes de verdad: son montajes bind
# al directorio del host, y esa forma la da el overlay `docker-compose.prod.yml`
# con `driver_opts`. El fichero base los declara pelados (`postgres_data:` y
# nada más), o sea que los mismos cinco volúmenes tienen dos definiciones
# distintas según cuántos ficheros se le pasen a compose.
#
# Compose compara la definición contra el volumen que ya existe, y cuando no
# cuadra pregunta:
#
#   Volume "clinic-system_postgres_data" exists but doesn't match configuration
#   in compose file. Recreate (data will be lost)?
#
# Eso salió en todos los despliegues desde que existe el blue/green, porque
# deploy_switch.sh llamaba a compose solo con el base. Nunca se perdió nada —
# en no interactivo la respuesta por defecto es "no", y de todas formas borrar
# un volumen bind deja intacto el directorio del host (probado el 2026-08-21).
# El daño era otro: la frase más alarmante que sabe imprimir este sistema
# aparecía en cada despliegue sin significar nada, y así es como se aprende a
# saltarse un aviso. El día que uno diga algo de verdad, también se salta.
#
# Un `docker compose` que nombra el fichero base y no el overlay es esa
# pregunta esperando a volver, así que aquí se buscan.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - <<'PY'
import re, sys

# Lo que se revisa: lo que se ejecuta contra el VPS. Los ficheros de compose de
# desarrollo y la documentación quedan fuera a propósito — en local no existen
# los volúmenes bind y el overlay no aplica.
objetivos = [
    'scripts/deploy_switch.sh',
    'scripts/monitor.sh',
    'scripts/backup.sh',
    'scripts/predeploy_dump.sh',
    'scripts/migration_rehearsal.sh',
    '.github/workflows/deploy.yml',
    '.github/workflows/rollback.yml',
]

# Una invocación puede ocupar varias líneas con barra invertida al final, así
# que primero se pegan.
def invocaciones(texto):
    unido = re.sub(r'\\\n\s*', ' ', texto)
    for linea in unido.split('\n'):
        if 'docker compose' in linea:
            yield linea

fallos = []
for ruta in objetivos:
    try:
        texto = open(ruta).read()
    except FileNotFoundError:
        continue
    for linea in invocaciones(texto):
        limpia = linea.strip()
        if limpia.startswith('#'):
            continue
        if '-f' not in limpia or 'docker-compose.yml' not in limpia:
            # Sin -f explícito compose usa el .env del directorio, que en el VPS
            # es quien decide qué ficheros entran. No es asunto de esto.
            continue
        if 'docker-compose.prod.yml' in limpia:
            continue
        fallos.append((ruta, limpia))

if fallos:
    print("Hay invocaciones de compose que nombran el fichero base sin el overlay:\n",
          file=sys.stderr)
    for ruta, linea in fallos:
        print(f"  {ruta}\n    {linea}\n", file=sys.stderr)
    print("Con el base solo, compose ve los volúmenes de datos declarados pelados,", file=sys.stderr)
    print("no cuadra con los que existen en el VPS, y ofrece recrearlos —", file=sys.stderr)
    print("'Recreate (data will be lost)?' — en cada despliegue. Añade", file=sys.stderr)
    print("-f docker-compose.prod.yml a la invocación.", file=sys.stderr)
    sys.exit(1)

print(f"compose: las invocaciones de producción llevan los dos ficheros ({len(objetivos)} revisados)")
PY
