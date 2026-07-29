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

#### Paso B — que la puerta bloquee ✅ HECHO (PR #237, 2026-07-27)

Activar `required_status_checks` en la protección de `main`. **Dos trampas
descubiertas al ejecutar el Paso A que había que resolver antes:**

1. **Colisión de nombres.** Los jobs se llamaban `test` tanto en el workflow de
   core-api como en el de ai-service. GitHub identifica los checks requeridos por
   nombre, así que exigir `test` era ambiguo.
2. **Filtros de `paths` + checks requeridos = bloqueo permanente.** Si un PR toca
   solo `docs/`, el job `test` de core-api no se dispara, y GitHub deja el PR en
   *"Expected — waiting for status to be reported"* para siempre. No lo da por
   aprobado. Con `enforce_admins: true` (ya activo) tampoco se puede saltar: es
   un lockout real del repo.

- [x] Jobs renombrados a nombres únicos: `core-api-test`, `core-api-lint`,
      `ai-service-test`, `frontend-check`.
- [x] Filtros de `paths` quitados **solo del trigger `pull_request`**. El de
      `push` se mantiene, así que un cambio en `docs/` sigue sin redesplegar.
- [x] `Check frontend types` verde en `main` (estuvo en rojo el 2026-07-27 por la
      rama de bulk-export/auditlog; lo arregló el PR #235). Requisito previo:
      con el check exigido, nada mergea mientras esté rojo.
- [x] Protección activada con los cuatro checks, `strict: false`.

**Decisión que cambió respecto al plan:** se descartó el job `gate` agregador. En
vez de rodear la trampa de los `paths`, se elimina: sin filtro en `pull_request`,
los checks corren siempre y se pueden exigir directamente por nombre. Sin
mecanismo frágil que mantener. El precio es que un PR de solo documentación paga
~2 min de CI.

**Cómo se aplicó.** `PATCH` sobre `/protection/required_status_checks` devuelve
404 si el recurso no existe todavía; hay que hacer `PUT` sobre la protección
completa, que **reemplaza** todos los ajustes. Guardar antes el estado actual y
reenviar todos los campos (`enforce_admins`, `required_pull_request_reviews`,
`allow_force_pushes`…), o se pierden en silencio.

```bash
gh api repos/:owner/:repo/branches/main/protection > protection-backup.json  # SIEMPRE
gh api -X PUT repos/:owner/:repo/branches/main/protection --input protection-new.json
```

**Cómo salir de un lockout** (por si hiciera falta): la protección se quita con
`gh api -X DELETE repos/:owner/:repo/branches/main/protection`. Tenerlo a mano
antes de activar, no después.

**Criterio de salida — verificado.** Se abrió un PR desechable (#238) con un test
que falla a propósito: `core-api-test` en rojo y el merge bloqueado, con
`enforce_admins` impidiendo el override. Un PR verde de solo documentación (#233)
sí mergea. La puerta discrimina en las dos direcciones, que es lo único que
prueba que existe.

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

1. ✅ `internal/shared/crypto` — objetivo 95 %. **Hecho en la Fase 1** (PR #239):
   92,3 % medido, que es el 100 % del código alcanzable. Los 4 bloques restantes
   son errores de `aes.NewCipher`/`cipher.NewGCM` inalcanzables mientras la
   guarda de tamaño de clave exista.
2. ✅ `internal/shared/clinicalperm` + `internal/shared/middleware` (PR #242).
   87,4 % y 72,7 % en unitarios; el resto son las ramas que necesitan BD viva,
   cubiertas en `internal/integration/middleware_test.go` y `needtoknow_test.go`.
3. ✅ `internal/auth/service` — objetivo 85 %, alcanzado **87,2 %** (PR #243).
   Unitarios con repositorio falso + miniredis, sin docker. Lo que queda sin
   cubrir son fallos de infraestructura (bcrypt, `crypto/rand`, Redis) que
   pedirían una costura en producción; en crypto se hizo donde valía la pena
   (`randReader`), aquí no compensa.
4. ⬜ `internal/invoicing` (3.091 LOC) — **85 %**. Redondeo, IVA, retenciones,
   NUMERIC en todos los caminos.
5. ⬜ `internal/availability` + `internal/booking` — **85 %**. Solapes, zonas
   horarias, doble reserva.

- [x] Job `core-api-coverage` en CI que corre `scripts/check_coverage.sh`.
- [x] Pisos por paquete en `services/core-api/coverage-floors.txt`.

**El trinquete, como quedó implementado.** Falla de tres formas, no de una:

| señal | qué pasó |
|---|---|
| `BELOW` | un target por debajo de su piso — el PR añadió código sin tests |
| `BUMP` | un target más de 1 punto por encima — hay que subir el piso |
| `STALE` | un piso que nombra un paquete que ya no produce statements |

`BUMP` es lo que hace que el trinquete realmente trinque. Sin él, el piso se
queda en el número inicial para siempre y el mecanismo se pudre en silencio.
Con él, subir la cobertura obliga a registrar el número nuevo, y bajarla después
vuelve a fallar. `make coverage-bump` reescribe el fichero con lo medido.

**Decisiones que conviene no revertir sin pensarlo:**

- Se mide con `go test -short`: solo unitarios, sin docker, menos de un minuto.
  La suite de integración sigue corriendo en `core-api-test`. Contarla aquí
  inflaría el número sin reflejar lógica probada — los tests de integración
  ejercitan SQL a través de un pool crudo, no statements de Go.
- El script agrega el **perfil crudo** de cobertura, no `go tool cover -func`:
  el perfil trae el número de statements por bloque, así que el total por
  paquete va ponderado en vez de ser un promedio sin peso de porcentajes por
  función (que sobrevalora las funciones cortas).
- Los pisos de paquetes con código dependiente de BD llevan el porqué escrito en
  el propio fichero, para que nadie lea 72,7 % como "cobertura real del paquete".

**Trampa que costó un run rojo:** el repo tiene `core.fileMode = false`, así que
`chmod +x` no llega a git y el job muere con `Permission denied` (exit 126). Hay
que registrarlo explícitamente: `git update-index --chmod=+x <script>`.

**Patrón que funcionó para el repositorio falso** (`internal/auth/service`): en
vez de implementar los ~35 métodos de `auth.Repository`, embeber la interfaz en
el struct falso y declarar solo los que el test necesita. Un método que el
código llame sin que el test lo haya cableado es `nil` y **panica de forma
ruidosa** — que es justo lo que se quiere: una llamada inesperada al repositorio
es un hallazgo, no algo que devolver como valor cero en silencio.

**Dos cosas que los tests encontraron y que no se tocaron** (son decisiones,
no bugs que arreglar de paso):

- `token.Claims.UserID` lleva `json:"sub"` y a la vez el struct embebe
  `jwt.RegisteredClaims`, cuyo `Subject` también es `sub`. `encoding/json`
  resuelve el choque a favor del campo más superficial, así que `Subject` nunca
  se escribe ni se lee: la asignación en `issueTokenPair` es código muerto. Hoy
  nadie lee `.Subject`, pero quien empiece a hacerlo recibirá `""`. Fijado en
  `TestIssuedTokenCarriesTheUserInSubOnly`.
- `sanitizePhone` conserva `+` en cualquier posición y solo recorta el inicial,
  así que un `+` intermedio sobrevive a un valor que se usa tal cual en un
  enlace `wa.me`. Es entrada opcional escrita por humanos, no rompe nada hoy.
  Fijado en `TestSanitizePhoneKeepsInternalPlusSigns`, que avisa si se endurece.

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
