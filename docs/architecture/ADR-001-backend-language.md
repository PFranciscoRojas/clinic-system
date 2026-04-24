# ADR-001: Selección de Lenguaje para el Backend Core

- **Estado:** Aceptado
- **Fecha:** 2026-04-23
- **Autores:** Equipo de Arquitectura

## Contexto

El SGHCP maneja datos de salud mental extremadamente sensibles sujetos a la Ley 1581/2012 y la Resolución 1995/1999. El backend core gestiona autenticación, RBAC, CRUD de historias clínicas y el bus de eventos hacia el microservicio de IA. Necesitamos un lenguaje que garantice rendimiento predecible, concurrencia segura, y un ecosistema maduro para criptografía y auditoría.

## Decisión

**Go (golang)** como lenguaje para el backend core.

## Alternativas evaluadas

| Criterio | Go | Java (Spring Boot) |
|---|---|---|
| Tiempo de arranque | ~5ms | ~3-8s (JVM warm-up) |
| Memoria base | ~15 MB | ~250-500 MB |
| Concurrencia | Goroutines nativas | Threads + virtual threads (Java 21) |
| Binario de despliegue | Único binario estático | JAR + JVM instalada |
| Ecosistema crypto | `crypto/tls`, `golang.org/x/crypto` — maduro | Bouncy Castle — maduro pero más complejo |
| Auditoría / middleware | Sencillo de instrumentar | Sencillo con AOP |
| Curva de aprendizaje | Media | Baja (más desarrolladores disponibles) |
| Ecosistema gRPC | Excelente (google/grpc-go) | Excelente |
| Licencia | BSD (open) | Apache 2.0 (open) |

## Justificación

1. **Footprint pequeño en producción**: Despliegue en contenedor mínimo (~15 MB RAM vs ~500 MB Java) reduce costos en cloud y simplifica el hardening del contenedor.
2. **Concurrencia segura por diseño**: El modelo de canales y goroutines elimina clases enteras de race conditions en código de auditoría y logging concurrente.
3. **Binario estático**: Facilita imágenes Docker `FROM scratch` o `FROM distroless`, reduciendo la superficie de ataque (sin shell, sin librerías innecesarias).
4. **Compilación tipada + `errcheck`**: Go obliga a manejar errores explícitamente, crítico para no silenciar fallos de cifrado o acceso a BD.
5. **`net/http` estándar**: Evita dependencias de frameworks web pesados; el stdlib de Go es production-ready.

## Consecuencias

- **Positivas:** Imágenes Docker mínimas, rendimiento predecible, fácil auditoría del código por su simplicidad.
- **Negativas:** Pool de talento más pequeño que Java; el equipo debe familiarizarse con el modelo de errores de Go.
- **Mitigación:** Usar `golangci-lint` + `staticcheck` desde el día 1 para mantener calidad; documentar patrones de error en la wiki del repo.

## Librerías core seleccionadas

| Propósito | Librería |
|---|---|
| Router HTTP | `chi` (v5) — estándar REST |
| ORM / Query builder | `sqlc` (generación de código desde SQL) |
| JWT | `golang-jwt/jwt` (v5) |
| Migraciones BD | `golang-migrate/migrate` |
| Cifrado a nivel aplicación | `golang.org/x/crypto` (AES-256-GCM) |
| Logging estructurado | `log/slog` (stdlib Go 1.21+) |
| Trazabilidad | `go.opentelemetry.io/otel` |
| Validación | `go-playground/validator` |
