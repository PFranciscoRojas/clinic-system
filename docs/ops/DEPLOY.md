# Deploy a producción

Cómo llega un cambio de `main` al VPS y qué trampas ya costaron un incidente. La fuente de verdad
son los workflows; este documento explica el porqué y lo que no se ve leyéndolos.

## Dónde corre

- VPS en Hetzner (Ashburn, EE. UU.), repo en `/root/clinic-system`, compose con `docker-compose.yml`
  más `docker-compose.prod.yml` (siempre los dos, ver `scripts/check_compose_files.sh`).
- Servicios: postgres, redis, core-api (blue/green), ai-service (perfil `ai`), caddy.
- Dominio: `app.chapni.com`. DNS en Cloudflare con el registro `app` en DNS-only (nube gris). Si se
  pone en proxy, el ACME de Caddy se rompe.
- `api.marcelachapues.com` es legado: sirve `/api` para webhooks viejos de MercadoPago y redirige
  todo lo demás con 308.

## Cuándo sale cada cosa

| Qué | Cuándo | Workflow |
|---|---|---|
| core-api y frontend | Todas las noches a las 22:00 de Bogotá (03:00 UTC), con lo que haya en `main` | `.github/workflows/deploy.yml` |
| ai-service | Al mergear a `main` un cambio en `services/ai-service/` o `docker-compose.yml` | `.github/workflows/build-ai-service.yml` |
| Arreglo urgente de core-api/frontend | En el momento: `gh workflow run deploy.yml -f reason="..."` | `deploy.yml` |
| Volver atrás | `rollback.yml`, escribiendo "volver" para confirmar | `.github/workflows/rollback.yml` |

Mergear a `main` solo construye y publica la imagen de core-api en GHCR
(`.github/workflows/build-core-api.yml`). La ventana nocturna existe desde el 2026-08-20 para que el
sistema no cambie debajo de una psicóloga en plena sesión.

## Qué hace el deploy nocturno, en orden

1. Busca la imagen del último commit que tocó las rutas de build de core-api. Si no existe todavía,
   para sin tocar nada. Las dos listas de rutas tienen que coincidir; las compara
   `scripts/check_deploy_paths.sh`.
2. Toma una copia de la base segundos antes de migrar (`scripts/predeploy_dump.sh`). Si no puede,
   para.
3. Ensaya las migraciones sobre una restauración de esa copia (`scripts/migration_rehearsal.sh`).
4. Corre `migrate up` sobre la base real y falla si `schema_migrations.dirty` quedó en true.
5. Blue/green: el color libre recibe la imagen, tiene que reportar healthy y solo entonces Caddy
   apunta ahí (`scripts/deploy_switch.sh`).
6. Frontend: compila en Actions y reemplaza el contenido de `services/frontend/dist` en sitio.
7. Smoke: login real contra `app.chapni.com` (`.github/workflows/smoke.yml`).

## Reglas que salen de lo anterior

- **Las migraciones son aditivas.** Corren antes de cambiar el contenedor, así que la versión vieja
  convive un momento con el esquema nuevo. Algo que borre una columna que la versión en marcha
  todavía lee se parte en dos deploys.
- **Si el deploy falla por `dirty`**, se resuelve a mano en el VPS con `migrate ... force <versión>`
  antes de volver a desplegar.
- **Bind mounts de archivo o directorio fijan el inodo.** El `Caddyfile` y `services/frontend/dist`
  están montados así. Tras un `git pull` que cambie el Caddyfile, `caddy reload` no basta: hay que
  `docker compose up -d --force-recreate caddy`. El directorio `dist` nunca se borra ni se mueve, se
  reemplaza su contenido con `rsync --delete`.
- **El usuario del smoke** es `admin@demo.clinica.co` en la org `demo-clinica`, con suscripción
  activa hasta 2099. Si se vuelve a sembrar, hay que correr `docker compose exec -T core-api ./rehash`:
  el hash del correo en el SQL es un marcador; el real es HMAC con `SEARCH_PEPPER`.

## Migraciones a mano (solo emergencias)

```bash
make migrate-up     # en el VPS, con el .env cargado; comparte la red de sghcp_postgres
```

Postgres no publica el 5432 al host, por eso el contenedor de `migrate` entra por la red de
`sghcp_postgres`.

## Relacionado

- `docs/ops/CI.md` — checks requeridos y reglas para tocar workflows.
- `docs/ops/MONITORING.md` — vigilancia y quién vigila al vigilante.
- `docs/ops/DR_RUNBOOK.md` — recuperación total.
- `docs/ops/PLAN_RELEASE.md` — por qué existen la ventana, el blue/green y el rollback.
