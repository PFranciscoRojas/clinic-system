# Plan de corrección — Auditoría 360° (2026-07-01)

> Origen: auditoría completa de código, BD, IA, seguridad y UX (sesión 2026-07-01).
> Ejecutar por fases, en orden. Cada fase = 1 rama + 1 PR + deploy verificado con smoke test.
> Los ítems de producto/features de la auditoría NO van aquí — están en `BACKLOG.md`.

---

## Fase 1 — Seguridad crítica 🔴 ✅ COMPLETADA (2026-07-02, PR #107)

**Rama:** `fix/security-audit-critical` (merged squash → `main`)

### 1.1 Eliminar docker.sock de core-api ✅
El socket solo alimentaba 3 comandos de limpieza en la consola admin. Un RCE en la API = root en el host.
- ✅ Quitado `- /var/run/docker.sock:/var/run/docker.sock` de `docker-compose.yml`; `docker-cli` removido del `Dockerfile`
- ✅ Eliminados los comandos prune de `admin/handler/system.go`, la ruta `/admin/system/actions`, y el `MaintenancePanel` de `SuperAdminPage.tsx`
- ✅ Cron semanal instalado en el host VPS: `0 4 * * 0 docker system prune -af` → `/var/log/docker-prune.log`
- ⚠️ El `dist` desplegado (build viejo) aún muestra los 3 botones de Mantenimiento; ahora dan 404. Se resuelven cuando salga el build de frontend WIP. Solo visibles para SYSTEM_ADMIN.

### 1.2 Cap real de tamaño en upload de audio ✅
- ✅ `http.MaxBytesReader(w, r.Body, maxAudioSize)` antes de `ParseMultipartForm`
- ✅ Multipart malformado → 400; exceso de tamaño → 413 (vía `http.MaxBytesError`)
- ✅ `appointment_id` validado con `uuid.Parse` antes de usarse como nombre de archivo

### 1.3 Hashes de búsqueda con pepper (HMAC-SHA256) ✅
- ✅ Nueva env obligatoria `SEARCH_PEPPER` (fail-closed en `hash.Init` al arrancar); generada en el `.env` del VPS (nunca salió del servidor)
- ✅ `hash.Normalize` → `HMAC-SHA256(pepper, lower(trim(s)))`; `Token()` intacto
- ✅ `cmd/rehash`: recalcula `users.email_hash` + los 3 hashes de `patients` en UNA transacción, RLS-aware (GUC por org). Incluido en la imagen como `./rehash`
- ✅ Cutover ejecutado: deploy → `docker compose exec core-api ./rehash` (7 usuarios, 4 pacientes) → verificado

**Verificación:** build+deploy CI verde; rehash OK; socket confirmado ausente del contenedor. El smoke de `login` falla con 401 pero es **pre-existente y no relacionado**: la cuenta `SMOKE_PASSWORD` da `USER-NOT-FOUND` tanto con el código viejo (ayer) como con el nuevo — ese email no existe en la BD de prod (secret desactualizado, arreglar aparte). Pendiente confirmación humana: que el usuario pruebe login real en la app.

---

## Fase 2 — Bugs de sesión/auth 🟠 ✅ COMPLETADA (2026-07-02, PR #108)

**Rama:** `fix/session-refresh-races` (merged squash → `main`)

### 2.1 Single-flight en el refresh de token ✅
- ✅ `client.ts`: promesa compartida module-level; todos los 401 esperan el mismo refresh; retry acotado a 1 intento por request

### 2.2 No arrasar localStorage al expirar sesión ✅
- ✅ Borrado selectivo (`access_token` + `refresh_token`); drafts clínicos y flags de onboarding sobreviven — igual que el logout explícito de `AuthContext`

