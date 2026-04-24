# ADR-005: Framework y Stack del Frontend

- **Estado:** Aceptado
- **Fecha:** 2026-04-23
- **Autores:** Equipo de Arquitectura

## Contexto

El SGHCP tiene cuatro actores con interfaces diferentes:

| Actor | Pantallas críticas | Dispositivo |
|---|---|---|
| Profesional / Psicóloga | Agenda diaria, historia clínica, aprobación IA, evolución del paciente | Desktop / tablet |
| Recepcionista | Agenda, registro de pacientes, cobros | Desktop |
| Admin | Configuración, usuarios, reportes | Desktop |
| Paciente | Ver citas, firmar consentimientos | Móvil principalmente |

El frontend debe resolver cinco retos técnicos que condicionan la elección del stack:

1. **Aprobación del borrador IA** — la pantalla más compleja: vista dividida con el borrador a la izquierda y el formulario SOAP editable a la derecha, con resaltado de cambios.
2. **Visualización longitudinal de escalas** — gráficas de evolución del PHQ-9, GAD-7 por sesión.
3. **Agenda / calendario** — vista diaria, semanal y mensual con drag-and-drop para reagendar.
4. **Formularios clínicos complejos** — registros SOAP con múltiples secciones, validación en tiempo real, autosave de borradores.
5. **PWA con modo offline** — el profesional puede registrar notas básicas sin internet; la agenda es legible offline.

El frontend **no es un sitio público** — todas las páginas requieren autenticación. SEO no es un criterio.

## Decisión

**React 18 + TypeScript + Vite** como SPA (Single Page Application).

- **Bootstrap:** archivos estáticos servidos por **Caddy** desde el mismo VPS. `vite build` genera `/dist/`, que Caddy sirve directamente.
- **Cloud:** CloudFront + S3 cuando el volumen justifique la separación.

## Stack completo seleccionado

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | React 18 | Mayor ecosistema para los 5 retos técnicos listados |
| Lenguaje | TypeScript (strict mode) | Type safety + autocompletion en formularios clínicos complejos |
| Build tool | Vite 5 | HMR instantáneo en dev; bundling optimizado en prod |
| Router | React Router v6 | Estándar de facto para SPAs React |
| Server state | TanStack Query v5 | Cache, refetch, optimistic updates — ideal para agenda en tiempo real |
| UI state | Zustand | Minimalista; para UI state local (modales, notificaciones, lock screen) |
| Component library | shadcn/ui | Headless + accesible + Tailwind; código propio (no rompe por updates de npm) |
| Styling | Tailwind CSS v3 | Consistencia sin CSS global; tree-shaking automático |
| Forms | React Hook Form + Zod | Mejor rendimiento en formularios SOAP largos; validación compartida con el backend |
| Tablas | TanStack Table v8 | Virtualización para listas de pacientes largas; columnas configurables |
| Calendario | FullCalendar (React) | El más maduro para agenda clínica; soporta drag-and-drop y recursos |
| Gráficas | Recharts | Composable; ideal para gráficas de evolución de escalas psicométricas |
| PDF viewer | react-pdf | Preview de consentimientos antes de aprobar o imprimir |
| Upload | react-dropzone | Drag-and-drop para escaneos físicos de consentimientos |
| PWA | vite-plugin-pwa + Workbox | Service worker generado automáticamente; estrategia offline-first para agenda |
| Testing | Vitest + React Testing Library | Co-located con Vite; sin Jest configuration overhead |
| Linting | ESLint + eslint-plugin-react-hooks | Detecta errores de hooks y dependencias |

## Alternativas evaluadas

### Next.js

**Descartado.** Next.js agrega valor principalmente por SSR y SSG — útiles cuando hay páginas públicas que necesitan SEO o carga inicial muy rápida para usuarios no autenticados. En el SGHCP, el 100% de las páginas están detrás de autenticación. SSR agrega complejidad de despliegue (requiere un servidor Node, no puede servirse desde S3 puro) sin ningún beneficio funcional. El hidratación en cliente también introduce una clase de bugs difíciles de depurar en formularios complejos.

### Vue 3 + Nuxt

**Descartado.** Vue 3 tiene excelentes capacidades para formularios. Sin embargo:
- El ecosistema de gráficas (Recharts/Victory/Nivo) es significativamente más maduro en React.
- FullCalendar tiene mejor integración y documentación para React.
- El pool de talento en Colombia para React es considerablemente mayor que Vue.
- shadcn/ui y TanStack son React-first y los mejores en sus categorías.

### Angular

**Descartado.** Overkill para el tamaño del equipo y del proyecto. La curva de aprendizaje es alta y la velocidad de desarrollo inicial es menor.

## Decisiones de arquitectura frontend

### Sin BFF (Backend for Frontend)

El `core-api` en Go sirve directamente al frontend. No se necesita una capa BFF intermedia — agregaría un hop de red y un servicio más que mantener. Si en el futuro el frontend necesita agregaciones complejas, se añaden endpoints específicos en `core-api`.

