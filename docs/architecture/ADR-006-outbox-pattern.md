# ADR-006: Outbox Pattern para Separación Operacional / Analítica

- **Estado:** Aceptado
- **Fecha:** 2026-04-23
- **Autores:** Equipo de Arquitectura

## Contexto

El sistema tiene dos audiencias de datos con necesidades incompatibles:

1. **Capa operacional (OLTP):** necesita transacciones ACID, datos cifrados, baja latencia, row-level security.
2. **Capa analítica (OLAP):** necesita datos agregados, histórico, sin PII, sin afectar el rendimiento de producción.

El problema central es garantizar que **ningún evento de negocio se pierda** en tránsito hacia la capa analítica, sin acoplar la lógica de negocio al sistema de mensajería. Si el servicio de mensajes falla en el momento en que el profesional aprueba un registro clínico, ¿se pierde ese evento de analytics?

Adicionalmente, futuros módulos (notificaciones, billing automático, integraciones con EPS) necesitan reaccionar a eventos del núcleo clínico sin que el `core-api` tenga dependencias directas hacia ellos.

## Decisión

**Outbox pattern** implementado mediante la tabla `domain_events` en PostgreSQL.

```
core-api handler
       │
       ├── BEGIN TRANSACTION
       │
       ├── INSERT INTO clinical_records (...)    ← operación de negocio
       │
       ├── INSERT INTO domain_events (           ← evento en la misma TX
       │       aggregate_type = 'ClinicalRecord',
       │       event_type     = 'RecordApproved',
       │       payload        = '{"record_type":"EVOLUTION","had_ai_assist":true}'
       │   )
       │
       └── COMMIT ← ambas filas se confirman atómicamente o ninguna

outbox-publisher (goroutine dentro de core-api — Bootstrap)
       │
       ├── SELECT * FROM domain_events
       │   WHERE published = FALSE
       │   ORDER BY occurred_at
       │   LIMIT 100
       │   FOR UPDATE SKIP LOCKED     ← seguro para múltiples instancias
       │
       ├── Publica batch a Redis Streams (XADD domain-events)
       │
       └── UPDATE domain_events SET published = TRUE, published_at = NOW()
           WHERE id IN (...)
```

## Garantías del patrón

| Garantía | Mecanismo |
|---|---|
| **Atomicidad:** el evento existe si y solo si el dato existe | Misma transacción PostgreSQL |
| **At-least-once delivery:** el evento llega aunque el worker falle | Re-intentos sobre `published = FALSE` |
| **Idempotencia en el consumidor:** procesar el mismo evento dos veces es seguro | El `domain_events.id` (UUID) es la clave de deduplicación en el consumidor |
| **Sin PII en analytics:** solo IDs y métricas en el payload | Revisión de código obligatoria en PRs que añadan campos al payload |
| **Sin acoplamiento:** `core-api` no conoce quién consume los eventos | Redis Streams como bus; los consumidores leen su propio consumer group |

## Alternativas descartadas

### Change Data Capture (Debezium + Kafka)

CDC captura cambios a nivel de WAL de PostgreSQL. Ventajas: captura automática sin código extra. Desventajas críticas para este sistema:
- Debezium puede capturar datos cifrados (`BYTEA`) — riesgo de que los campos `_enc` lleguen al data warehouse si hay un error de configuración.
- Requiere Kafka (MSK en AWS) — costo y complejidad operacional significativamente mayores.
- Con el outbox pattern, el `payload` es explícitamente construido por el desarrollador — imposible incluir PII accidentalmente si hay revisión de código.

### Publicación directa al bus de mensajes desde el handler

```go
// Anti-pattern — NO hacer esto:
err = db.ExecContext(ctx, "INSERT INTO clinical_records ...")
err = redisClient.XAdd(ctx, &redis.XAddArgs{Stream: "domain-events", ...})  // puede fallar
```

Si Redis falla, el dato está en BD pero el evento se perdió. No hay manera de recuperarlo sin lógica de compensación compleja.

### Polling desde la capa analítica directamente sobre PostgreSQL

Pone carga de lectura sobre la BD de producción. Requiere que la capa analítica conozca el schema operacional. Viola la separación de contextos.

## Estructura del payload

**Reglas estrictas para el `payload` JSONB:**

```
✓ PERMITIDO:           ✗ PROHIBIDO:
  UUIDs de recursos      Nombres de pacientes
  Fechas y duraciones    Números de documento
  Tipos (ENUMs)          Emails o teléfonos
  Scores numéricos       Cualquier campo _enc
  Rangos de edad         Rutas de S3
  Métricas booleanas     IPs de usuarios
```

Ejemplos válidos por evento:

```json
// RecordApproved
{"record_type":"EVOLUTION","had_ai_assist":true,"cosigned":false,"session_date":"2026-04-23"}

// AssessmentApplied
{"scale_code":"PHQ9","total_score":14,"severity":"moderate","session_number":5}

// InvoiceIssued
{"currency":"COP","total_due":120000,"insurance_covered":0,"modality":"IN_PERSON"}

// ConsentSigned
{"consent_type":"RECORDING","signing_method":"PHYSICAL_SCAN"}

// AppointmentCancelled
{"modality":"VIRTUAL","cancelled_by_role":"PATIENT","notice_hours":2}
```

## Consumidores actuales y futuros

**Bootstrap (Redis Streams):**
```
domain_events (outbox)
        │
        ▼ outbox-publisher goroutine (dentro de core-api)
        │
        ▼ Redis Streams — stream "domain-events"
        ├── analytics-consumer  → PostgreSQL local (métricas agregadas, sin PII) [Bootstrap]
        ├── notification-worker → Email/SMS (recordatorios de cita) [futuro]
        ├── billing-worker      → Auto-generar factura al completar cita [futuro]
        └── eps-integration     → Reportes RIPS para EPS [futuro]
```

**Cloud (ruta de migración):**
```
Redis Streams → AWS SQS → consumidores independientes en ECS
```

Cada consumer group de Redis es independiente — si un consumidor falla, los demás siguen procesando. Redis Streams retiene mensajes hasta que todos los consumer groups los confirman (ACK).

## Consecuencias

- **Positivas:** Garantía de entrega sin acoplar servicios; PII nunca llega a analytics por construcción; bajo costo operacional (goroutine en el mismo proceso, Redis ya en el stack).
- **Negativas:** At-least-once (no exactly-once) — los consumidores deben ser idempotentes. Redis Streams no tiene la retención de 14 días de SQS — si Redis se pierde sin réplica, los eventos no publicados se pierden.
- **Mitigación:** Los consumidores usan `domain_events.id` como clave de deduplicación. El outbox en BD es la fuente de verdad: si Redis se cae, el publisher re-lee `published = FALSE` al reiniciar y re-publica. No hay pérdida de eventos.