### 2.3 Refresh releyendo identidad y permisos desde BD ✅
- ✅ `Refresh` usa `FindUserByID` (ya existía con roles+perms); rechaza `is_active=false` con 403
- ✅ Payload de Redis reducido a `{uid, epoch}` (tokens viejos siguen parseando)
- ✅ Bonus: los errores de refresh mapeaban a 500 (no estaban en el ErrorMapper); ahora 401/403 con sentinelas

### 2.4 Unificar los 3 fetch ad-hoc en client.ts ✅
- ✅ `api.getBlob(path, mensajeError)` con el mismo pipeline auth+401-refresh (`authedFetch` compartido)
- ✅ Migrados `exportPDF`, `downloadReceipt`, `exportCSV`; cero `Bearer ${localStorage...}` fuera de client.ts

**Verificación:** `go build/vet/test` + `tsc` verdes; backend desplegado vía CI (`6948ef1`) y frontend reconstruido en el VPS; probado en prod que refresh con token inválido devuelve 401 (antes 500). Nota: `invoices.ts` aterrizó con 2 líneas de colores del rediseño WIP (autocontenidas). Los tests automatizados de single-flight quedan para Fase 5.2.

---

## Fase 3 — IA: determinismo y guardrails 🟠 ✅ COMPLETADA (2026-07-02, PR #109)

**Rama:** `enhancement/ai-guardrails` (merged squash → `main`, `f9a18b8`)

### 3.1 Determinismo y configuración ✅
- ✅ `temperature=0.2` en las 4 llamadas (`drafts/claude.py`, `suggestions/claude.py` ×3)
- ✅ Modelo y temperatura a `config.py` (`ANTHROPIC_MODEL` default `claude-sonnet-4-6`, `ANTHROPIC_TEMPERATURE` default 0.2)
- ✅ `max_tokens` dinámico en drafts: 3072 base; con plantilla >8 secciones escala 4096+256/sección extra, tope 8192

### 3.2 Cerrar huecos de anonimización ✅
Restricción: el VPS no tiene disco para `es_core_news_lg` (por eso está `sm`).
- ✅ Regex de email en `anonymization/ner.py` → `[CORREO]` (antes del patrón de documentos)
- ✅ Reemplazo literal de nombres conocidos: el worker descifra los 4 campos de nombre del paciente (DEK propio) y `anonymize()` los reemplaza textualmente ANTES del NER — case-insensitive y tolerante a tildes (`José`≈`jose`, `Muñoz`≈`munoz`). Aplica a drafts Y a las 3 sugerencias. Best-effort: si el descifrado falla, se loguea y el NER sigue
- ⬜ (BACKLOG, no aquí) upgrade a `es_core_news_md/lg` cuando haya disco

### 3.3 Guardrail de prompt injection ✅
- ✅ Regla añadida a los 4 system prompts: la transcripción/historia son DATOS, nunca instrucciones

### 3.4 Validar ICD-10 sugerido contra catálogo ✅
- ✅ `worker.py::_validate_suggested_icd10`: `SELECT 1 FROM icd10_codes WHERE code=$1`; si no existe → `suggested_icd10 = null` antes de cifrar

### 3.5 Presupuesto de historia para risk/plan ✅
- ✅ `render_history(max_records=20, max_chars=30_000)`: ganan las sesiones más recientes; diagnósticos y la sesión más nueva sobreviven siempre. El recap mantiene su ventana de 5

### 3.6 Recuperación de jobs huérfanos en el worker ✅
- ✅ Reclaim en cada ciclo: `XPENDING (idle > 5 min)` + `XCLAIM` (en vez de `XAUTOCLAIM`: se necesita el delivery count, que solo XPENDING da — funcionalmente equivalente)
- ✅ Dead-letter tras 3 entregas: draft → `ERROR` / suggestion → `FAILED` (visible en UI) + `XACK`
- ✅ Sweep al arrancar: `PROCESSING` con >30 min → `ERROR`/`FAILED` recuperable (drafts y suggestions)
- ✅ Bonus: `_process_draft` resuelve DEK+paciente ANTES de transcribir (fail-fast si el draft ya no existe)