### Carga de archivos directamente a S3 (presigned URLs)

Los escaneos de consentimientos y los audios de sesión **nunca pasan por `core-api`**. El flujo es:

```
Frontend → core-api: "necesito URL para subir audio de 45 min"
core-api → AWS S3: genera presigned URL (15 min de validez)
core-api → Frontend: devuelve la presigned URL
Frontend → S3: PUT directo con la presigned URL
Frontend → core-api: "el upload terminó, aquí está el S3 key"
core-api: valida, cifra el S3 key (AEA), guarda en BD
```

Esto evita que el binario de audio pase por el servidor de aplicación (que no tiene GPU ni memoria para eso).

### Módulos por feature flag

El frontend lee `organizations.features` en el JWT o en un endpoint de configuración al login. Los módulos desactivados no cargan su código (lazy loading por ruta):

```typescript
// La ruta de billing solo existe si el módulo está activo
if (org.features.module_billing) {
  routes.push({ path: '/billing', component: lazy(() => import('./billing/BillingModule')) })
}
```

### La pantalla de aprobación IA — la más crítica

Es la pantalla que justifica la elección de React y define el diseño de componentes:

```
┌─────────────────────────┬──────────────────────────────┐
│  BORRADOR IA (read-only)│  REGISTRO CLÍNICO (editable) │
│                         │                              │
│  Subjetivo:             │  Subjetivo: ____________     │
│  "El paciente refiere   │  [texto editable]            │
│   dificultades para..." │                              │
│  ↑ resaltado en verde   │  Objetivo: ______________    │
│    si el prof. acepta   │  [texto editable]            │
│                         │                              │
│  Objetivo:              │  Evaluación: ____________    │
│  "Se observa afecto..." │                              │
│                         │  Plan: __________________    │
│  [COPIAR SECCIÓN ↑]     │                              │
│  [IGNORAR]              │  ┌──────────────────────┐    │
│                         │  │  APROBAR Y FIRMAR    │    │
│                         │  │  (requiere 2 clicks) │    │
│                         │  └──────────────────────┘    │
└─────────────────────────┴──────────────────────────────┘
```

Regla de UX: el botón "APROBAR Y FIRMAR" requiere confirmación explícita (dos interacciones). El registro oficial nunca se crea por accidente.

### Lock screen (sin logout completo)

Entre sesiones de pacientes, el profesional puede bloquear la pantalla sin cerrar sesión. Un PIN o la contraseña desbloquea. Esto evita que datos queden visibles si alguien pasa por el consultorio, sin obligar a re-autenticarse con MFA cada 60 minutos.

```typescript
// Zustand store
interface SessionStore {
  isLocked: boolean
  lock: () => void
  unlock: (pin: string) => Promise<boolean>
  autoLockAfterMs: number  // configurable por org
}
```

### PWA — estrategia offline

| Recurso | Estrategia | Justificación |
|---|---|---|
| Agenda del día | Cache first (24h) | Lectura frecuente; puede estar desactualizada máx 24h |
| Lista de pacientes | Network first + cache fallback | Necesita datos actuales; cache como respaldo |
| Formularios de historia | Network only | Nunca escribir registros clínicos offline sin confirmación |
| Assets estáticos | Cache first (versioned) | JS/CSS con hash en nombre — siempre frescos |

El service worker muestra un banner "Sin conexión — modo lectura" cuando detecta que está offline. Los formularios de historia clínica se deshabilitan en offline para no crear inconsistencias.

## Estructura de carpetas del frontend

```
services/frontend/
├── src/
│   ├── app/              ← Router, providers, lazy routes
│   ├── features/         ← Un directorio por dominio de negocio
│   │   ├── auth/
│   │   ├── patients/
│   │   ├── scheduling/
│   │   ├── clinical/     ← SOAP forms, AI approval, assessments
│   │   ├── billing/      ← Módulo condicional (feature flag)
│   │   └── admin/
│   ├── shared/
│   │   ├── ui/           ← shadcn/ui components (copiados, no npm dep)
│   │   ├── hooks/        ← usePatient, useAppointments, etc.
│   │   ├── api/          ← TanStack Query hooks por recurso
│   │   └── lib/          ← utils, formatters, zod schemas
│   └── pwa/              ← Service worker config, offline logic
├── public/
├── vite.config.ts
└── tailwind.config.ts
```

La organización es **por feature, no por tipo de archivo** — `patients/` tiene sus componentes, hooks, queries y tipos juntos. Escala mejor cuando los features crecen.

## Consecuencias

- **Positivas:** Ecosistema maduro para los 5 retos técnicos; shadcn/ui da accesibilidad sin costo; lazy loading mantiene el bundle inicial pequeño; sin SSR simplifica el despliegue a S3 puro.
- **Negativas:** SPA pura tiene TTFB más alto que SSR en la carga inicial — mitigado en Bootstrap con Caddy compresión gzip/br y HTTP/2; en cloud con CloudFront CDN.
- **Pool de talento:** React + TypeScript es el stack más común en Colombia — facilita incorporar desarrolladores.
