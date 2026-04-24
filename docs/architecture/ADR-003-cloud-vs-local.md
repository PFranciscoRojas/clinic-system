# ADR-003: Infraestructura — Servidor Único (Bootstrap) con Ruta de Migración a Cloud

- **Estado:** Revisado — 2026-04-23 (decisión inicial reemplazada)
- **Decisión inicial:** AWS São Paulo (cloud-native)
- **Decisión actual:** VPS único con Docker Compose — "Bootstrap"
- **Autores:** Equipo de Arquitectura

## Contexto

El marco legal colombiano no cambia respecto a la versión anterior de este ADR (ver tabla abajo). Lo que cambia es la **restricción económica**: el sistema debe arrancar con un costo de infraestructura de $5-10 USD/mes. Esto descarta AWS RDS, S3, ECS, ALB y KMS en la etapa inicial.

El objetivo es **arrancar rápido, mantener la arquitectura migrable**, sin decisiones que encarezcan el camino a cloud cuando el volumen lo justifique.

| Norma | Restricción relevante |
|---|---|
| Ley 1581/2012 Art. 26 | Transferencia internacional de datos requiere garantías adecuadas. |
| Resolución 1995/1999 Art. 15 | Historia clínica: retención mínima 15 años. |
| CONPES 3995/2020 | Soberanía y seguridad digital — promueve control sobre los datos. |
| Ley 1273/2009 | El proveedor de infraestructura no exonera al responsable del dato. |

**Ventaja del VPS para cumplimiento colombiano:** un VPS en Colombia o con proveedor que ofrezca datacenter en Latam (Hetzner Falkenstein/Helsinki, DigitalOcean NYC, Vultr Miami) coloca el dato bajo jurisdicción más alineada con CONPES 3995 que un AWS en São Paulo con DPA complejo. La Ley 1581 no exige nube; exige control, confidencialidad y disponibilidad.

## Decisión

**VPS único ($5-10 USD/mes) con Docker Compose y Caddy como proxy inverso.**

### Stack de infraestructura Bootstrap

```
Proveedor recomendado: Hetzner CX21 (2 vCPU, 4 GB RAM, 40 GB SSD NVMe — $6 USD/mes)
Alternativas: DigitalOcean Droplet Basic, Vultr Cloud Compute, Contabo VPS

OS: Ubuntu 22.04 LTS
Docker Engine + Docker Compose v2
Caddy v2 (reverse proxy + SSL automático vía Let's Encrypt)
```

### Arquitectura de red en el VPS

```
Internet
    │
    ▼ puerto 80/443
┌──────────────────────────────────────────────────────────────┐
│  Caddy (proxy inverso)                                        │
│  - SSL/TLS 1.3 automático con Let's Encrypt                  │
│  - clinica.ejemplo.co/api/* → core-api:8080                  │
│  - clinica.ejemplo.co/*     → archivos estáticos (React SPA) │
│  - ai-service NO expuesto al exterior (red interna Docker)   │
└─────────────────────┬────────────────────────────────────────┘
                      │ red interna docker (bridge network)
         ┌────────────┼──────────────┬────────────────────┐
         ▼            ▼              ▼                    ▼
    core-api      ai-service     PostgreSQL 16         Redis 7
    Go · 8080     Python · 8000  puerto 5432 interno   puerto 6379 interno
                                 volumen persistente    volumen persistente

Volúmenes del host (en /data/):
    /data/postgres/     ← datos de la BD
    /data/audio/        ← audios de sesión (borrado automático a 5 días)
    /data/backups/      ← pg_dump diario cifrado
    /data/caddy/        ← certificados SSL (persistencia de Let's Encrypt)
```

### Seguridad compensatoria (reemplaza controles de AWS)

| Control AWS original | Equivalente Bootstrap |
|---|---|
| VPC privada | Red bridge de Docker — los contenedores de BD y Redis no tienen puertos expuestos al host |
| AWS WAF | Caddy rate limiting + `fail2ban` en el host |
| CloudTrail | `audit_log` en PostgreSQL + logs de Docker (`journald`) |
| AWS Secrets Manager | Archivo `.env` en `/etc/sghcp/.env` con permisos `600`, propiedad de `root` |
| KMS CMK | Variable de entorno `MASTER_KEY` (AES-256, 32 bytes, generada con `openssl rand -hex 32`) |
| S3 con Object Lock | `pg_dump` diario cifrado (GPG) + sincronización a Backblaze B2 ($0.006/GB/mes) |
| RDS Multi-AZ | Snapshot diario del volumen del VPS (función del proveedor) |
| CloudWatch | Logs de Docker + Prometheus + Grafana (contenedores adicionales) |

