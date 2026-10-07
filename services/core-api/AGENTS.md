# core-api (Go)

API HTTP (chi), migraciones, workers y crons de Chapni. Las reglas generales están en el
`AGENTS.md` de la raíz; aquí va lo propio del backend. Versión de Go y dependencias: `go.mod`.

## Cómo está organizado

- `cmd/api/` es el binario. Las rutas se montan en `cmd/api/routes.go`; el cableado de
  dependencias en `cmd/api/app.go`. Los tests de aceptación de punta a punta también viven ahí.
- `cmd/rehash/` recalcula los hashes de búsqueda cuando cambia `SEARCH_PEPPER`.
- `internal/<paquete>/` un paquete por área. Hay dos formas y las dos son válidas: con subcarpetas
  handler, service, repository y dto (por ejemplo `internal/patients/`) o plano, con los
  archivos sueltos (por ejemplo `internal/invoicing/`). Un paquete nuevo copia la forma del vecino
  más parecido.
- `internal/shared/` lo transversal: middleware de auth y `TenantScope`, contexto de conexión
  (dbctx), cifrado, hash de búsqueda, outbox, Redis Streams, configuración y auditoría.
- `migrations/` numeradas `000NNN_<nombre>.up.sql` con su par down.
- `features/` escenarios Gherkin que describen los flujos de aceptación.

| Área | Paquete |
|---|---|
| Login, signup, tokens | `internal/auth/` |
| Organizaciones y suscripción (trial, MercadoPago) | `internal/orgs/`, `internal/trial/`, `internal/billing/` |
| Pacientes | `internal/patients/` |
| Agenda, disponibilidad, recordatorios | `internal/appointments/`, `internal/availability/`, `internal/reminders/` |
| Reserva pública y agenda de leads | `internal/booking/`, `internal/leadbooking/` |
| Historia clínica | `internal/clinicalrecords/`, `internal/recordtemplates/`, `internal/diagnoses/`, `internal/treatmentplans/`, `internal/consents/` |
| Borradores y sugerencias IA | `internal/aidrafts/`, `internal/aisuggestions/` |
| Cobros y facturas de la consulta | `internal/invoicing/` |
| Correo, notificaciones, WhatsApp, Google Calendar | `internal/notify/`, `internal/notifications/`, `internal/whatsapp/`, `internal/gcal/` |
| Textos legales, auditoría, superadmin | `internal/legal/`, `internal/auditlog/`, `internal/admin/` |

`internal/billing/` es la suscripción de la organización a Chapni. Los cobros a pacientes son
`internal/invoicing/`. No confundirlos.

## Multi-tenant (regla 2)

- `TenantScope` (`internal/shared/middleware/tenant.go`) va después de `RequireAuth`: fija una
  conexión del pool para todo el request y le pone `app.current_org`. Las políticas RLS filtran por
  ese valor.
- Los repositorios nunca usan el pool directo. Resuelven su conexión con
  `dbctx.From(ctx, r.db)`, así toman la del request cuando existe.
- Trabajo fuera de un request (workers, crons, webhooks) que toca datos de un tenant usa
  `dbctx.WithOrgScope`.
- La app corre como `sghcp_app` (NOSUPERUSER, no dueña) y las tablas tienen FORCE ROW LEVEL
  SECURITY. Una tabla nueva con datos de tenant lleva su política RLS en la misma migración.

## Cifrado y búsqueda (regla 4)

- Cada paciente tiene una DEK. `crypto.KeyManager` la genera y la desenvuelve con `MASTER_KEY`;
  `crypto.Seal`/`crypto.Open` cifran con AES-256-GCM. Todo en `internal/shared/crypto/`.
- La búsqueda usa `hash.Token`, `hash.SearchTokenHashes` y `hash.SearchQueryHashes`
  (`internal/shared/hash/hash.go`): HMAC-SHA256 con `SEARCH_PEPPER`. Una columna cifrada nunca va en
  un `WHERE` con `LIKE`.
- Ningún dato de paciente va a un log. `internal/invariants/` lo revisa leyendo el código fuente.

## Migraciones

- Siempre con su archivo down, y aditivas: el deploy migra antes de cambiar el contenedor (ver
  `docs/ops/DEPLOY.md` en la raíz del repo).
- Nombres en inglés. Dinero en `NUMERIC`, PII en `BYTEA`. Los tests de
  `internal/integration/schema_invariants_test.go` lo comprueban contra el esquema real.

## Tests

- `go test -race -count=1 ./...` desde esta carpeta. Necesita Docker: `internal/testinfra/` levanta
  un Postgres 16 desechable con todas las migraciones, con la misma separación de roles que
  producción para que RLS aplique de verdad.
- Pisos de cobertura por paquete en `coverage-floors.txt` (trinquete, ver la raíz).
- `internal/invariants/` son tests que leen el código: hosts de salida permitidos, PII en logs,
  dependencias declaradas. Si uno falla, el arreglo es el código, no la lista.
