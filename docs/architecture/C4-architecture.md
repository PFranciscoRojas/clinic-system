# Arquitectura C4 — SGHCP (Sistema de Gestión de Historias Clínicas Psicológicas)

> Representación en texto siguiendo la metodología C4 (Context, Containers, Components, Code).
> Nivel 4 (Code) se documenta directamente en el código fuente.

---

## Nivel 1: Diagrama de Contexto del Sistema

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        CONTEXTO DEL SISTEMA                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

  [Profesional/Psicóloga]     [Recepcionista]    [Paciente]         [Administrador]
   Rol: PROFESSIONAL/INTERN    Rol: RECEPTIONIST  Rol: PATIENT       Rol: CLINIC_ADMIN
   - Historias clínicas        - Agenda           - Ver citas        - Usuarios y config
   - Aprobar borradores IA     - Pacientes        - Firmar           - Auditoría
   - Subir audio de sesión     - Cobros y pagos     consentimientos  - Reportes
   - Evaluaciones / plan       - Consentimientos  - Documentos       - Tarifario
         │                           │                  │                  │
         └───────────────────────────┴──────────────────┴──────────────────┘
                                     │ HTTPS
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│              SGHCP — Sistema de Gestión de Historias Clínicas               │
│                         Psicológicas                                        │
│                                                                             │
│  Ciclo completo: agenda · historia clínica · IA copiloto · consentimientos  │
│  evaluaciones psicométricas · facturación · seguimiento longitudinal        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                  │
         │ AWS KMS API        │ Anthropic API       │ Email/SMS        │ DIAN API
         ▼                    ▼                    ▼                  ▼
  [AWS KMS]           [Claude API]          [Email provider]   [DIAN (factura
  Claves CMK          Extracción SOAP        Notificaciones      electrónica)]
                      texto anonimizado      y recordatorios     Sistema externo
```

---

## Nivel 2: Diagrama de Contenedores — Bootstrap (VPS + Docker Compose)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                   CONTENEDORES DEL SISTEMA — BOOTSTRAP VPS                   ║
║                   Hetzner CX21 · Ubuntu 22.04 · Docker Compose               ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usuarios ──── HTTPS ────▶ ┌──────────────────────────────────────────────────┐
(puerto 80/443)           │  Caddy v2 (reverse proxy)                        │
                          │  - TLS automático via Let's Encrypt               │
                          │  - /api/* → core-api:8080                        │
                          │  - /*     → archivos estáticos React SPA         │
                          │  - ai-service NO expuesto (red interna Docker)   │
                          └──────────────────────┬───────────────────────────┘
                                                 │ HTTP (red bridge Docker)
                                                 ▼
                          ┌──────────────────────────────────────────────────┐
                          │  core-api (Go / chi)                             │
                          │  Docker · puerto 8080 interno                    │
                          │  BC-1: Auth, RBAC, Org, Users                   │
                          │  BC-2: Staff profiles                            │
                          │  BC-3: Patients, AEA encryption                 │
                          │  BC-4: Scheduling                                │
                          │  BC-5: Clinical records, assessments,            │
                          │         treatment plans, AI drafts               │
                          │  BC-6: Billing, invoices, payments               │
                          │                                                  │
                          │  ┌────────────────────────────────────────────┐ │
                          │  │ outbox-publisher goroutine (interno)        │ │
                          │  │ - Encuesta domain_events WHERE pub=FALSE    │ │
                          │  │ - XADD a Redis Streams                      │ │
                          │  │ - Marca published = TRUE                    │ │
                          │  └────────────────────────────────────────────┘ │
                          └───────┬─────────────────────────────┬────────────┘
                                  │                             │
                    ┌─────────────┘                             └───────────┐
                    │ SQL (Unix socket / TLS)                               │ Redis protocol
                    ▼                                                       ▼
       ┌──────────────────────┐                              ┌─────────────────────┐
       │  PostgreSQL 16        │                              │  Redis 7            │
       │  Docker               │                              │  Docker             │
       │  puerto 5432 interno  │                              │  puerto 6379 interno│
       │  AEA en campos _enc   │                              │  - Cola de trabajo  │
       │                       │                              │    IA (Streams)     │
       │  Volúmenes del host:  │                              │  - domain-events    │
       │  /data/postgres/      │                              │    Stream (outbox)  │
       └──────────────────────┘                              │  - Rate limiting    │
                    ▲                                         │  - Token blacklist  │
                    │ SQL                                     └──────────┬──────────┘
                    │                                                    │ Consume
                    │ (core-api escribe audio_path_enc                   ▼
                    │  con ruta local del archivo)           ┌─────────────────────┐
                    │                                        │  ai-service          │
       ┌──────────────────────┐                              │  Python · FastAPI    │
       │  /data/audio/         │◄─── audio local             │  puerto 8000 interno │
       │  (volumen del host)   │     (no pasa por core-api)  │  Whisper (local CPU) │
       │  TTL 5 días (cron)   │                              │  NER + anonimización │
       └──────────────────────┘                              │  Claude API          │
                                                             └──────────┬──────────┘
       ┌──────────────────────┐                                         │
       │  /data/backups/       │◄── pg_dump diario                      │ escribe transcripción
       │  (volumen del host)   │    cifrado (GPG)                       │ y borrador en BD
       └──────────┬────────────┘                                        │ (via SQL directo)
                  │ sincronización                         ─────────────┘
                  ▼ diaria (rclone/b2)
       ┌──────────────────────┐
       │  Backblaze B2         │  ← único servicio externo de storage
       │  $0.006/GB/mes        │     backup cifrado, retención 15 años
       │  sin egress hacia CDN │
       └──────────────────────┘
```