### Backup y retención de 15 años

```bash
# Tarea cron diaria (crontab del host):
# 1. pg_dump cifrado con GPG
# 2. Subida a Backblaze B2 (< $1/mes para < 100 GB)
# 3. Política de retención: 15 años en B2 (bucket lifecycle rule)

0 2 * * * /opt/sghcp/scripts/backup.sh
```

El script `backup.sh` se crea en Fase 2. Backblaze B2 no es cloud médico costoso — es almacenamiento de objetos a $0.006/GB/mes, sin egress fees hacia Cloudflare.

### Retención de audios (5 días)

Los audios de sesión son los archivos más grandes y los más sensibles. Se borran automáticamente a los 5 días porque:
1. El ai-service ya los procesó (transcripción + borrador generados).
2. La transcripción cifrada queda en `ai_drafts.transcription_enc`.
3. Mantener el audio más tiempo aumenta el riesgo legal y de almacenamiento.

```bash
# Cron diario — borrado de audios con más de 5 días:
0 3 * * * find /data/audio/ -type f -mtime +5 -delete
```

## Análisis de trade-offs

### Bootstrap VPS vs Cloud

| Criterio | VPS Bootstrap | Cloud (futuro) |
|---|---|---|
| Costo mensual | $6-10 USD | $80-300 USD |
| Tiempo de setup | < 2 horas (Fase 2) | 1-2 semanas |
| Alta disponibilidad | Un solo servidor — si cae, cae todo | Multi-AZ, failover automático |
| Escalabilidad | Vertical (upgrade del VPS) | Horizontal + auto-scaling |
| Backups | Manual/script + B2 | Automático (RDS snapshots) |
| Certificados SSL | Automático (Let's Encrypt + Caddy) | ALB + ACM |
| Gestión de secretos | `.env` en `/etc/sghcp/` | AWS Secrets Manager |
| Gestión de claves | Env var `MASTER_KEY` | AWS KMS (CMK) |
| Compliance ready | Aceptable para escala inicial | Enterprise-grade |

### ¿Cuándo migrar a cloud?

Indicadores que justifican la migración:

- Más de 3 profesionales usando el sistema simultáneamente.
- Más de 2.000 pacientes activos.
- El downtime del VPS empieza a afectar operación clínica.
- Se requiere certificación ISO 27001 o auditoría formal.
- Un segundo consultorio / clínica se agrega al sistema.

La migración es limpia porque la arquitectura fue diseñada para ello (ver Ruta de Migración abajo).

## Ruta de migración Bootstrap → Cloud

La arquitectura Bootstrap no crea deuda técnica — cada componente Docker tiene su equivalente cloud directo:

```
Docker Compose service    →   AWS / Cloud equivalente
─────────────────────────────────────────────────────────────────
postgres (volumen local)  →   AWS RDS PostgreSQL 16 Multi-AZ
redis (volumen local)     →   AWS ElastiCache Redis
core-api (contenedor)     →   AWS ECS Fargate
ai-service (contenedor)   →   AWS ECS + GPU
caddy (reverse proxy)     →   AWS ALB + ACM
/data/audio/ (filesystem) →   AWS S3 con CMEK
/data/backups/ + B2       →   AWS S3 Glacier (Object Lock 15 años)
MASTER_KEY (env var)      →   AWS KMS CMK
.env (archivo)            →   AWS Secrets Manager

Pasos de migración en orden:
1. Provisionar RDS, ElastiCache, S3 con Terraform
2. pg_dump desde VPS → restore en RDS
3. Rotar claves: descifrar DEKs con MASTER_KEY, re-cifrar con KMS CMK
4. Subir /data/audio/ → S3 con aws s3 sync
5. Buildear imágenes → ECR → desplegar en ECS
6. DNS cutover (< 5 min de downtime)
7. Apagar VPS
```

## Plan de mitigación de riesgos (Bootstrap)

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| VPS cae (hardware/red) | Media | Snapshot diario del proveedor; restore < 30 min; alertas por UptimeRobot |
| Disco lleno por audios | Media | Monitoreo de espacio (`df -h` en cron); borrado a 5 días; alertas al 80% |
| `MASTER_KEY` comprometida | Baja | Permisos 600 en `.env`; solo root lee el archivo; rotación semestral |
| Certificado SSL vence | Muy baja | Caddy lo renueva automáticamente 30 días antes |
| pg_dump falla silencioso | Baja | Script valida el backup y envía notificación por email si falla |
| Ataque de fuerza bruta | Media | `fail2ban` + rate limiting en Caddy + MFA obligatorio en la app |
