# Plan: el guantelete — llegar a "no leo el código de mis agentes"

**Fecha:** 2026-07-27
**Origen:** la tesis de Robert C. Martin — el agente escribe rápido, tú inviertes ese tiempo ahorrado en restricciones ejecutables (unit, gherkin, propiedades, mutación, cobertura, QA) y confías en el resultado sin leerlo.

---

## 1. Veredicto sobre la tesis

La tesis es correcta **con una condición que se suele omitir**: tú dejas de leer el
código, pero pasas a leer y a diseñar las restricciones. El trabajo no desaparece,
cambia de nivel. Uncle Bob puede permitírselo porque lleva 55 años sabiendo qué
restricción atrapa qué clase de defecto. La trampa para quien empieza es creer que
el guantelete es una lista de herramientas que se instalan; en realidad es una
**especificación ejecutable** que alguien tiene que escribir con criterio.

Tres cosas que la tesis, tal como está formulada, no cubre y este proyecto sí
necesita:

1. **Si el agente escribe el código y también los tests, los tests no son
   independientes.** Un agente que no logra pasar un test tiende a ablandar el
   test. Lo único que rompe ese círculo es medir la calidad de los tests con algo
   que el agente no controla: **mutación** y **propiedades/fuzzing** (donde el
   input lo genera la máquina, no el agente).
2. **Los tests no ven la postura de seguridad ni el coste.** Ninguna prueba
   unitaria te avisa de que el agente añadió una dependencia npm nueva, mandó PII
   a un log, o metió una llamada de red a un tercero. Eso se cubre con escaneos,
   no con tests.
3. **Un guantelete que no bloquea el merge no es un guantelete.** Es una
   sugerencia. Hoy, en este repo, es exactamente eso.

## 2. Dónde estamos hoy (medido, 2026-07-27)

| Métrica | Valor |
|---|---|
| Cobertura unitaria `core-api` (`go test -short`) | **6,1 %** |
| Ficheros `_test.go` / ficheros `.go` | 21 / 227 |
| Tests Go que se ejecutan en un Pull Request | **0** |
| `required_status_checks` en la rama `main` | **ninguno** |
| `required_approving_review_count` | 0 |
| Tests frontend (vitest) | 5 ficheros — sí corren en PR |
| Tests ai-service (pytest) | 4 ficheros — solo en push a `main` |

**Lo bueno, y no es poco:** `internal/integration/` ya levanta Postgres 16 real con
testcontainers, aplica las ~50 migraciones como `sghcp_admin` y conecta como
`sghcp_app` NOSUPERUSER, así que `FORCE ROW LEVEL SECURITY` se comporta igual que
en el VPS. Esa es la pieza más cara de construir de todo un guantelete y ya está
hecha. `rls_test.go` prueba el aislamiento multi-tenant sobre las tablas críticas.
Todo lo que sigue se apoya en ese arnés.

**Lo grave:**

- `build-core-api.yml` dispara en `push: branches: [main]`. Los tests corren
  **después** del merge. Si fallan, el código ya está en la rama que despliega.
- La protección de `main` no exige ningún check. El guantelete existe pero no
  tiene puerta.
- `internal/shared/crypto/` (AES-256-GCM + DEK por paciente) tiene **cero tests**.
  Es el código de más alto riesgo del sistema: un fallo ahí es pérdida silenciosa
  de historias clínicas, no un bug visible.
- `internal/auth/service` (1.059 LOC), `internal/patients/service`,
  `internal/clinicalrecords/service`, `internal/shared/middleware`,
  `internal/shared/clinicalperm`: cero tests.

## 3. El plan, en orden de dependencia

El orden importa. Cada fase es inútil sin la anterior.

---

### Fase 0 — Poner la puerta

Sin esto, todo lo demás es decorativo. Es la fase de mayor retorno del plan entero.
Se ejecuta en dos pasos con verificación entre medio, porque el job que despliega
a producción vive dentro del mismo workflow que hay que tocar.