### Red Docker (bridge network)

```
Expuesto al exterior (Caddy):     caddy:80, caddy:443
Interno — accesible desde core-api:  postgres:5432, redis:6379, ai-service:8000
Sin acceso exterior directo:      postgres, redis, ai-service
```

### Almacenamiento local

```
/data/postgres/   ← datos de PostgreSQL (volumen Docker bind mount)
/data/audio/      ← audios de sesión; cron borra archivos con +5 días de antigüedad
/data/backups/    ← pg_dump diario cifrado con GPG antes de subir a B2
/data/caddy/      ← certificados Let's Encrypt (persistencia entre reinicios)
```

---

## Nivel 3: Diagrama de Componentes — core-api

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        COMPONENTES: core-api (Go)                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

Petición HTTPS entrante
        │
        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Middleware Stack                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ TLS Termina- │  │ Rate Limiter │  │ Request Logger│  │ Panic Recov- │  │
│  │ ción (ALB)   │  │ (Redis)      │  │ (slog/OTel)   │  │ ery          │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  └──────────────┘  │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Auth Component                                                             │
│  - Validación JWT (golang-jwt/jwt v5)                                      │
│  - Refresh token con rotación                                               │
│  - MFA TOTP (google/otp)                                                   │
│  - Blacklist de tokens revocados (Redis)                                   │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ Token válido + claims
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  RBAC Component                                                             │
│  - Carga permisos del usuario desde BD (roles + role_permissions)           │
│  - Verifica `resource:action` por request                                   │
│  - Row-level: PROFESSIONAL solo ve pacientes de patient_staff_rel           │
│  - Supervisor ve cola de co-firma de sus supervisados                       │
└───────────────────┬──────────────────────────┬─────────────────────────────┘
                    │                          │
     ┌──────────────┼──────────────┐          └─────────────┐
     ▼              ▼              ▼                         ▼
┌──────────────┐ ┌────────────┐ ┌─────────────────────┐  ┌──────────────────┐
│ Clinical     │ │ Scheduling │ │ Clinical Tracking    │  │ Billing          │
│ Records      │ │ Component  │ │ Component            │  │ Component        │
│ - Patients   │ │ - Agenda   │ │ - assessment_scales  │  │ - service_rates  │
│ - SOAP forms │ │ - Calendar │ │ - patient_assess.    │  │ - invoices       │
│ - AI draft   │ │ - Remind.  │ │ - treatment_plans    │  │ - payments       │
│ - Co-sign    │ └────────────┘ │ - Evolution charts   │  │ - billing_prof.  │
│ - AEA crypto │               │   data (no PII out)  │  └──────────────────┘
└──────┬───────┘               └─────────────────────┘
       │
       ▼
┌──────────────┐  ┌────────────────────────────┐  ┌───────────────────────┐
│ Consent      │  │  AI Orchestration          │  │  Audit + Outbox       │
│ Component    │  │  Component                 │  │  Component            │
│ - Digital    │  │  - Validate recording      │  │  - audit_log write    │
│   sign (OTP) │  │    consent before upload   │  │    (append-only)      │
│ - Physical   │  │  - Presigned S3 URL        │  │  - domain_events      │
│   scan upload│  │  - Publish to AI queue     │  │    write (same TX)    │
│ - Integrity  │  │  - Poll draft status       │  │  - Both written in    │
│   hash check │  │  - Expose draft to UI      │  │    every component's  │
└──────────────┘  └────────────────────────────┘  │    transactions       │
                                                   └───────────────────────┘
```

---

## Módulos futuros — extensión sin romper el núcleo

```
organizations.features JSONB controla qué módulos están activos por organización:

{
  "ai_enabled": true,
  "module_inventory": false,   ← activar = INSERT permissions + UPDATE features
  "module_billing": false,
  "module_analytics": true
}

Cada módulo nuevo:
  1. Agrega sus tablas con organization_id
  2. Agrega sus permissions (code: 'inventory:read', module: 'inventory')
  3. Asigna permisos a roles vía role_permissions
  4. Publica sus domain_events hacia la capa analítica
  5. El frontend recibe el feature flag y muestra/oculta el módulo
```

## Decisiones de despliegue

| Componente | Entorno Dev (local) | Bootstrap (VPS) | Cloud (futuro) |
|---|---|---|---|
| core-api | Docker Compose local | Docker · Caddy proxy | AWS ECS Fargate |
| ai-service | Docker Compose local (CPU) | Docker · red interna | AWS ECS + GPU |
| PostgreSQL | Docker (imagen oficial) | Docker · `/data/postgres/` | AWS RDS Multi-AZ |
| Redis | Docker | Docker · puerto interno | AWS ElastiCache |
| Storage de audios | Directorio local | `/data/audio/` · TTL 5 días | AWS S3 con CMEK |
| Backups | pg_dump local | pg_dump + Backblaze B2 | AWS S3 Glacier (Object Lock) |
| Clave maestra | `MASTER_KEY` en `.env` | `MASTER_KEY` en `/etc/sghcp/.env` (600) | AWS KMS CMK |
| Frontend | Vite dev server | Caddy sirve `/dist/` estático | CloudFront + S3 |
| Secrets | `.env` local (git-ignored) | `/etc/sghcp/.env` (600, root) | AWS Secrets Manager |
| Observabilidad | Logs a stdout + Jaeger local | Logs Docker + Prometheus + Grafana | CloudWatch + X-Ray |
