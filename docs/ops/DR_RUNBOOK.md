# Runbook de Disaster Recovery — Chapni

> Procedimiento **probado** (último simulacro: 2026-08-20, restauración real desde
> B2 en una máquina distinta al VPS, con la llave rotada en julio). Responde: *"¿y si se cae/pierde tu servidor?"*

## Qué se respalda y dónde

| Artefacto | Cadencia | Destino | Retención |
|---|---|---|---|
| `pg_dump` completo, gzip + GPG (nunca toca disco en claro) | Diaria 02:00 UTC (cron en el VPS, `scripts/backup.sh`) | `/root/backups/` (7 días) + `b2:clinic-system-backups/daily/` | B2: 15 años (lifecycle) |
| Snapshot del `.env` (MASTER_KEY, SEARCH_PEPPER, JWT_SECRET…), GPG | Diaria, mismo cron | `/root/backups/` + `b2:clinic-system-backups/env/` | Igual que dumps |

El VPS solo tiene la **llave pública** GPG: puede cifrar sus backups pero jamás
descifrarlos. Un atacante con acceso total al VPS no puede leer los backups.

## Prerrequisitos para una recuperación total (VPS perdido)

| Artefacto | Dónde vive | Sin él |
|---|---|---|
| Llave GPG **privada** `backups@chapni.com` (rsa4096, `413B0C877EB5D795`, activa desde 2026-07-13) | Keyring de la máquina del operador + nota segura en el gestor de contraseñas del operador | Backups ilegibles. Pérdida = pérdida total |
| Llave GPG **privada** anterior `backups@marcelachapues.com` (`E4FD1A7A`) — solo para dumps ≤ 2026-07-13 | Ídem (NO borrarla: los backups históricos en B2 siguen cifrados con ella) | Backups históricos ilegibles |
| Credenciales B2 (rclone) | VPS (`~/.config/rclone`) + consola web de Backblaze (login del operador) | Sin acceso al offsite; quedan las copias locales si el disco sobrevive |
| `.env` (MASTER_KEY, SEARCH_PEPPER…) | VPS + snapshot cifrado diario en B2 (`env/`) | PII indescifrable aunque restaures la BD |
| Repo `clinic-system` + imágenes | GitHub + ghcr.io | Reconstruible con `docker compose` |
| DNS | Cloudflare (chapni.com) | Apuntar `app` al nuevo host, modo DNS-only |

## Procedimiento probado (tiempos medidos, BD de ~490 KB cifrada)

En la máquina del operador (o el VPS nuevo):

```bash
# 1. Traer el último dump y el snapshot de secretos desde B2         [4 s]
rclone copy b2:clinic-system-backups/daily/sghcp-<FECHA>.sql.gz.gpg .
rclone copy b2:clinic-system-backups/env/sghcp-env-<FECHA>.gpg .

# 2. Postgres desechable + descifrar y restaurar en un solo pipe     [5 s]
docker run -d --name restore -e POSTGRES_PASSWORD=x -e POSTGRES_DB=sghcp postgres:16-alpine
gpg -d sghcp-<FECHA>.sql.gz.gpg | gunzip | \
  docker exec -i restore psql -q -U postgres -d sghcp -v ON_ERROR_STOP=0

# 3. Verificar                                                       [2 s]
docker exec restore psql -U postgres -d sghcp -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"  # 45
docker exec restore psql -U postgres -d sghcp -tAc \
  "SELECT count(*) FROM patients"   # comparar contra lo esperado
```

**Verificación de PII (la prueba real de que el backup sirve):** descifrar un
campo cifrado con la MASTER_KEY del snapshot del `.env` — formato AES-256-GCM
`nonce(12)||ciphertext||tag(16)`, DEK envuelta por MASTER_KEY (`encryption_keys`).
Script de referencia: `services/ai-service/src/ai_service/crypto.py` (`open_`).
En el simulacro 2026-07-13: `first_name` de un paciente real descifrado OK.