#### Paso A — que los tests corran en los PRs ✅ HECHO (PR #236, 2026-07-27)

- [x] `pull_request` como trigger en `build-core-api.yml` y `build-ai-service.yml`,
      con los mismos filtros de `paths`.
- [x] Los jobs `build` (GHCR + SSH al VPS) condicionados a
      `if: github.event_name != 'pull_request'`.
- [x] `build-frontend.yml` sin tocar — el frontend ya corría en PR vía
      `check-frontend.yml`.

**Decisión que cambió respecto al plan original:** *no* se separaron los workflows
en `ci-*.yml` + `build-*.yml`. Separarlos obligaba a mover el job de deploy de
archivo, que es la parte con riesgo real de romper producción en silencio. Con un
`if` en el job se consigue lo mismo sin tocar el camino de deploy.

**Detalle crítico:** la condición es `!= 'pull_request'`, **no** `== 'push'`. Con
`== 'push'` el `workflow_dispatch` (la escotilla de redespliegue manual) habría
dejado de desplegar en silencio: correría test y lint, quedaría en verde, y no
haría nada.

**Verificado:** en el PR corren `test` + `lint` y `build`/`smoke` salen como
*skipping*; en `main` corren los cuatro y el smoke contra producción pasa. La
suite de integración se ejecuta de verdad en el PR (`ok internal/integration
10.399s`), o sea que el aislamiento RLS multi-tenant ya protege cada PR por 10 s.

#### Paso B — que la puerta bloquee ⬜ PENDIENTE

Activar `required_status_checks` en la protección de `main`. **Dos trampas
descubiertas al ejecutar el Paso A que hay que resolver antes:**

1. **Colisión de nombres.** Los jobs se llaman `test` tanto en el workflow de
   core-api como en el de ai-service. GitHub identifica los checks requeridos por
   nombre, así que exigir `test` es ambiguo. Hay que renombrar los jobs a
   `core-api-test`, `core-api-lint`, `ai-service-test` antes de exigirlos.
2. **Filtros de `paths` + checks requeridos = bloqueo permanente.** Si un PR toca
   solo `docs/`, el job `test` de core-api no se dispara, y GitHub deja el PR en
   *"Expected — waiting for status to be reported"* para siempre. No lo da por
   aprobado. Con `enforce_admins: true` (ya activo) tampoco se puede saltar: es
   un lockout real del repo. Solución: un job `gate` sin filtro de `paths` que
   siempre corre, depende de los demás con `if: always()`, y reporta el resultado
   agregado. Ese único check es el que se exige.

