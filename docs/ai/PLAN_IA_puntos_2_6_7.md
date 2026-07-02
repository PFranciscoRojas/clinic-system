# Plan — Puntos 2, 6 y 7 de tareas_clinica.md

> Escrito 2026-07-02. Solo plan — sin cambios de código aún.
> Puntos: **2** (borrador no se adapta al formato dinámico), **6** (enfoque terapéutico en perfil), **7** (salidas de IA orientadas al enfoque).

---

## 1. Cómo funciona hoy la IA (análisis)

### 1.1 Pipeline de borradores (grabación → historia clínica)

```
AppointmentPage (graba) ──uploadAudio(record_type, template_id)──▶ POST /appointments/{id}/audio
  └─ aidrafts/handler/writer.go: lee ai_prefs (note_style, tone) del perfil
       └─ aidrafts/service/upload.go: crea ai_draft PENDING + encola job Redis
            Values: {draft_id, audio_path, record_type, note_style, tone, template_id}
                 └─ ai-service worker.py:
                      Whisper (local) → anonymize → _load_template_sections(template_id)
                      → drafts/claude.py generate_clinical_draft(...)
                      → guarda {"record_type", "sections", "suggested_icd10"} cifrado
```

- `drafts/claude.py` construye el prompt desde **dos fuentes**: el schema del template custom (si llegó `template_id`) o `_SECTION_SCHEMAS` **quemado en Python**.
- La respuesta se filtra con `_filter_sections` (whitelist de claves del schema usado) y `suggested_icd10` se valida contra el catálogo — **la forma del JSON la garantiza el código, no el modelo**.

### 1.2 Pipeline de sugerencias (recap / plan terapéutico / riesgo)

```
aisuggestions.Service.Request(org, patient, kind) → job Redis {kind, suggestion_id, patient_id, org_id}
  └─ worker.py _process_suggestion: lee registros APROBADOS + diagnósticos
       → render_history → anonymize → suggestions/claude.py (3 system prompts fijos)
       → normaliza claves en Python → guarda cifrado → GET devuelve content JSON
```

Formas de salida que el frontend consume (contratos actuales, en `api/aiSuggestions.ts`):

| Kind | Forma JSON | Consumidor |
|---|---|---|
| `recap` | `{summary, last_session, pending_tasks, focus_points[], risk_flags}` | `RecapCard` |
| `treatment_plan` | `{title, formulation, goals[{description, target_weeks}]}` | `TreatmentPlanPanel` (pre-llena el form) |
| `risk_detection` | `{level: none\|low\|moderate\|high, signals[], rationale, recommendation}` | `RiskBanner` |

**Hallazgo clave para el Punto 7:** el prompt de plan terapéutico (`_PLAN_SYSTEM`) está **quemado a TCC** ("El enfoque es exclusivamente cognitivo-conductual"). Recap y riesgo son neutrales.

### 1.3 Preferencias del profesional

- `professional_profiles.ai_prefs JSONB` (migración 000037): `{"note_style","tone"}`.
- Se leen en `writer.go` al subir audio y viajan en el job Redis. Editables en Settings.
- **Este es el punto de extensión natural para el enfoque terapéutico** — mismo camino ya probado.

---

## 2. Punto 2 — Diagnóstico: por qué el borrador "está quemado"

Tres defectos que se combinan (el usuario ve siempre "Estado actual" + "Descripción clínica de la sesión" + CIE-10 + riesgo, que son exactamente las 2 secciones de `TEMPLATE_SECTIONS.EVOLUTION` del frontend):

### Bug A (crítico): `template_id` nunca vuelve al frontend
- `ai_drafts` **no tiene columna `template_id`** — el template viaja solo en el job Redis y se pierde.
- `GET /ai-drafts/{id}` (reader.go) **no devuelve `template_id`** → `draft.template_id` es siempre `undefined` en `AIDraftPage`.
- Consecuencia: la página **nunca** carga el template custom (`useQuery enabled: !!draft.template_id`) y siempre renderiza el formato integrado quemado (`TEMPLATE_SECTIONS[recordType]`). Las secciones custom que la IA sí generó quedan invisibles; y al aprobar, `template_id` no se envía → el registro se guarda como formato integrado y se valida contra la whitelist equivocada.

### Bug B: tres "fuentes de verdad" del formato integrado, desincronizadas
| Fuente | EVOLUTION | INITIAL |
|---|---|---|
| Python `_SECTION_SCHEMAS` (genera) | 4 claves (`session_development, interventions, patient_response, plan_tasks`) | 7 claves |
| Frontend `TEMPLATE_SECTIONS` (renderiza/aprueba) | **2 claves** | 11 claves |
| Go `templateSections` (valida) | superset (~25 claves) | superset |

