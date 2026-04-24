# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**SGHCP — Sistema de Gestión de Historias Clínicas Psicológicas**

Sistema de información clínico para psicología en Colombia. Maneja datos de salud mental — la categoría de mayor sensibilidad bajo la Ley 1581/2012. Toda decisión técnica tiene implicaciones legales directas.

**Marco legal vinculante:**
- Ley 1581/2012 — protección de datos personales (habeas data)
- Resolución 1995/1999 — historia clínica: retención mínima 15 años, integridad, confidencialidad
- Ley 23/1981 — secreto profesional médico
- Ley 1273/2009 — delitos informáticos (el proveedor cloud no exonera al responsable del dato)
- Decreto 1227/2015 — identidad de género (razón por la que `gender` es TEXT libre, no ENUM)

## Idioma del código (REGLA ESTRICTA)

Todo artefacto técnico se escribe en **inglés**:
- Código fuente (variables, funciones, tipos, constantes, structs, clases)
- SQL — nombres de tablas, columnas, índices, constraints, ENUMs y valores de seed
- Nombres de archivos y carpetas de código fuente
- Mensajes de commit y nombres de ramas
- Comentarios en el código (el `why`, no el `what`)
- Configuración (claves de JSONB, nombres de flags en `features`, códigos de permisos)

La documentación de arquitectura (`docs/`), los ADRs y las conversaciones con el usuario permanecen en **español**.

## Metodología de trabajo (REGLA ESTRICTA)

El usuario trabaja en fases iterativas. **Al completar una fase, detenerse y esperar confirmación explícita antes de continuar.** La confirmación es "Aprobado, siguiente paso" o equivalente.

Fases del proyecto:
1. **Fase 1: System Design y ADRs** ← COMPLETADA
2. **Fase 2: Setup y scaffolding** ← COMPLETADA
3. **Fase 3: Core Backend** — Auth, RBAC, CRUD de pacientes (Go) ← SIGUIENTE
4. **Fase 4: Integración del Motor IA** — Audio → Whisper → Claude API → Aprobación
5. **Fase 5: Frontend y Observabilidad** — React + Prometheus/Grafana

## Stack tecnológico (ADRs aprobados)

| Capa | Tecnología | ADR |
|---|---|---|
| Backend core | Go 1.21+ con `chi`, `sqlc`, `golang-jwt/jwt v5`, `golang-migrate` | ADR-001 |
| Cifrado | AES-256-GCM + env var `MASTER_KEY` (Bootstrap) → AWS KMS (Cloud) | ADR-002 |
| Base de datos | PostgreSQL 16, Docker en VPS (Bootstrap) → RDS Multi-AZ (Cloud) | ADR-002/003 |
| Infraestructura | VPS Hetzner CX21 · Docker Compose · Caddy (Bootstrap) | ADR-003 |
| Almacenamiento | Sistema de archivos local `/data/audio/` · Backblaze B2 para backups | ADR-003 |
| IA — transcripción | Whisper (local, open-source) — el audio nunca sale de la infraestructura | ADR-004 |
| IA — extracción | Claude API (`claude-sonnet-4-6`) sobre texto anonimizado | ADR-004 |
| Cola de trabajo IA | Redis Streams (dev y Bootstrap) | ADR-004 |
| Frontend | React + TypeScript (PWA con modo offline) · servido por Caddy (Bootstrap) | ADR-005 |
| Observabilidad | OpenTelemetry + logs Docker + Prometheus/Grafana (Bootstrap) | — |

## Arquitectura: Bounded Contexts

El sistema tiene 5 dominios que pueden separarse en microservicios sin reescribir lógica. Las FK que cruzan dominios están marcadas `[SOFT_FK]` en el schema.

```
BC-1: Organización & Auth   → organizations, users, roles, permissions, user_roles, supervision_rel
BC-2: Staff & Perfiles      → professional_profiles
BC-3: Pacientes             → patients, encryption_keys, patient_staff_rel
BC-4: Agenda                → appointments
BC-5: Clínico               → clinical_records, consents, ai_drafts
Transversal                 → audit_log, domain_events (outbox)
```

Ver diagrama completo en `docs/architecture/C4-architecture.md`.

## Seguridad — restricciones no negociables

