# CI y protección de `main`

## Checks requeridos

`main` exige estos ocho checks en verde, con `enforce_admins: true` y `strict: false`. Un PR rojo
queda `BLOCKED` sin override, también para el dueño del repo:

`core-api-test`, `core-api-lint`, `core-api-coverage`, `ai-service-test`, `frontend-check`,
`secret-scan`, `govulncheck`, `skip-ratchet`.

Para ver la lista vigente:

```
gh api repos/:owner/:repo/branches/main/protection/required_status_checks --jq .contexts
```

`fuzz` corre en cada PR pero no es requerido, a propósito: genera entradas aleatorias, así que un
mismo commit puede salir rojo y luego verde, y un check que se arregla reintentando enseña a
reintentar. Cuando el fuzzing encuentra algo, el caso se commitea bajo `testdata/fuzz/` y pasa a ser
una semilla que replica `core-api-test`, que sí es requerido.

`make verify` corre lo mismo que el CI y además los chequeos de scripts que el CI no ve (deploy,
monitor, versiones, AGENTS.md). Ver `scripts/verify.sh`.

## Reglas para tocar los workflows

1. **Los nombres de job son únicos entre workflows.** La protección de rama identifica los checks
   requeridos solo por nombre; dos jobs `test` en dos workflows son ambiguos.
2. **Nunca un filtro de `paths` en el trigger `pull_request`** de un workflow con checks requeridos.
   GitHub no da por aprobado un check que un filtro dejó sin correr: el PR espera para siempre, sin
   override posible. El filtro de `paths` en `push` sí se mantiene.
3. **El repo tiene `core.fileMode = false`.** Un `chmod +x` local no llega a git y el job muere con
   `Permission denied` (exit 126). Al añadir un script que el CI ejecute:
   `git update-index --chmod=+x <script>`. `scripts/check_exec_bits.sh` lo vigila.
4. **Los jobs de build llevan `if: github.event_name != 'pull_request'`**, no `== 'push'`:
   `workflow_dispatch` es la escotilla de redespliegue manual y con `== 'push'` dejaría de desplegar
   sin avisar.

## Dependencias

Ninguna imagen instala "la última versión" de nada. Go fija con `go.sum`, el frontend con
`package-lock.json` y el ai-service con `services/ai-service/requirements.txt`, un lock con versión
exacta y hash de cada paquete que el Dockerfile instala con `--require-hashes`. El
`pyproject.toml` dice qué necesita el servicio; el lock dice qué se despliega.
`tests/test_dependency_lock.py` falla si los dos se desalinean (cómo regenerar el lock: cabecera del
archivo).

Las actualizaciones llegan como PR de Dependabot (`.github/dependabot.yml`): uno semanal por
ecosistema con los minor y patch agrupados, y los major sueltos. Pasan por los checks requeridos
como cualquier cambio y se mergean a mano.

Por qué: el 2026-10-07 un rebuild del ai-service con `anthropic>=0.27` bajó el SDK 1.x, que ya no
acepta `temperature`, y todas las llamadas a Claude fallaron durante 20 días con el deploy en verde.
Desde entonces el deploy del ai-service termina con una llamada real y mínima a Claude
(`src/ai_service/smoke.py`, ver `docs/ops/DEPLOY.md`).

## Añadir un check requerido

No se toca la protección entera. Un `POST` sobre los contexts añade sin reemplazar nada más:

```
gh api -X POST repos/:owner/:repo/branches/main/protection/required_status_checks/contexts \
  -f 'contexts[]=<nombre-del-job>'
```

Solo para cambios estructurales: `PUT` sobre `/protection` reemplaza todos los ajustes. Antes se
respalda con `gh api repos/:owner/:repo/branches/main/protection > backup.json` y se reenvían todos
los campos. Para salir de un bloqueo total: `gh api -X DELETE .../branches/main/protection`.

Contexto: `docs/ai/PLAN_TESTING_GAUNTLET.md`. Deploy: `docs/ops/DEPLOY.md`.
