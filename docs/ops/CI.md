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
