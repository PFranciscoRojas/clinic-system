# Chapni — clinic-system

Instrucciones para cualquier agente de código (Claude Code, Codex, Cursor, Gemini) y para humanos
nuevos en el repo. Las reglas viven aquí; los datos que cambian (versiones, modelos, estado) viven
en su archivo fuente y aquí solo se apunta a ellos.

Chapni es un SaaS multi-tenant de historia clínica para psicólogos, Colombia primero, en producción
en `app.chapni.com`. Lo que lo distingue: historia clínica cifrada por paciente, transcripción local
del audio de sesión y cumplimiento legal colombiano (Res. 1995/1999, Ley 1581, Ley 1090).

El nombre del producto es Chapni. `SGHCP` y `sghcp_*` quedan a propósito en infraestructura (roles
y base de datos, contenedores, module path de Go sghcp/core-api, claves de localStorage). No se
"corrigen", y SGHCP nunca aparece en una superficie que vea un usuario.

La landing pública (chapni.com) es otro repo hermano, ../chapni, en Astro en Cloudflare.

## Reglas estrictas

Los tests citan estas reglas por número. Si cambias la numeración, cambias los tests.

1. **Idioma.** Todo artefacto técnico va en inglés: código, SQL (tablas, columnas, ENUMs), commits,
   ramas y comentarios en código. La documentación de `docs/`, los AGENTS.md y las conversaciones
   van en español.
2. **Multi-tenant.** Toda consulta de un request autenticado corre en la conexión que fija
   `TenantScope` (RLS por `app.current_org`). La app se conecta como `sghcp_app`, NOSUPERUSER y no
   dueño de las tablas. Sin excepciones. Detalle en `services/core-api/AGENTS.md`.
3. **Dinero.** Todo cálculo financiero se hace en PostgreSQL con `NUMERIC`. Nunca floats, tampoco
   en el transporte JSON.
4. **PII y datos clínicos.** Nombres, documento, teléfono y contenido clínico son `BYTEA`, cifrados
   con AES-256-GCM usando una DEK por paciente envuelta con `MASTER_KEY`. La búsqueda va solo por
   HMAC-SHA256 con `SEARCH_PEPPER` (`services/core-api/internal/shared/hash/hash.go`). Nunca `LIKE`
   sobre columnas cifradas.
5. **IA clínica.** El LLM solo recibe texto anonimizado. Whisper corre local y el audio nunca sale
   del servidor. Los borradores IA (`ai_drafts`) son inmutables y el profesional los aprueba
   explícitamente. La IA sugiere; el humano decide.

Por defecto, fail-closed: ante la duda, se niega el acceso o se aborta la operación.

## Definition of Done

Un cambio está terminado cuando `make verify` sale en verde. No antes, y no por otro criterio.

```
make verify     # los mismos checks que el CI, y algunos más, en orden
make hooks      # una vez por clon: 'git push' corre make verify
```

Está prohibido reportar trabajo como hecho apoyándose en la parte de la suite que se alcanzó a
correr, en "los tests que toqué pasan" o en que compila. Si `make verify` no se corrió, el estado
que se reporta es "sin verificar", con esa palabra.

`VERIFY_SKIP="frontend-test ai-test" make verify` existe para el loop local rápido. Nunca para
declarar algo terminado.

### Reglas sobre los tests

1. **Prohibido debilitar, saltar o borrar un test para que pase el build.** Esto incluye `t.Skip`,
   `it.skip`/`xit`, `@pytest.mark.skip`/`xfail`, comentar una aserción, aflojar una comparación,
   bajar un piso de cobertura y subir un presupuesto. Un test rojo es información; apagarlo la
   destruye. El trinquete (`make skips`, `skip-budget.txt`) falla si sube el número de tests
   apagados. Si uno tiene que apagarse, se sube el presupuesto en el mismo commit con el motivo en el
   mensaje: `scripts/check_skips.sh --bump`. Igual para `scripts/check_coverage.sh --bump` y
   `scripts/check_bundle_size.sh --bump`: son decisiones, no arreglos.
2. **Si el test está mal, se arregla o se borra diciéndolo.** Borrar un test es legítimo cuando la
   garantía que cubría dejó de existir. La diferencia se escribe en el commit.
3. **Todo bug encontrado en producción entra primero como test que falla.** Se reproduce, se ve
   rojo, y solo entonces se arregla.
