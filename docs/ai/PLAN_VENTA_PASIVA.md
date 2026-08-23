# Plan — Venta pasiva (vender sin intervenir)

**Fecha:** 2026-07-21 · **Objetivo:** que el funnel completo (descubrir → probar → pagar) funcione sin que Francisco tenga que dar demos ni intervenir, salvo cuando él quiera.

---

## Diagnóstico (revisado 2026-07-21)

Lo que ya es self-service y funciona:

- **Signup público** (`/signup`): crea org + owner, trial de 14 días, verificación por email, welcome email con oferta de tour y WhatsApp de soporte. Alertas al operador en signup y verificación (`auth/service/signup.go`).
- **Pago self-service**: checkout hosted de MercadoPago, estados de suscripción (`active`/`past_due`/`canceled`), gate por middleware, sección de facturación en Settings. Se permite pagar incluso con trial vencido.
- **Onboarding mínimo**: wizard al primer login (nombre, teléfono, PIN), omitible (`LoginPage.tsx`).
- **Landing** (repo `chapni`, Astro en Cloudflare Pages): precio, FAQ, seguridad, CTA de WhatsApp y signup.
- **Seed por tenant**: plantillas de consentimiento (4) al provisionar.

Brechas que hacen perder tráfico o exigir presencia de Francisco:

| # | Brecha | Impacto |
|---|---|---|
| 1 | No hay video demo en ninguna parte (landing sin sección de video) | Todo "muéstramelo" cae en Francisco |
| 2 | Cero emails de ciclo de vida del trial (sin nudge día 3, sin aviso de vencimiento) | Trials mueren en silencio |
| 3 | Sin checklist de primeros pasos in-app; el usuario nuevo cae en una app vacía | Baja activación |
| 4 | Sin programa de referidos (`referral_source` es solo atribución) | Se pierde el canal más barato |
| 5 | ~~Landing sin blog~~ Corrección: `/recursos/` ya existe con 6 artículos; falta la rutina quincenal | Tráfico orgánico aún incipiente |
| 6 | No listado en directorios de software | Leads pasivos sin explotar |
| 7 | Sin respuestas guardadas de WhatsApp | Cada pregunta cuesta tiempo de Francisco |

---

## Fase 1 — Que el tráfico que ya llega no se pierda

### 1.1 Video demo (reemplaza el "muéstramelo") — tarea de Francisco + landing
- Screen recording de 3–5 min: agenda → paciente → nota clínica → audio con IA → factura. Sin cara; voz en off o subtítulos.
- Claude genera el guion (escena por escena con tiempos).
- Subir a YouTube (unlisted o público) y embeber en la landing: componente nuevo `Demo.astro` en repo `chapni`, entre Hero y HowItWorks.
- El link del video se convierte en la respuesta guardada n.º 1 de WhatsApp.

### 1.2 Emails de ciclo de vida del trial — código (core-api)
- Nuevos métodos en `notify`: `TrialNudge` (día 3: "¿ya creaste tu primer paciente?") y `TrialEnding` (3 días antes y día 0, con link directo al checkout).
- Job diario (goroutine ticker o cron del contenedor) que consulta orgs en `trialing` por `trial_ends_at` y despacha. Idempotencia: tabla o clave Redis `trial_mail:<org>:<tipo>`.
- Respetar el patrón fail-open de emails (best-effort, `go func`).

### 1.3 Checklist de primeros pasos in-app — código (frontend + mínimo backend)
- Tarjeta en Dashboard visible durante el trial: ✅/⬜ crear primer paciente · agendar primera cita · crear primera nota (probar audio) · configurar tarifas.
- Estado derivado de datos reales (count de patients/appointments/records vía endpoints existentes), no de flags manuales.
- Se oculta al completarse o al pasar a `active`.

## Fase 2 — Multiplicadores

### 2.1 Referidos v1 (manual-light) — código pequeño
- Sección en Settings: "Invita a un colega" con link compartible `chapni.com/?ref=<slug>`.
- La landing propaga `ref` al signup; el signup ya guarda `referral_source` — solo prellenar con el slug.
- Recompensa (mes gratis) se aplica manual al inicio: la alerta de signup ya muestra el source, Francisco extiende `current_period_end` desde SuperAdmin. Automatizar solo si hay volumen.

### 2.2 Respuestas guardadas de WhatsApp — doc, sin código
- 6 respuestas listas: video demo · precio y cómo pagar · seguridad/cifrado y Ley 1090 · cómo empezar (link signup) · migración de datos · soporte.
- Redactadas con las reglas anti-IA de copy. Entregable: `docs/project/WHATSAPP_RESPUESTAS.md` + guardarlas en la app de WhatsApp Business.

### 2.3 Directorios de software — ~~DESCARTADO 2026-08-21~~
> Francisco los revisó uno por uno el 2026-08-21 y decidió que no valen la pena. Con esto
> se cae la palanca de backlinks que la sección de SEO daba por hecha: la autoridad tiene
> que venir de contenido propio y de prueba social real.

- ~~Capterra, GetApp, Software Advice, ComparaSoftware, appvizer (es).~~
- Assets necesarios: logo, 4–6 screenshots (con datos de ejemplo, nunca reales), descripción corta/larga, categoría (EHR / práctica de psicología), link con UTM.

## Fase 3 — Crecimiento compuesto

### 3.1 Contenido SEO en la landing (repo `chapni`) — YA EXISTE como `/recursos/`
- Corrección (2026-07-21): la landing ya tiene la colección `src/content/recursos/` con 6
  artículos publicados (Ley 1090, Resolución 1995, habeas data, SOAP, consentimiento, cómo
  elegir software). No hay que crear el blog; la tarea es la rutina: 1 artículo/quincena
  nuevo en `/recursos/` con CTA al trial.

### 3.2 Métricas de activación
- Medir % de signups verificados que crean primer paciente / primera cita en 7 días (funnel real). Base para decidir si hace falta modo con datos de ejemplo.

### 3.3 Datos de ejemplo para tenants nuevos (condicional)
- Solo si las métricas de 3.2 muestran caída fuerte en la primera sesión: seed opcional de 2–3 pacientes ficticios marcados como demo, borrables en un clic.

---

## Orden de ejecución sugerido

1. **1.2 emails de trial** y **1.3 checklist** (código, esta semana — evitan que los trials actuales mueran).
2. **1.1 video** (Francisco graba; guion y sección de landing los hace Claude).
3. **2.2 respuestas WhatsApp** (30 min) y **2.1 referidos v1** (código pequeño).
4. ~~2.3 directorios~~ — descartado 2026-08-21.
5. **3.1 blog** como rutina quincenal.

**Nota:** los precios B2B por tramo NO se publican aún — las entrevistas van primero (ver `PLAN_B2B_COMERCIAL.md`).
