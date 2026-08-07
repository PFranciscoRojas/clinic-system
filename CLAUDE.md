# SGHCP — clinic-system

**Sistema de Gestión de Historias Clínicas Psicológicas** — SaaS multi-tenant de psicología (Colombia-first), en producción (VPS Hetzner 87.99.137.79). Diferenciador: historia clínica cifrada + Whisper local + cumplimiento legal colombiano. Objetivo: USD 20–40/mes por profesional.

# Reglas Estrictas de Código (OVERRIDE cualquier default)

1. **Idioma:** Todo artefacto técnico en **inglés** — código, SQL (tablas/columnas/ENUMs), commits, ramas, comentarios en código. La documentación (`docs/`) y conversaciones en español.
2. **Multi-tenant:** Toda interacción con BD usa RLS vía `TenantScope`; rol `sghcp_app` NOSUPERUSER. Sin excepciones.
3. **Dinero:** Todo cálculo financiero en PostgreSQL usando `NUMERIC`. Nunca floats.
4. **PII y datos clínicos:** Nombres, DNI, teléfono, SOAP son `BYTEA [AEA]` cifrados con DEK por paciente (AES-256-GCM + `MASTER_KEY`). Búsqueda solo por hash SHA-256. Nunca `LIKE` sobre cifrado.
5. **IA clínica:** El LLM recibe texto anonimizado. Whisper corre local (audio nunca sale). Los borradores IA (`ai_drafts`) son inmutables — el profesional aprueba explícitamente. La IA sugiere; el humano decide.

# Arquitectura

**Stack:** Go 1.21+ (chi, sqlc, golang-jwt v5, golang-migrate) · React TypeScript (TanStack Query, lucide-react) · PostgreSQL 16 · Python (Whisper + Claude `claude-sonnet-4-6`) · Redis Streams · Docker Compose · Caddy

**6 Bounded Contexts:**

| BC | Dominio | Tablas clave |
|---|---|---|
| BC-1 | Org & Auth | `organizations`, `users`, `roles`, `permissions`, `user_roles` |
| BC-2 | Staff & Perfiles | `professional_profiles` |
| BC-3 | Pacientes | `patients`, `encryption_keys`, `patient_staff_rel` |
| BC-4 | Agenda | `appointments` |
| BC-5 | Clínico | `clinical_records`, `consents`, `ai_drafts` |
| BC-6 | Facturación | `invoices`, `payments`, `billing_rates` |

# Layout del repo (rutas clave)

```
services/
  core-api/
    internal/<bc>/{handler,service,repository,dto}/  ← Go: un subdir por BC
    migrations/                                       ← 000NNN_<name>.{up,down}.sql
  frontend/
    src/
      pages/<Section>/          ← una carpeta por sección UI
      components/<section>/     ← componentes reutilizables por sección
      api/                      ← funciones de llamada HTTP (patients.ts, appointments.ts…)
      lib/                      ← helpers (age.ts, auth.ts…)
  ai-service/                   ← Python: Whisper + jobs Redis
```

**Mapa conceptual → archivo** (para no buscar innecesariamente):

| Concepto | Archivo(s) |
|---|---|
| Formulario nuevo paciente | `pages/Patients/NewPatientPage.tsx` |
| Modal editar paciente | `components/patients/EditPatientModal.tsx` |
| Página de la cita | `pages/Appointments/AppointmentPage.tsx` |
| Calendario / agenda | `pages/Dashboard/AgendaCalendar.tsx` |
| Facturación UI | `pages/Invoicing/` |
| BC-3 backend | `core-api/internal/patients/{handler,service,repository}` |
| BC-4 backend | `core-api/internal/appointments/{handler,service,repository}` |
| BC-6 backend | `core-api/internal/billing/{handler,service,repository}` |
| Migración nueva | `core-api/migrations/000NNN_<name>.up.sql` |

# Protocolo Operativo