**RTO medido de la capa de datos: ~15 segundos.** El RTO total lo domina
reconstruir la infraestructura (~30–60 min): VPS nuevo + docker + `git clone` +
restaurar `.env` desde el snapshot + `docker compose up -d` + restore hacia el
volumen real de postgres + DNS.

## Restauración a producción nueva (orden)

1. VPS nuevo → docker + docker compose + `git clone` del repo.
2. Descifrar `sghcp-env-<FECHA>.gpg` → `/root/clinic-system/.env`.
3. `docker compose up -d postgres redis` → restaurar el dump dentro de
   `sghcp_postgres` (mismo pipe de arriba contra ese contenedor).
4. `docker login ghcr.io` + `docker compose --profile ai up -d` (todas las imágenes están en ghcr).
5. Cloudflare: apuntar `app.chapni.com` (DNS-only) a la IP nueva → Caddy emite cert solo.
6. Smoke: workflow `Smoke test (prod)` en GitHub Actions (`workflow_dispatch`) o `python scripts/smoke_test.py`.
7. Re-instalar el cron de backup (`crontab -e`, línea en este runbook § Qué se respalda)
   y la llave pública GPG (`gpg --import` de la pública; la privada NUNCA al VPS).

## Historial de simulacros

| Fecha | Resultado | Notas |
|---|---|---|
| 2026-07-13 | ✅ | Desde B2 en máquina del operador. 45 tablas, 0 errores, PII descifrada con MASTER_KEY. Datos: 5 orgs / 9 users / 7 patients / 19 records. Hallazgo: el `.env` vivía solo en el VPS → se añadió el snapshot cifrado diario a B2 en esta misma fecha. |
| 2026-07-13 (2) | ✅ rotación de llave | La privada anterior quedó expuesta fuera del keyring → rotada a `backups@chapni.com` (`413B0C877EB5D795`): pública importada en el VPS, `GPG_RECIPIENT` actualizado, backup + snapshot del día re-cifrados y round-trip de descifrado verificado con la nueva. La anterior se conserva solo para dumps históricos. |

| 2026-08-20 | ✅ | Desde B2 (`sghcp-2026-08-20`), llave privada solo en la máquina del operador. **50 tablas, 0 errores, restauración en 7 s.** Contenido idéntico a producción: 5 orgs / 13 pacientes / 17 historias / 28 citas / migración 80. La cadena de sobre completa verificada extremo a extremo: `MASTER_KEY` (32 B) descifra la DEK del paciente (32 B), la DEK descifra el campo, y el apellido resultante se re-hashea con `SEARCH_PEPPER` (32 B) y **coincide con `paternal_last_name_hash` en los 3 pacientes probados** — prueba criptográfica de que el texto recuperado es el correcto, sin imprimir el nombre de nadie. Motivo de la corrida: primera restauración desde la rotación de llave de julio, antes de entregar el sistema a psicólogas externas. Material descifrado destruido con `shred` y contenedor eliminado al terminar. |

> Repetir el simulacro tras cambios grandes de esquema o al menos cada 6 meses;
> registrar aquí cada corrida.

### Cómo verificar la PII sin exponer a nadie

La prueba de que un respaldo sirve es descifrar un campo real, y eso choca con no
andar imprimiendo el nombre de una paciente en una terminal. La salida es
re-hashear: se descifra el apellido, se recalcula
`hex(HMAC-SHA256(SEARCH_PEPPER, lower(trim(apellido))))` y se compara contra el
`paternal_last_name_hash` guardado. Si coincide, el descifrado fue correcto —
adivinar un HMAC-SHA256 no es una alternativa — y el nombre nunca sale a
pantalla. `MASTER_KEY` y `SEARCH_PEPPER` son hex de 64 caracteres, 32 bytes cada
uno; el formato del sobre es `nonce(12) || ciphertext || tag(16)`.