**Cifrado:**
- Campos PII de pacientes son `BYTEA [AEA]`: `first_name_enc`, `paternal_last_name_enc`, `document_number_enc`, `phone_enc`, `email_enc`, campos SOAP de `clinical_records`, etc.
- Búsqueda sobre PII: solo por hash SHA-256 (`paternal_last_name_hash`, `doc_search_hash`). Nunca `LIKE` ni full-text sobre campos cifrados.
- El DEK por paciente vive cifrado en `encryption_keys.encrypted_dek`. En Bootstrap lo descifra `MASTER_KEY` (var de entorno). `key_source` indica qué clave maestra protege cada DEK.

**Auditoría:**
- `audit_log` es append-only. El rol de BD de la aplicación tiene `INSERT, SELECT` — sin `UPDATE` ni `DELETE`.
- Cada operación importante escribe en `domain_events` en la misma transacción (outbox pattern).

**IA:**
- El audio nunca sale de la infraestructura propia (Whisper local).
- El LLM (Claude API) recibe solo texto anonimizado — sin nombres, sin documentos.
- Los borradores de IA (`ai_drafts`) son inmutables. El profesional edita en un formulario separado y aprueba explícitamente.
- Un practicante (INTERN) nunca puede aprobar un registro clínico — solo co-firma el supervisor y aprueba el PROFESSIONAL.

**Permisos de BD:**
- `app_user`: SELECT/INSERT/UPDATE/DELETE en tablas transaccionales.
- `app_user`: INSERT/SELECT en `audit_log`.
- `app_user`: SELECT en `document_types`, `specialties`.
- `app_user`: SELECT/INSERT en `encryption_keys` (rotación la hace el servicio KMS).

## Modelo de datos — puntos clave

- Los nombres de pacientes tienen 4 campos separados: `first_name_enc`, `middle_name_enc`, `paternal_last_name_enc`, `maternal_last_name_enc`. Refleja el estándar de la cédula colombiana y permite ordenar por apellido e integrarse con RIPS/ADRES.
- `document_types` es tabla de referencia separada — no CHECK constraint — para añadir nuevos tipos (PPT, PEP) sin migración de schema.
- `patient_staff_rel` es M:N con `relation_type` ENUM (`PRIMARY_THERAPIST`, `INTERN_TRAINEE`, etc.). No hay `professional_id` en `patients`.
- `clinical_records` tiene `responsible_staff_id` (el terapeuta) y `created_by` (quien redactó — puede ser practicante). Si `requires_cosign = TRUE`, el supervisor debe co-firmar antes de que el registro pueda pasar a `APPROVED`.
- `organizations.features JSONB` controla qué módulos están activos por clínica. Añadir inventario = INSERT en `permissions` + UPDATE en `features`. Sin deploy.

Schema completo en `docs/data-models/schema.md`.

## Variables ciegas de seguridad (antes del go-live)

Ver `docs/security/blind-variables.md`. Los puntos críticos:
- DPIA (Data Protection Impact Assessment) requerido antes de producción.
- Plan de respuesta a incidentes con notificación a la SIC en 72h.
- Nunca usar datos reales de pacientes en entornos dev/staging — usar generador sintético con Faker.
- Backups cifrados (GPG) en Backblaze B2 con política de retención de 15 años (Bootstrap). En Cloud: S3 Glacier con Object Lock (WORM).

## Documentación de referencia

| Documento | Contenido |
|---|---|
| `docs/architecture/ADR-001-backend-language.md` | Go vs Java — justificación y librerías seleccionadas |
| `docs/architecture/ADR-002-database-encryption.md` | Estrategia TDE + AEA + KMS, campos cifrados |
| `docs/architecture/ADR-003-cloud-vs-local.md` | VPS Bootstrap ($6/mes), Caddy, pg_dump+B2, ruta de migración a AWS |
| `docs/architecture/ADR-004-ai-microservice.md` | Flujo Audio→Whisper→LLM→Aprobación, por qué Whisper local |
| `docs/architecture/C4-architecture.md` | Diagramas C4 por nivel, bounded contexts, módulos futuros |
| `docs/data-models/schema.md` | Schema completo con ENUMs, tablas de referencia, DER, RBAC |
| `docs/security/blind-variables.md` | 10 riesgos legales/operativos identificados con prioridad |