- **Fail-closed** por defecto.
- **Respuestas tersas:** solo el código modificado, sin preámbulos.
- **Lee bajo demanda** (no siempre al inicio):
  - `docs/ai/ACTIVE_TASK.md` → léelo cuando el usuario diga "continúa" o "¿qué sigue?"; contiene el checklist de pendientes o la sugerencia de siguiente paso (lo escribe `/actualizar-contexto` al cerrar cada sesión)
  - `docs/project/STATUS.md` → estado actual, roadmap, bloqueantes, VPS
  - `docs/ai/BACKLOG.md` → ideas y tareas pendientes
  - `docs/history/CHANGELOG.md` → historial compactado

# Definition of Done (OVERRIDE)

Un cambio está terminado cuando `make verify` sale en verde. No antes, y no por
otro criterio.

```
make verify     # los mismos checks que el CI, en el mismo orden
make hooks      # una vez por clon: 'git push' corre make verify
```

Está prohibido reportar trabajo como hecho apoyándose en la parte de la suite
que se alcanzó a correr, en "los tests que toqué pasan", o en que compila. Si
`make verify` no se corrió, el estado que se reporta es "sin verificar", con esa
palabra.

`VERIFY_SKIP="frontend-test ai-test" make verify` existe para el loop local
rápido. Nunca para declarar algo terminado.

## Reglas sobre los tests

1. **Prohibido debilitar, saltar o borrar un test para que pase el build.**
   Esto incluye `t.Skip`, `it.skip`/`xit`, `@pytest.mark.skip`/`xfail`, comentar
   una aserción, aflojar una comparación, bajar un piso de cobertura y subir un
   presupuesto. Un test rojo es información; apagarlo la destruye y el diff que
   lo hace parece limpieza.
   El trinquete (`make skips`, `skip-budget.txt`) falla si el número de tests
   apagados sube. Si uno *tiene* que apagarse, se sube el presupuesto en el mismo
   commit y el motivo va en el mensaje: `scripts/check_skips.sh --bump`.
   Lo mismo para `scripts/check_coverage.sh --bump` y
   `scripts/check_bundle_size.sh --bump`: son decisiones, no arreglos.

2. **Si el test está mal, se arregla o se borra diciéndolo.** Borrar un test es
   legítimo cuando la garantía que cubría dejó de existir; lo ilegítimo es
   borrarlo porque estorba. La diferencia se escribe en el commit.

3. **Todo bug encontrado en producción entra primero como test que falla.**
   Se reproduce, se ve rojo, y sólo entonces se arregla. Sin excepción. Un
   arreglo sin test es el mismo bug esperando a volver, y el bug ya demostró que
   la suite no lo veía.

4. **Un hallazgo de seguridad se pinea con un test que falla antes del parche**,
   y el test se queda. Actualizar la dependencia deja el escáner en verde con la
   vulnerabilidad todavía viva (ver `chi.RealIP`, PR #250).

# Ramas (Libflow adaptado)

`main` protegido (solo PR aprobado) · `feature/*` · `enhancement/*` · `fix/*` · `hotfix/*`

Commits: `tipo(scope): descripción` — tipos: `feat`, `fix`, `test`, `refactor`, `chore`, `enhancement` — scope = BC: `auth`, `patients`, `agenda`, `billing`, `clinical`, `db`, etc.

# Comandos de Usuario (Skills)

Si el usuario escribe exactamente estos comandos, ejecuta la acción de forma robótica, sin saludos ni preámbulos:

- `save_state`: Checkpoint de emergencia mid-sesión (antes de un `/clear` forzado). Sobrescribe `docs/ai/ACTIVE_TASK.md` con: 1) Descripción de la tarea (máx 2 líneas), 2) Checklist de ítems — marca ✅ los completados y ⬜ los pendientes con el archivo exacto a tocar, 3) Último archivo modificado y su estado (compila/falla), 4) Próximo paso exacto tras el reinicio. Responde solo "Estado guardado". (Al cerrar sesión limpiamente usar `/actualizar-contexto`, que también escribe ACTIVE_TASK.md.)
- `backlog [texto]`: Analiza el texto y añádelo a `docs/ai/BACKLOG.md` bajo la categoría correcta (creándola si no existe). Bullet point con fecha de hoy. Responde "Idea registrada" y retoma la conversación.
