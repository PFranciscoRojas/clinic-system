# Documentación de Arquitectura — SGHCP

## Architecture Decision Records (ADRs)

| ADR | Título | Estado | Decisión |
|---|---|---|---|
| [ADR-001](ADR-001-backend-language.md) | Lenguaje del Backend Core | Aceptado | **Go** (vs Java) |
| [ADR-002](ADR-002-database-encryption.md) | Estrategia de Cifrado en PostgreSQL | Aceptado | **TDE + AEA (AES-256-GCM) + KMS** |
| [ADR-003](ADR-003-cloud-vs-local.md) | Cloud vs Local para datos médicos | Revisado | **VPS Bootstrap** (Hetzner CX21 + Docker Compose) con ruta de migración a AWS |
| [ADR-004](ADR-004-ai-microservice.md) | Microservicio de IA (Copiloto Clínico) | Aceptado | **Python + FastAPI + Whisper local + Claude API** |
| [ADR-005](ADR-005-frontend-framework.md) | Framework del Frontend | Aceptado | **React 18 + TypeScript + Vite** (SPA) |
| [ADR-006](ADR-006-outbox-pattern.md) | Separación Operacional / Analítica | Aceptado | **Outbox pattern** vía tabla `domain_events` |

## Arquitectura del Sistema

- [C4-architecture.md](C4-architecture.md) — Diagramas C4 (Contexto, Contenedores, Componentes)

## Documentos relacionados

- [../data-models/schema.md](../data-models/schema.md) — Esquema de base de datos con campos cifrados marcados
- [../security/blind-variables.md](../security/blind-variables.md) — Variables ciegas y riesgos identificados
