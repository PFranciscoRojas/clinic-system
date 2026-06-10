# PR 1 — Agenda Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 500 on "Iniciar sesión" (missing `IN_PROGRESS` enum value), reduce agenda session types to 3, and remove every user-visible "SOAP" string.

**Architecture:** One DB migration (enum value) + string/constant edits in 5 frontend files. No Go code changes, no API changes.

**Tech Stack:** PostgreSQL 16 (golang-migrate), React + TypeScript (Vite).

**Branch:** `fix/agenda-session-start-and-soap-cleanup` (already created, contains the spec).

**Repo:** `/Users/frarojas/AProjects/clinic-system`

---

### Task 1: Migration 000009 — add IN_PROGRESS to appointment_status

**Files:**
- Create: `services/core-api/migrations/000009_appointment_in_progress.up.sql`
- Create: `services/core-api/migrations/000009_appointment_in_progress.down.sql`

**Context:** The ENUM `appointment_status` (migration 000001, line 11) lacks `IN_PROGRESS`. Backend (`internal/appointments/service/update_status.go:10`) and frontend already send it → Postgres rejects → 500.

- [ ] **Step 1: Write the up migration**

```sql
-- 000009_appointment_in_progress.up.sql
-- The Go service and the frontend already use IN_PROGRESS
-- (services/core-api/internal/appointments/service/update_status.go);
-- the ENUM was simply missing the value, causing a 500 on session start.
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS' AFTER 'CONFIRMED';
```

- [ ] **Step 2: Write the down migration**

```sql
-- 000009_appointment_in_progress.down.sql
-- PostgreSQL cannot remove a value from an ENUM type.
-- Intentional no-op: rolling back would require recreating the type and
-- rewriting the appointments table.
SELECT 1;
```

- [ ] **Step 3: Verify the migration applies cleanly on the local dev DB**

Run from repo root (dev compose must be up; if it is not running, start it with `docker compose up -d postgres`):
```bash
make migrate-up
```
Expected: `000009/u appointment_in_progress` applied without error.
Then verify:
```bash
docker compose exec -T postgres psql -U postgres -d sghcp -c "SELECT unnest(enum_range(NULL::appointment_status));"
```
Expected output includes `IN_PROGRESS`.
(If the local dev DB is not available, note it and rely on CI/prod migrate during deploy — the SQL is a single additive statement.)

- [ ] **Step 4: Commit**

```bash
git add services/core-api/migrations/000009_appointment_in_progress.up.sql services/core-api/migrations/000009_appointment_in_progress.down.sql
git commit -m "fix(appointments): add IN_PROGRESS to appointment_status enum"
```

---

### Task 2: Agenda session types → 3

**Files:**
- Modify: `services/frontend/src/pages/Appointments/NewAppointmentPage.tsx:30-37` (SESSION_TYPES) and `:4-10` (icon imports)

- [ ] **Step 1: Replace SESSION_TYPES**

Replace lines 30–37 with:

```tsx
const SESSION_TYPES: SessionType[] = [
  { id: 'initial',   label: 'Sesión inicial', icon: UserPlus,  duration: 60, color: '#0d9488' },
  { id: 'followup',  label: 'Seguimiento',    icon: RefreshCw, duration: 50, color: '#0d9488' },
  { id: 'discharge', label: 'Sesión de alta', icon: Award,     duration: 50, color: '#0d9488' },
];
```

Removed: `psychometric` (Evaluación psicométrica), `crisis` (Atención en crisis), `family` (Sesión familiar) — aligned with the 3 clinical record formats (INITIAL/EVOLUTION/DISCHARGE).

- [ ] **Step 2: Remove now-unused icon imports**

In the `lucide-react` import (lines 4–10), remove `ClipboardList`, `TriangleAlert`, `Users` — but FIRST verify each is not used elsewhere in the file:

```bash
grep -n "ClipboardList\|TriangleAlert\|Users" services/frontend/src/pages/Appointments/NewAppointmentPage.tsx
```
Only remove an import if its sole occurrence was the deleted SESSION_TYPES entries.

- [ ] **Step 3: Type-check**