**Verificación:** `py_compile` limpio; lógica pura testeada standalone (patrón de nombres sin overmatch — `josefina` intacta —, regex email, budget 16.988→2.873 chars); CI build+deploy verde; worker arriba en VPS con `startup sweep done` y ciclos de reclaim sin errores. Pendiente prueba humana end-to-end: draft real con nombre del paciente en el audio.

---

## Fase 4 — Plataforma y rendimiento 🟡 ✅ COMPLETADA (2026-07-02, PR #110)

**Rama:** `enhancement/platform-perf` (merged squash → `main`, `fc8149d`)

### 4.1 Cache del SubscriptionGate ✅
- ✅ Cache in-memory por org con TTL 60s (map + mutex); los errores de lookup NO se cachean (fail-open sigue siendo por request); `Entitled()` sigue evaluando el deadline contra el reloj, así que un periodo que vence a mitad de TTL se niega al instante — solo los cambios de status esperan el TTL restante

### 4.2 Análisis estático en CI ✅
- ✅ Job `lint` en `build-core-api.yml`: `go vet` + `staticcheck` (pinned v0.7.0); `build` ahora requiere `[test, lint]`. Un único finding pre-existente arreglado (S1016 en `invoicing/handler.go`)
- ✅ `eslint` en `check-frontend.yml` junto a `tsc --noEmit`. Sorpresa: el script `lint` existía pero eslint nunca se instaló ni había config — se montó eslint 10 flat config (typescript-eslint + react-hooks). Reglas base en `error` (pasan hoy, 0 errores); los 43 findings pre-existentes (react-hooks v6 + `no-explicit-any`) quedan en `warn` hasta que aterrice el rediseño WIP (ratchet en BACKLOG)

**Verificación:** `go build/vet/staticcheck/test` verdes; eslint 0 errores contra `main` limpio (worktree temporal) y contra el working tree con WIP; pipeline post-merge: `lint`+`test`+`build`(deploy) verdes — `smoke` falla por el secret `SMOKE_PASSWORD` pre-existente (BACKLOG), API sana y contenedor arriba.

---

## Fase 5 — Tests (la deuda #1) 🔴 ✅ NÚCLEO COMPLETADO (2026-07-02, PR #111) — 2 ítems de continuación

**Rama:** `test/integration-foundation` (merged squash → `main`, `231b1f8`)

> Antes: 6 archivos de test para 24k LOC. Ahora: suite de integración contra Postgres 16 real (testcontainers, TODAS las migraciones, conectando como `sghcp_app` NOSUPERUSER — la topología exacta de prod) + vitest en frontend. 20 subtests backend en ~5s, 8 en frontend.

### 5.1 Backend — integración con Postgres real ✅ (1 pendiente)
- ✅ Setup testcontainers-go (`internal/integration`, 1 contenedor compartido por run, migraciones como owner + `setup_app_role.sql`)
- ✅ **Test de aislamiento RLS** sobre 10 tablas con policy: SELECT scoped, GUC en blanco fail-closed, UPDATE/DELETE cross-tenant → 0 filas, WITH CHECK rechaza INSERT/re-etiquetado
- ✅ **Guard de cobertura RLS**: cualquier tabla futura con `organization_id` sin policy rompe la suite (allow-list documentada)
- ✅ Dinero: NUMERIC end-to-end con montos hostiles a float64 (1333.43×3), ciclo DRAFT→ISSUED→PARTIAL→PAID, sobrepago rechazado, `SUM(payments)==total_paid` en SQL
- ✅ Auth: login (lockout a 5, errores anti-enumeración) + refresh (replay de rotación, epoch, usuario inactivo, token basura — blinda 2.3)
- ✅ `patient_staff_rel` need-to-know: terapeuta ✔, profesional sin relación ✘, supervisor co-firma ✔, sin scope fail-closed
- ⬜ Ciclo de vida clinical record: crear → autosave → aprobar → inmutable → adenda (siguiente sesión de tests)