- [ ] Renombrar los jobs para que sean únicos.
- [ ] Añadir el job `gate` agregador sin filtro de `paths`.
- [x] `Check frontend types` verde en `main` (estuvo en rojo el 2026-07-27 por la
      rama de bulk-export/auditlog; lo arregló el PR #235). Requisito previo:
      con el check exigido, nada mergea mientras esté rojo.
- [ ] Activar la protección exigiendo solo `gate`. Sin `strict: true` al
      principio, para no añadir además la fricción de tener la rama al día.

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection/required_status_checks \
  -f strict=false -f 'contexts[]=gate'
```

**Cómo salir de un lockout** (por si pasa igual): la protección se quita con
`gh api -X DELETE repos/:owner/:repo/branches/main/protection/required_status_checks`.
Tenerlo a mano antes de activar, no después.

**Criterio de salida:** un PR con un test roto no se puede mergear, ni siquiera
por ti.

---

### Fase 1 — Escribir las 5 reglas de CLAUDE.md como tests ejecutables

Las reglas estrictas del proyecto hoy viven en prosa dentro de `CLAUDE.md`. Un
agente las lee y las *puede* respetar. El objetivo es que no *pueda* violarlas.
Cada regla pasa a ser un test que falla si se rompe.

| Regla CLAUDE.md | Test que la vuelve ejecutable | Dónde |
|---|---|---|
| 2. Multi-tenant vía RLS | ✅ ya existe | `integration/rls_test.go` |
| 2b. Toda tabla nueva con `organization_id` tiene política RLS | ⬜ test que consulta `pg_policies` y falla si una tabla tenant-scoped no tiene `tenant_isolation` | `integration/rls_policy_coverage_test.go` |
| 3. Dinero en `NUMERIC`, nunca float | ⬜ test que consulta `information_schema.columns` y falla si una columna de dinero es `float4/float8/real` | `integration/money_types_test.go` |
| 4. PII cifrada en `BYTEA` | ⬜ test que verifica que las columnas de PII son `bytea` y que un `SELECT` crudo no devuelve el nombre en claro | `integration/pii_encrypted_test.go` |
| 4b. Búsqueda solo por hash | ⬜ test/lint que falla si aparece `LIKE` sobre una columna cifrada en cualquier `.sql` o query Go | `scripts/lint_no_like_on_encrypted.sh` |
| 5. `ai_drafts` inmutables | ⬜ test que intenta un `UPDATE` sobre un draft aprobado y exige que falle | `integration/ai_drafts_immutable_test.go` |
| 5b. El LLM recibe texto anonimizado | ⬜ test de la función de anonimización: dado un texto con nombre/DNI/teléfono, la salida no los contiene | `internal/aisuggestions/anonymize_test.go` |

Esto es lo que Uncle Bob llama "restricciones extremas". No es cobertura: son
**invariantes de dominio**. Siete tests que valen más que 200 tests de getters.

---

### Fase 2 — Tests unitarios donde duele, con trinquete de cobertura

No perseguir un 80 % global. Perseguir **pisos duros en los paquetes críticos** y
un **trinquete** que impida que la cobertura global baje.

Orden de ataque (por riesgo × ausencia de tests):

1. `internal/shared/crypto` — objetivo **95 %**. Roundtrip encrypt/decrypt, DEK
   por paciente, rotación de `MASTER_KEY`, fallo al descifrar con la clave
   equivocada, nonce nunca reutilizado, ciphertext manipulado → error (no
   plaintext basura).
2. `internal/shared/clinicalperm` + `internal/shared/middleware` — **90 %**.
   Autorización: cada denegación esperada probada explícitamente. Fail-closed.
3. `internal/auth/service` — **85 %**. Expiración de token, refresh, revocación,
   rate limit, hashing de contraseñas.
4. `internal/invoicing` (3.091 LOC) — **85 %**. Redondeo, IVA, retenciones,
   NUMERIC en todos los caminos.
5. `internal/availability` + `internal/booking` — **85 %**. Solapes, zonas
   horarias, doble reserva.

- [ ] Añadir job `coverage` al CI que falle si el total baja respecto a
      `.coverage-floor` (fichero versionado con el número actual).
- [ ] Añadir pisos por paquete en un `scripts/check_coverage.sh` que lea un mapa
      paquete→mínimo. Los paquetes de la lista de arriba entran uno a uno; el
      resto arranca en 0 y sube solo con el trinquete global.

**Regla operativa:** el trinquete solo sube. Cada PR que añade código sin test
baja el porcentaje y el CI lo rechaza. Así la cobertura crece sin que tengas que
mirarla.

---

### Fase 3 — Propiedades y fuzzing (lo que el agente no puede amañar)

Go trae fuzzing nativo, sin dependencias. Aquí el input lo genera la máquina, así
que el agente no puede escribir un test que "pase por construcción".

- [ ] `FuzzEncryptDecrypt` en `crypto`: para cualquier plaintext,
      `Decrypt(Encrypt(x)) == x`. Y para cualquier ciphertext manipulado,
      `Decrypt` devuelve error.
- [ ] `FuzzHashSearch` en `shared/hash`: determinismo, sin colisiones en el
      corpus, normalización estable (tildes, mayúsculas, espacios).
- [ ] `FuzzTemplateParse` en `recordtemplates`: ninguna plantilla malformada debe
      provocar panic.
- [ ] `FuzzMarkdownRender` en `recordtemplates/markdown` y el renderer de PDF: sin
      panics, sin inyección en el PDF.
- [ ] Propiedades de dinero en `invoicing`: `suma(líneas) == total` siempre;
      `total >= 0`; redondeo asociativo. Con `testing/quick` o casos generados.
- [ ] Añadir al CI un job `fuzz` con `-fuzztime=60s` por objetivo (no infinito),
      y versionar el corpus de `testdata/fuzz/` cuando encuentre un fallo.

---

### Fase 4 — Tortura y concurrencia

Los bugs que los tests unitarios nunca ven y que en producción cuestan un cliente.

- [ ] **Doble reserva:** N goroutines pidiendo el mismo slot a la vez; exactamente
      una gana. Sobre el arnés de integración, con Postgres real.
- [ ] **RLS bajo concurrencia:** dos tenants operando en paralelo sobre el mismo
      pool; ninguna fuga cruzada.
- [ ] **`go test -race`** en CI. El `Makefile` ya lo usa en `test-api`; el
      workflow **no**. Corregirlo.
- [ ] **Idempotencia del outbox** (`shared/outbox`): reprocesar el mismo mensaje
      dos veces no duplica efectos.
- [ ] **Migraciones reversibles:** test que aplica todas las `up`, luego todas las
      `down`, luego todas las `up` de nuevo. Hoy nadie prueba las `down`.

---

### Fase 5 — Mutación (el examen de los tests)

Esta es la pieza que cierra el círculo: mide si tus tests **detectarían** un fallo,
no si pasan. Es lenta, así que se acota.

- [ ] Herramienta: `github.com/gtramontina/gremlins` (Go). Alternativa
      `go-mutesting`. Ambas están poco mantenidas — evaluar primero con una prueba
      de 30 min sobre `crypto` antes de comprometerse.
- [ ] Alcance: **solo** `crypto`, `clinicalperm`, `invoicing`, `availability`.
      Correr mutación sobre 227 ficheros es inviable en CI.
- [ ] Umbral inicial: **60 % de mutantes muertos**, subiendo 5 puntos por
      trimestre.
- [ ] No en cada PR. Job nocturno (`schedule: cron`) que abre issue si baja.

**Si gremlins no funciona bien:** el sustituto barato y honesto es que tú (o un
agente adversario con prompt distinto) introduzca 10 bugs a mano en el código
crítico una vez al trimestre y compruebe cuántos atrapa la suite. Menos elegante,
igual de informativo.

---

### Fase 6 — Aceptación (Gherkin) sobre la API HTTP

Lo que Uncle Bob llama pruebas de aceptación: la especificación en lenguaje de
negocio, no de código. Aquí es donde tú, el humano, sigues leyendo — pero lees
`.feature`, no Go.

- [ ] `godog` (Cucumber para Go) contra el arnés de integración, levantando el
      router real y hablando HTTP.
- [ ] Ficheros `.feature` en español, en `services/core-api/features/`.
- [ ] Escenarios iniciales, uno por flujo que si se rompe pierdes un cliente:
      - Alta de paciente → cita → sesión → historia clínica firmada → factura.
      - Un profesional no ve pacientes de otro profesional sin relación.
      - Un borrador IA no se convierte en historia sin aprobación explícita.
      - Consentimiento vencido bloquea la creación de historia.
      - Cancelación de cita libera el slot y no factura.
- [ ] Los `.feature` los escribes/apruebas **tú**. El agente implementa los steps.
      Esa es la frontera correcta: el humano especifica, la máquina implementa.

**Este es el punto en que empiezas a poder no leer el código.** Antes de tener
aceptación, no.

---

### Fase 7 — El punto ciego: lo que ningún test ve

- [ ] **Secret scanning:** `gitleaks` en CI. Un agente que hardcodea una API key
      pasa todos los tests.
- [ ] **PII en logs:** grep en CI que falla si aparece `log.*patient.name`,
      `log.*document`, o el struct de paciente completo en un log.
- [ ] **Dependencias:** `dependency-review-action` en PR. Un agente que añade una
      librería nueva debe ser visible sin leer el diff.
- [ ] **`govulncheck`** en CI para CVEs de dependencias Go.
- [ ] **Llamadas de red no autorizadas:** lista blanca de hosts; test que falla si
      aparece un `http.Get` a un dominio fuera de la lista.
- [ ] **Presupuesto de tamaño de bundle** en frontend: falla si crece >10 % en un
      PR.

---

### Fase 8 — Cerrar el contrato con el agente

Lo anterior es infraestructura. Esto es lo que hace que el agente la use **antes**
de decirte "listo".

- [ ] Añadir a `CLAUDE.md` una sección **Definition of Done** explícita: ningún
      cambio se reporta como terminado sin `make verify` en verde.
- [ ] Crear `make verify` = `test-api -race` + `lint-api` + cobertura + los tests
      de invariantes + typecheck frontend + pytest. Un solo comando.
- [ ] Hook `pre-push` en git que corre `make verify`. El agente no puede empujar
      código roto aunque quiera.
- [ ] Regla en `CLAUDE.md`: **está prohibido debilitar, saltar (`t.Skip`) o
      borrar un test para hacer pasar el build.** Si un test estorba, se reporta,
      no se toca. Añadir un check en CI que falle si el número de `t.Skip` sube.
- [ ] Regla: todo bug encontrado en producción entra primero como test que falla,
      y luego se arregla. Sin excepción.

---

## 4. Cronograma realista

Eres uno, con el producto en producción y clientes que atender. Esto no es un
trimestre a tiempo completo.

| Bloque | Fases | Esfuerzo | Resultado |
|---|---|---|---|
| **Semana 1** | 0 | ~3 h | El CI bloquea de verdad. Cambio de mayor retorno del plan. |
| **Semana 2–3** | 1 | ~8 h | Las 5 reglas de CLAUDE.md dejan de ser prosa. |
| **Semana 4–6** | 2 (crypto, clinicalperm, auth) | ~12 h | El código de más riesgo, cubierto. Trinquete activo. |
| **Semana 7–8** | 3 + 4 | ~10 h | Fuzzing y concurrencia. Aquí aparecen bugs reales. |
| **Semana 9–10** | 6 | ~12 h | Aceptación en Gherkin de los 5 flujos de negocio. |
| **Semana 11** | 7 | ~4 h | Punto ciego cubierto. |
| **Semana 12** | 5 + 8 | ~6 h | Mutación nocturna + contrato con el agente. |

Total ≈ 55 h repartidas en un trimestre. Casi todo lo puede escribir un agente;
tu tiempo se va en decidir **qué** se prueba y en leer los `.feature`.

## 5. Cómo sabes que llegaste

No es una fecha, son cuatro señales:

1. Introduces a mano un bug en el código crítico y el CI lo atrapa antes de que
   tú te acuerdes de dónde lo pusiste.
2. Mergeás un PR de un agente sin abrir el diff y no sientes nada.
3. Un test rojo te sorprende — porque ya no esperas que los tests fallen.
4. Los `.feature` son el sitio donde discutes el producto, no el código.

Hasta que se cumplan las cuatro, sigue leyendo el código.

## 6. Lo primero, si solo haces una cosa

**Fase 0.** Hoy tus tests corren después del merge y ninguno bloquea nada. Tienes
un arnés de integración muy bueno que no está protegiendo la rama. Arreglar eso
son tres horas y multiplica el valor de todo lo que ya escribiste.