La IA genera `patient_response`/`plan_tasks` que la UI jamás muestra (y se pierden al aprobar, porque el approve itera solo `sectionDefs` del frontend); y la UI tiene campos (`family_dynamics`, `medical_history`…) que la IA nunca llena.

### Bug C: `template_id` se pierde antes de subir el audio
`handleFinishSession` sube con `selectedTemplateId`, que solo se setea si `RecordForm` está montado (dispara `onTemplateChange`). Si el profesional graba sin abrir el formulario, el `setupTemplateId` elegido en el setup de sesión **no se usa** → el job va sin template y Python cae al schema quemado.

### Plan de fix (PR A — persistencia, y PR B — unificación)

**PR A — que el template viaje completo (bajo riesgo, alto impacto):**
1. Migración `000NNN_ai_draft_template.up.sql`: `ALTER TABLE ai_drafts ADD COLUMN template_id UUID REFERENCES clinical_record_templates(id);` (+ down). NULL = formato integrado (misma semántica que `clinical_records.template_id`).
2. `aidrafts/service/upload.go` + `repository/create.go`: persistir `TemplateID` al crear el draft (además de encolarlo, como hoy).
3. `aidrafts/handler/reader.go` (getDraft): devolver `template_id` (y de paso `appointment_id`, que ya existe en el modelo y servirá para el Punto 3). El tipo TS `AIDraft` ya declara ambos — el frontend no cambia.
4. `aidrafts/handler/approve.go`: fallback servidor — si `body.TemplateID == ""`, usar `draft.TemplateID`. Así el registro aprobado queda con el template correcto aunque el cliente sea viejo.
5. `AppointmentPage`: subir con `selectedTemplateId ?? (setupTemplateId || undefined)` en `handleFinishSession`, `handleUploadRecovery` y `AudioSection` (cierra Bug C).
6. Tests: integración Go (reader devuelve template_id; approve con fallback), manual E2E con un formato custom.

**PR B — una sola fuente de verdad del formato integrado:**
1. El **core-api construye el schema de secciones y lo mete en el job Redis** (`sections_schema` JSON: lista `{key, label/hint, type}`), tanto para templates custom (ya lo hace el worker vía BD — se puede dejar) como para el **formato integrado**: nueva tabla Go (en `clinicalrecords` o `aidrafts`) espejo 1:1 de `TEMPLATE_SECTIONS` del frontend (claves + placeholders como hints del prompt).
2. `worker.py`/`drafts/claude.py`: si el job trae `sections_schema`, usarlo (mismo camino que `template_sections`); `_SECTION_SCHEMAS` queda solo como fallback de jobs antiguos en cola.
3. Verificar que las claves del espejo Go ⊆ whitelist `templateSections` (test unitario Go que compara ambas — evita que vuelvan a divergir).
4. Red de seguridad en `AIDraftPage`: renderizar también las claves de `draft_content_plain.sections` que no estén en `sectionDefs` (bloque "Otras secciones generadas") para que **nunca** haya contenido invisible, venga del schema que venga; e incluirlas al aprobar (Go las acepta: su whitelist es superset).

---

## 3. Punto 6 — Enfoque terapéutico en el perfil profesional

**Decisión de diseño: extender `ai_prefs` (JSONB), no columna nueva.** Ya existe el ciclo completo GET/PUT `/me/professional-profile/ai-prefs` + UI en Settings + lectura en upload — cero migraciones y el dato queda exactamente donde se consume (preferencias que moldean la IA).

1. **Contrato:** `ai_prefs.approach` string, catálogo cerrado:
   `cbt` (TCC) · `humanistic` · `psychodynamic` · `systemic` · `gestalt` · `act` · `dbt` · `integrative` · `""` (no definido).
   Constante compartida: Go (`profiles`), Python (`_APPROACH_INSTRUCTIONS`), TS (selector). Código en inglés; labels UI en español.
2. **Backend:** `putAIPrefs` hoy acepta cualquier objeto — añadir validación fail-closed de claves conocidas (`note_style`, `tone`, `approach`) y valores del catálogo (422 si no).
3. **Frontend (Settings → sección IA existente):** selector "Enfoque terapéutico" junto a estilo/tono, con descripción corta ("orienta el plan terapéutico y las sugerencias de IA"). Default `integrative` sugerido al perfil nuevo; vacío = comportamiento actual.
4. **Onboarding:** en el formulario de perfil profesional (primera vez), pedir el enfoque en el mismo paso — guarda vía el endpoint ai-prefs ya existente.

