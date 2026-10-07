# frontend (React + TypeScript)

La aplicación de `app.chapni.com`. Vite, TanStack Query, lucide-react. Versiones en
`package.json`. Las reglas generales están en el `AGENTS.md` de la raíz.

## Cómo está organizado

| Qué | Dónde |
|---|---|
| Rutas | `src/App.tsx` |
| Una carpeta por sección de la UI | `src/pages/` |
| Componentes reutilizables por sección | `src/components/` (los genéricos en `src/components/ui/` y `src/components/common/`) |
| Llamadas HTTP, una por área | `src/api/` (base en `src/api/client.ts`) |
| Sesión y usuario | `src/context/AuthContext.tsx` |
| Helpers puros con su test al lado | `src/lib/` |
| Tokens de marca | `src/styles/global.css` |

Atajos frecuentes:

| Concepto | Archivo |
|---|---|
| Formulario de paciente nuevo | `src/pages/Patients/NewPatientPage.tsx` |
| Modal de editar paciente | `src/components/patients/EditPatientModal.tsx` |
| Página de la cita (sesión, grabación) | `src/pages/Appointments/AppointmentPage.tsx` |
| Calendario del dashboard | `src/pages/Dashboard/AgendaCalendar.tsx` |
| Revisión del borrador IA | `src/pages/AIDrafts/AIDraftPage.tsx` |
| Suscripción y cobros | `src/pages/Billing/BillingPage.tsx` |
| Grabación y subida por partes | `src/lib/recording.ts`, `src/lib/partUploader.ts` |

## Reglas

- **Lo que se guarda en el navegador sobrevive a la expiración de la sesión a propósito.** Los borradores de
  nota (`sghcp_record_draft_*` en localStorage) y las grabaciones pendientes (IndexedDB,
  `src/lib/recordingStore.ts`) existen para que una psicóloga no pierda la sesión si se le cae la
  red. Que sobrevivan a la expiración tiene test en `src/api/client.test.ts`.
- **Marca Chapni.** Índigo `#363285` y oro `#d9a038` desde los tokens de `src/styles/global.css`,
  nunca hex sueltos. Un botón oro lleva texto tinta, nunca blanco sobre oro. Fraunces para display,
  DM Sans para la UI, DM Mono para datos. La landing (repo hermano) usa los mismos tokens.
- **Textos de la UI en español de Colombia**, sin guion largo, sin flechas en listas y sin jerga
  técnica: el usuario nunca ve "markdown", "widget", "parse" ni "schema".
- **Presupuesto de bundle** en `bundle-budget.txt`, vigilado por el trinquete de la raíz. Si un
  cambio lo excede, se busca qué cargar en diferido antes de pensar en subirlo.

## Comandos

```
npm run dev      # Vite
npx tsc --noEmit # tipos
npm run lint     # ESLint
npm test         # Vitest
```

Los cuatro corren dentro de `make verify` desde la raíz.