```bash
cd services/frontend && npx tsc --noEmit
```
Expected: no errors (unused-import errors here mean Step 2 missed something).

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/pages/Appointments/NewAppointmentPage.tsx
git commit -m "feat(appointments): reduce agenda session types to the 3 clinical formats"
```

---

### Task 3: Remove user-visible "SOAP" from AppointmentPage

**Files:**
- Modify: `services/frontend/src/pages/Appointments/AppointmentPage.tsx:451` and `:469`

- [ ] **Step 1: Replace the two visible strings**

Line 451: `<FileText size={14} /> Crear registro SOAP` → `<FileText size={14} /> Crear registro clínico`

Line 469: `Audio → Whisper → SOAP automático` → `Audio → transcripción → borrador automático`

- [ ] **Step 2: Rename internal state for clarity (cheap, same file)**

Rename `showSOAPForm` → `showRecordForm` (occurrences at lines 181, 250, 402, 404, 412, 435, 439, 448 — use editor replace-all within the file).

- [ ] **Step 3: Verify no visible SOAP remains and type-check**

```bash
grep -n "SOAP" services/frontend/src/pages/Appointments/AppointmentPage.tsx
cd services/frontend && npx tsc --noEmit
```
Expected: grep returns nothing; tsc passes.

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/pages/Appointments/AppointmentPage.tsx
git commit -m "fix(appointments): remove SOAP wording from appointment page"
```

---

### Task 4: Legacy record viewer without "SOAP" branding (ClinicalRecordPage)

**Files:**
- Modify: `services/frontend/src/pages/ClinicalRecords/ClinicalRecordPage.tsx:15-20` and any visible string found by grep

**Context:** This page still renders legacy v1 records (4 encrypted SOAP columns). Old records MUST stay readable (Resolución 1995/1999) — only the on-screen wording changes.

- [ ] **Step 1: Rename the section constant and drop the acronym from labels**

Replace lines 15–20 with:

```tsx
// Legacy v1 records (pre-template era) store four fixed sections.
const LEGACY_SECTIONS = [
  { key: 'subjective' as const, label: 'Relato del paciente',     description: 'Lo que reporta el paciente en sus propias palabras.' },
  { key: 'objective'  as const, label: 'Observación clínica',     description: 'Observaciones clínicas, comportamiento y apariencia.' },
  { key: 'assessment' as const, label: 'Análisis',                description: 'Análisis clínico y avance terapéutico.' },
  { key: 'plan'       as const, label: 'Plan',                    description: 'Intervenciones, tareas y próximos pasos.' },
];
```

Update the two usages (`SOAP_SECTIONS` at line 168 and the comment at line 157) to `LEGACY_SECTIONS` / `legacy sections`.

- [ ] **Step 2: Check for other visible "SOAP" strings in the file**

```bash
grep -n "SOAP\|soap" services/frontend/src/pages/ClinicalRecords/ClinicalRecordPage.tsx
```
The `soapEdit` state variable may remain (internal); any user-visible string must be reworded. If a header/title says "SOAP", change it to "Registro (formato anterior)".

- [ ] **Step 3: Type-check**

```bash
cd services/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/pages/ClinicalRecords/ClinicalRecordPage.tsx
git commit -m "fix(clinical-records): de-brand legacy SOAP viewer labels"
```

---

### Task 5: SettingsPage cleanup

**Files:**
- Modify: `services/frontend/src/pages/Settings/SettingsPage.tsx:510-514, 540, 565-567, 822` (plus the Toggle at the line found by grep for "borrador SOAP")

- [ ] **Step 1: Rename styles constant and visible strings**

- Line 510: `const SOAP_STYLES = [` → `const NOTE_STYLES = [` (update usage at line 567).
- Line 540: `Genera borradores SOAP desde el audio de sesión.` → `Genera borradores de nota clínica desde el audio de sesión.`
- Line 565: `<FieldRow label="Formato SOAP" sub="Cómo estructura el texto la IA">` → `<FieldRow label="Formato de nota" sub="Cómo estructura el texto la IA">`
- Find the notifications Toggle containing `borrador SOAP` and change to `borrador IA`:
```bash
grep -n "borrador SOAP" services/frontend/src/pages/Settings/SettingsPage.tsx
```

- [ ] **Step 2: Remove the demo "SOAP estándar" template entry**

In `TemplatesSection` (line 821–825), delete the entry `{ id: 1, name: 'SOAP estándar', ... }` so the demo list keeps only "Sesión inicial" and "Alta terapéutica".

- [ ] **Step 3: Verify and type-check**