## 4. Punto 7 — Salidas de IA orientadas al enfoque

**Principio: el enfoque cambia INSTRUCCIONES del prompt, jamás el "Formato de respuesta" JSON.**

1. **Propagación:**
   - Borradores: `writer.go` ya lee `ai_prefs` → añadir `approach` a los `Values` del job → `generate_clinical_draft` recibe `approach` y agrega una instrucción (como hoy tono/estilo): p. ej. "Redacta intervenciones y plan con terminología del enfoque X".
   - Sugerencias: `aisuggestions.Service.Request` no conoce al solicitante → pasarle `requestedBy` (el handler ya tiene `claims.UserID`), leer su `ai_prefs.approach` y añadirlo a los `Values` del job (`approach`). El worker lo pasa a `generate_recap` / `generate_treatment_plan`.
2. **Plan terapéutico (`_PLAN_SYSTEM`):** parametrizar el prompt hoy quemado a TCC. Diccionario `_APPROACH_INSTRUCTIONS` en Python: por enfoque, 3-4 líneas con (a) marco conceptual para la `formulation`, (b) tipos de técnica/objetivo característicos, (c) cómo formular metas (siempre concretas y medibles, exigencia que se mantiene para todos). `approach` vacío o desconocido → bloque TCC actual (sin regresión).
3. **Recap:** una línea extra ("orienta los puntos de foco a un proceso de enfoque X"). Cambio suave — el recap sigue resumiendo hechos.
4. **Riesgo: EXPLÍCITAMENTE SIN enfoque.** La detección de riesgo se queda conservadora y agnóstica — la seguridad no se adapta a marcos teóricos.
5. **Borrador clínico:** instrucción de terminología solamente; las secciones las define el formato (Punto 2), no el enfoque.

### Cómo garantizamos no romper el formato que espera el frontend

1. **El shape lo impone el código, no el modelo:** en `suggestions/claude.py` la salida ya se reconstruye campo a campo (`out = {"title": ..., "goals": [...]}`), con enum de riesgo fail-safe y `_filter_sections` en borradores. Tocamos solo texto de instrucciones; los bloques "Formato de respuesta — un objeto JSON con estas claves: {...}" quedan idénticos.
2. **Contratos TS intactos:** `RecapContent`, `TreatmentPlanContent`, `RiskAssessmentContent` y `AIDraft.draft_content_plain` no cambian; `ai_prefs` es passthrough JSON en el GET, la clave nueva llega gratis.
3. **Tests de contrato en Python** (nuevos, sin llamar a la API): para cada enfoque del catálogo, construir el system prompt y afirmar que contiene el bloque JSON canónico sin alteraciones; y tests del post-procesado con respuestas sintéticas (claves extra, enum inválido, JSON con fences) verificando que la salida serializada siempre tiene exactamente las claves del contrato.
4. **Compatibilidad hacia atrás:** jobs en cola sin `approach` → default `""` → prompts actuales; sugerencias `READY` viejas no se tocan (se regeneran al pedir una nueva; opcional: incluir `approach` en `source_hash` para invalidar por cambio de enfoque).

---

## 5. Orden de ejecución y despliegue

| # | PR | Contenido | Riesgo |
|---|---|---|---|
| 1 | `fix/ai-draft-template-propagation` (PR A) | Migración + persistir/devolver `template_id` + fallbacks approve y upload | Bajo |
| 2 | `fix/integrated-format-single-source` (PR B) | Schema en el job + espejo Go + render de claves extra en AIDraftPage + test de consistencia | Medio |
| 3 | `feature/therapeutic-approach-pref` (Punto 6) | `ai_prefs.approach` + validación + Settings/onboarding | Bajo |
| 4 | `feature/approach-aware-ai` (Punto 7) | Propagación en jobs + prompts parametrizados + tests de contrato | Medio |

**Despliegue:** 1 y 3 → core-api (CI auto) + frontend (build manual); 2 y 4 tocan **ai-service** → rebuild imagen (`build-ai-service.yml`) y `docker compose up -d ai-service` en el VPS. La migración de PR A corre antes del restart de core-api. Los pares core-api/ai-service son compatibles en ambas direcciones en cada paso (campos de job opcionales con default).

**Fuera de alcance aquí:** Puntos 3 y 4 (UI de navegación a borradores pendientes y recap colapsable) — independientes de este plan.