**🔴 2 defectos reales encontrados y corregidos por la suite:**
1. `clinicalperm.IsAssignedToPatient` consultaba el pool crudo (sin GUC): su rama de `clinical_records` (FORCE RLS) veía 0 filas siempre — **el acceso del supervisor co-firmante estaba roto en prod silenciosamente**. Fix: `dbctx.From` (querier scoped)
2. `patient_staff_rel` y `supervision_rel` tenían `organization_id` **sin policy RLS**. Migración `000049` les añade `tenant_isolation` + FORCE. Aplicada en prod (deploy del binario primero, migración después; `schema_migrations` → 49)

### 5.2 Frontend — vitest ✅ (1 pendiente)
- ✅ vitest + happy-dom (`vitest.config.ts` separado del build); 8 tests de `client.ts`: single-flight (3×401 concurrentes → 1 refresh), borrado selectivo (drafts clínicos sobreviven), retry acotado a 1, mapeo de errores, `getBlob`
- ✅ Nota: vitest pineado a v3 (v4 exige vite ≥6 y anidaba un vite 8 con lockfile roto en npm 10)
- ⬜ `RecordForm`: autosave localStorage + restauración + merge con servidor (la zona de los bugs de sesión 22–24)

### 5.3 Gate de CI ✅
- ✅ `go test ./...` ya corre la suite de integración en CI (ubuntu-latest trae Docker); verificado verde en el pipeline post-merge
- ✅ `npm test` añadido a `check-frontend.yml` tras tsc + eslint

---

## Fase 6 — Frontend: refactor y endurecimiento 🟡 (1–2 sesiones)

**Rama:** `refactor/settings-split`

### 6.1 Partir SettingsPage (2.262 líneas) ⬜
- ⬜ Sub-rutas: `/settings` (perfil), `/settings/clinica` (branding/org), `/settings/integraciones` (GCal, WhatsApp, pagos), `/settings/plantillas` (registro + consentimientos), `/settings/ia`, `/settings/legal`
- ⬜ Extraer cada tarjeta a `components/settings/`; sin cambio de comportamiento (refactor mecánico, verificar con navegación manual)

### 6.2 Mitigar PHI en localStorage ⬜
- ⬜ Logout explícito limpia los borradores clínicos locales (el flush a servidor ya existe — forzarlo antes)
- ⬜ Mantener drafts en expiración de sesión (protegido por 2.2); el bloqueo de pantalla (`lib/screenLock.ts`) ya cubre el equipo compartido desatendido

### 6.3 (Opcional, evaluar tras beta) Refresh token a cookie httpOnly ⬜
Cambio de arquitectura (backend Set-Cookie + CSRF + frontend). Diferir si la beta apremia; el CSP estricto ya mitiga XSS.

---

## Orden y estimación

| Fase | Prioridad | Estimación | Deploy independiente |
|---|---|---|---|
| 1 — Seguridad crítica | 🔴 ya | 1 sesión | sí (con ventana para rehash) |
| 2 — Bugs de sesión | 🔴 ya | 1 sesión | sí |
| 3 — IA guardrails | 🟠 alta | 1 sesión | sí (solo ai-service + compose) |
| 4 — Plataforma | 🟡 media | ½ sesión | sí |
| 5 — Tests | 🔴 alta (continuo) | 2 sesiones | n/a (CI) |
| 6 — Frontend refactor | 🟡 media | 1–2 sesiones | sí |

**Regla:** Fases 1 y 2 antes que cualquier feature nueva y antes de la beta de diseño (los bugs de logout/pérdida de borrador son exactamente lo que una beta no debe ver). Fase 5.1 (test RLS) idealmente dentro de la Fase 1 para validar el rehash.