4. **Un hallazgo de seguridad se pinea con un test que falla antes del parche**, y el test se queda.
   Actualizar la dependencia deja el escáner en verde con la vulnerabilidad viva (ver `chi.RealIP`,
   PR #250).

## Ramas, commits y deploy

- `main` está protegido: solo entra por PR con los checks requeridos en verde (`enforce_admins`, sin
  override). Ramas: `feature/*`, `enhancement/*`, `fix/*`, `hotfix/*`, `chore/*`.
- Commits: `tipo(scope): descripción`. Tipos: `feat`, `fix`, `test`, `refactor`, `chore`,
  `enhancement`, `docs`. El scope es el área: `auth`, `patients`, `agenda`, `billing`, `clinical`,
  `ai`, `db`, `ci`, `ops`.
- Mergear a `main` no despliega core-api ni frontend: salen todas las noches a las 22:00 de Bogotá,
  con las migraciones aplicadas antes de cambiar el contenedor. El ai-service sí se despliega al
  mergear. Por eso las migraciones tienen que ser
  aditivas. Detalle, urgencias y trampas conocidas en `docs/ops/DEPLOY.md`. Reglas de los
  workflows de CI en `docs/ops/CI.md`.

## Dónde vive cada cosa

```
services/core-api/     Go: API, migraciones, workers      → services/core-api/AGENTS.md
services/frontend/     React + TypeScript (Vite)          → services/frontend/AGENTS.md
services/ai-service/   Python: Whisper local + LLM        → services/ai-service/AGENTS.md
scripts/               verify, trinquetes, deploy, monitor, backups
docs/                  documentación en español (ver abajo)
```

Las versiones no se copian aquí: Go en `services/core-api/go.mod`, frontend en
`services/frontend/package.json`, modelos de IA en `services/ai-service/src/ai_service/config.py`,
servicios del stack en `docker-compose.yml` y `docker-compose.prod.yml`.

## Documentación, a leer bajo demanda

| Archivo | Cuándo |
|---|---|
| `docs/ai/ACTIVE_TASK.md` | "continúa", "qué sigue": checklist o siguiente paso sugerido |
| `docs/project/STATUS.md` | estado vivo, roadmap, bloqueantes |
| `docs/ai/BACKLOG.md` | ideas y pendientes |
| `docs/history/CHANGELOG.md` | historial compactado |
| `docs/ops/DEPLOY.md`, `docs/ops/CI.md` | antes de tocar workflows, deploy o el VPS |
| `docs/ops/MONITORING.md`, `docs/ops/DR_RUNBOOK.md` | vigilancia y recuperación |
| `docs/architecture/` | ADRs y C4 |
| `docs/legal/README.md` | estado legal; los textos legales vigentes viven en BD (`legal_documents`) |

Los planes de `docs/ai/` dicen qué falta, no qué se hizo. Un plan cumplido se borra (el historial
está en git y en el CHANGELOG), pero antes se busca quién lo cita en todo el repo, código incluido.

## Decisiones vigentes que no se reabren

- **Cero widgets en plantillas clínicas.** Todo campo estructurado nuevo es `select`/`multiselect`
  de plantilla (`{pills}`, `{allow_other}`). `risk_level` es un control fijo del sistema que la IA
  sugiere, no un campo de plantilla. Los renderers viejos se conservan solo para versiones
  archivadas.
- **WhatsApp apagado a propósito** (`enabled=false`): la API de Meta cobra por conversación. Se
  enciende cuando haya clientes pagando, no antes.
- **Los textos legales se publican en BD** como versión nueva. Editar el archivo no basta.
- **Las plantillas y los registros firmados son inmutables**: editar una plantilla archiva la fila y
  crea versión nueva; un registro queda anclado a su `template_id` para siempre.
- **Worktrees fuera de `/tmp`**, en `/mnt/SSD2/AProjectsPro/SGHCP_Workspace/wt-<rama>`, y se
  commitea en cuanto compila. Un worktree sin commitear en un directorio temporal se pierde entero.

## Cómo se mantiene este archivo

`scripts/check_agents_md.sh` corre dentro de `make verify` y falla si una ruta citada en backticks
en cualquier AGENTS.md ya no existe. Cuando cambie una regla, se cambia aquí en el mismo PR que la
cambia en el código. Lo que solo le sirve a una herramienta va en su archivo propio: `CLAUDE.md`
para Claude Code.