```bash
grep -n "SOAP" services/frontend/src/pages/Settings/SettingsPage.tsx
cd services/frontend && npx tsc --noEmit
```
Expected: only the internal localStorage key `soapStyle` may remain (kept for backward compatibility of saved prefs); everything visible is clean.

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/pages/Settings/SettingsPage.tsx
git commit -m "fix(settings): remove SOAP wording and demo SOAP template"
```

---

### Task 6: AIDraftPage cleanup

**Files:**
- Modify: `services/frontend/src/pages/AIDrafts/AIDraftPage.tsx:21-32` and the string at the line containing `generando el SOAP`

- [ ] **Step 1: Rename interface/constant and labels**

Replace lines 21–32 with:

```tsx
interface DraftSection {
  key: 'subjective' | 'objective' | 'assessment' | 'plan';
  label: string;
  description: string;
}

// The v1 AI pipeline still emits four fixed sections; only the wording changed.
const DRAFT_SECTIONS: DraftSection[] = [
  { key: 'subjective', label: 'Relato del paciente', description: 'Lo que reporta el paciente: síntomas, sentimientos, preocupaciones en sus propias palabras.' },
  { key: 'objective',  label: 'Observación clínica', description: 'Observaciones clínicas: comportamiento, afecto, apariencia, pruebas aplicadas.' },
  { key: 'assessment', label: 'Análisis',            description: 'Análisis clínico, diagnóstico diferencial, avance terapéutico.' },
  { key: 'plan',       label: 'Plan',                description: 'Intervenciones, tareas, próximos pasos, ajustes al tratamiento.' },
];
```

Update usages (`SOAP_SECTIONS.map` near line 181, `{/* SOAP Content */}` near line 170).

- [ ] **Step 2: Fix the progress string**

Find and replace: `el modelo IA está generando el SOAP` → `el modelo IA está generando el borrador`.

```bash
grep -n "SOAP" services/frontend/src/pages/AIDrafts/AIDraftPage.tsx
```
Expected after edits: nothing user-visible (internal `soapEdit` state may remain).

- [ ] **Step 3: Type-check + build**

```bash
cd services/frontend && npx tsc --noEmit && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/frontend/src/pages/AIDrafts/AIDraftPage.tsx
git commit -m "fix(ai-drafts): rename SOAP wording to draft sections"
```

---

### Task 7: Final sweep, CHANGELOG, PR

- [ ] **Step 1: Repo-wide sweep for remaining user-visible SOAP**

```bash
grep -rn "SOAP" services/frontend/src --include="*.tsx" --include="*.ts"
```
Expected: only internal identifiers (`soapEdit`, `soapStyle` localStorage key) or none. Anything rendered to the user must be fixed before proceeding.

- [ ] **Step 2: Update CHANGELOG.md under [Unreleased]** (English, user-facing lines)

```markdown
### Fixed
- "Start session" no longer fails with a 500 — `IN_PROGRESS` added to the appointment status enum
- All user-visible "SOAP" wording removed (appointment page, settings, legacy record viewer, AI drafts)

### Changed
- Agenda session types reduced to the 3 clinical formats: initial, follow-up, discharge
```

- [ ] **Step 3: Backend safety check**

```bash
cd services/core-api && go build ./... && go test ./...
```
Expected: PASS (no Go changes, but verify nothing broke).

- [ ] **Step 4: Commit, push, open PR**

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for agenda fixes"
git push -u origin fix/agenda-session-start-and-soap-cleanup
gh pr create --title "fix: agenda session start 500, 3 session types, SOAP wording removal" --body "$(cat <<'EOF'
## Summary
- Migration 000009: add `IN_PROGRESS` to `appointment_status` ENUM — fixes the 500 on "Iniciar sesión"
- Agenda session types reduced to 3 (initial / follow-up / discharge), aligned with clinical record formats
- All user-visible "SOAP" wording removed (legacy records stay readable per Resolución 1995/1999)

Spec: docs/superpowers/specs/2026-06-09-consents-and-agenda-fixes-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Post-merge deploy note (VPS):** `git pull` requires the documented stash-dance (`git stash push Makefile docker-compose.yml` → pull → `git stash pop`), then run the migration with the `migrate/migrate` image per VPS Makefile, rebuild frontend locally (`npm run build`) and `rsync` `dist/` to the VPS (no node on the VPS), and recreate the api container.
