# Plan — Guía del sistema (libro con pantallazos)

**Fecha:** 2026-07-21 · **Decisión:** el video demo v1 se descarta; el material de referencia
será una guía pública tipo libro, navegable por capítulos, con pantallazos reales. Quien quiera
ver algo específico va directo al capítulo, sin video.

## Dónde vive

- Repo `chapni` (landing Astro): colección nueva `src/content/guia/` + páginas `chapni.com/guia/`.
- Misma mecánica que `/recursos/`: un `.md` por capítulo con frontmatter, layout con índice
  lateral fijo (el "lomo del libro") y navegación anterior/siguiente.
- Pública e indexable: cada capítulo apunta a búsquedas reales ("cómo crear un paciente en
  Chapni", "firma de consentimiento remota"). CTA al trial al final de cada capítulo.
- Doble uso: manual para clientes actuales (soporte por WhatsApp responde con el link del
  capítulo) y material de venta para quien evalúa.

## Los pantallazos

- Se capturan con el pipeline Playwright ya montado (org de prueba "Consultorio Valentina
  Ríos", script guardado en memoria) — regenerables con un comando cuando cambie la UI.
- Resolución 1600×900 @2x, mismos datos ficticios siempre (Laura Cardona, Andrés Zapata,
  Camila Herrera, Daniela Pardo). Nunca datos reales.
- Guardados en `chapni/src/assets/guia/<capitulo>/<nn>-<slug>.png`; Astro los optimiza.
- Recortes cuando el contexto completo no aporta (p. ej. solo el formulario, no toda la página).

## Estructura del libro (10 capítulos)

| # | Capítulo | Pantallazos clave | Estado previo necesario |
|---|---|---|---|
| 1 | Primeros pasos: crea tu cuenta | signup, correo de verificación, onboarding (nombre/PIN), acuerdo de datos | ninguno |
| 2 | Tu día en Chapni | dashboard con agenda, inbox clínico, checklist primeros pasos, calendario | citas sembradas ✅ |
| 3 | Pacientes | lista, formulario nuevo paciente (vacío y lleno), ficha completa, editar, buscar | pacientes sembrados ✅ |
| 4 | Citas y agenda | nueva cita (wizard), estados, reagendar, página pública de reservas, recordatorios email/WhatsApp | cita + booking page |
| 5 | Historia clínica | nota nueva, plantillas clínicas, nota por audio (grabar/subir), borrador IA, aprobar, adenda, exportar PDF | requiere 1 audio procesado |
| 6 | Consentimientos | plantillas, firma en consultorio, firma remota (link + email), estado firmado | flujo de firma con Laura |
| 7 | Facturación | tarifas, nueva factura, registrar pago, recibo PDF, pagos en línea MercadoPago, recordatorio de saldo | tarifa ✅ + 1 factura |
| 8 | Configuración y equipo | perfil profesional, horario, notificaciones, asistente IA, seguridad/PIN, invitar usuarios, Google Calendar, WhatsApp | parcial |
| 9 | Tu plan en Chapni | prueba gratuita, activar plan, pago, referidos ("Invita a un colega") | ✅ |
| 10 | Seguridad y cumplimiento | sin pantallazos pesados: diagrama de cifrado, tabla de leyes (1090, 1581, Res. 1995) | reusar guía Ley 1090 |

## Fases de producción

1. **Fase A (sin dependencias):** ✅ COMPLETADA 2026-07-22 — capítulos 2, 3, 9 en vivo en
   chapni.com/guia (commit `1436bd5` repo chapni). Esqueleto Astro completo: índice con 10
   capítulos, template de capítulo con lomo lateral, anterior/siguiente, CTA, JSON-LD.
   Scripts regenerables en `chapni/scripts/guia/` (credenciales por env vars). Detalle
   técnico: `imageService: 'compile'` en astro.config.mjs (Workers no tiene /_image).
2. **Fase B (flujos por ejecutar):** capítulos 4, 7, 6, 8, 1 — ver plan detallado abajo.
3. **Fase C (pipeline IA):** capítulo 5 (audio real por Whisper en VPS, avisar antes) y
   capítulo 10 (material legal existente, sin pantallazos del sistema).

## Plan detallado — Fase B

Orden elegido para encadenar datos: la cita del cap 4 alimenta la factura del cap 7; el
consentimiento del cap 6 usa a Laura Cardona; el cap 1 va al final porque necesita una org
desechable nueva. Un script Playwright por capítulo (`guia-cap0N.mjs`), un `.md` por capítulo.

### Cap 4 — Citas y agenda (`citas-y-agenda.md`)
- [ ] Wizard de nueva cita paso a paso (paciente → fecha/hora → modalidad): 2-3 capturas.
- [ ] Agenda con estados visibles (pendiente/confirmada/completada) — ya hay citas sembradas.
- [ ] Reagendar una cita (modal o drag).
- [ ] Página pública de reservas `app.chapni.com/book/consultorio-valentina-rios`
      (verificada activa 2026-07-22: `/api/v1/public/org` responde para la org demo).
- [ ] Configuración de recordatorios (email/WhatsApp) — captura de la pantalla de ajustes.

### Cap 7 — Facturación (`facturacion.md`)
- [ ] Ejecutar el flujo real: factura sobre una cita completada de Laura → registrar pago
      → recibo PDF. La factura queda en la org demo (datos ficticios, sin problema).
- [ ] Capturas: tarifario (ya existe del cap 9), nueva factura, lista de facturas con
      estados, registrar pago, recibo PDF, sección MercadoPago (estado "conectar" — la org
      demo no está conectada y así se muestra el flujo), recordatorio de saldo.

### Cap 6 — Consentimientos (`consentimientos.md`)
- [ ] Ejecutar el flujo real con Laura Cardona: elegir plantilla → firma remota (generar
      link, abrirlo en contexto incógnito para capturar la vista del paciente, firmar) →
      estado firmado. También captura de la firma en consultorio (canvas).
- [ ] El consentimiento firmado queda registrado en la org demo — correcto, es ficticio.

### Cap 8 — Configuración y equipo (`configuracion-y-equipo.md`)
- [ ] Solo capturas, sin flujos: perfil profesional, horario de atención, notificaciones,
      asistente IA, seguridad/PIN, invitar usuario (modal abierto, sin enviar), Google
      Calendar (estado desconectado), WhatsApp.

### Cap 1 — Primeros pasos (`primeros-pasos.md`)
- [ ] Necesita cuenta nueva: signup real con `franciscorojas92+guia1@gmail.com`.
- [ ] Capturas: formulario de registro, correo de verificación (desde Gmail), onboarding
      (nombre/PIN), acuerdo de tratamiento de datos.
- [ ] Al terminar: desactivar la org desechable en BD del VPS (superusuario `sghcp_admin`).

## Plan detallado — Fase C

### Cap 5 — Historia clínica (`historia-clinica.md`)
- [ ] **Prerrequisito:** un audio de sesión ficticia (2-3 min). Opciones: Francisco graba
      leyendo un guion ficticio (mejor calidad de demo) o TTS. Preparar el guion primero.
- [ ] **Avisar a Francisco antes de correr Whisper en el VPS** (RTF ~0,15: 3 min de audio
      ≈ 30 s de CPU). Runbook existente en `scripts/e2e_audio/`.
- [ ] Capturas: nota nueva, los 4 formatos clínicos, grabar/subir audio, transcripción,
      borrador IA (inmutable), aprobación explícita, adenda, exportar PDF.

### Cap 10 — Seguridad y cumplimiento (`seguridad-y-cumplimiento.md`)
- [ ] Sin pantallazos del sistema: redactar reutilizando el material de Ley 1090/1581 y
      Res. 1995 que ya está en `/recursos/` y `/seguridad`.
- [ ] Diagrama simple de cifrado (SVG estático con la paleta de marca, no imagen pesada).

## Cierre del funnel (después de la guía o en paralelo)

- [ ] `[LINK_VIDEO]` en `docs/project/WHATSAPP_RESPUESTAS.md` → reemplazar por
      `chapni.com/guia` (decisión tomada: la guía sustituye al video).
- [ ] Enlazar la guía desde la home de la landing y desde `/precios` (sección "cómo funciona").
- [ ] Alta en directorios: Capterra, GetApp, ComparaSoftware — necesita que Francisco cree
      las cuentas; los pantallazos de la guía sirven como material.
- [ ] Rutina blog `/recursos/`: 1 artículo por quincena (hay uno en borrador local).
- [ ] Métricas de activación (backlog clinic-system).
- [ ] Precios B2B por tramos: sigue bloqueado por entrevistas (PLAN_B2B_COMERCIAL.md).

## Criterios de redacción

- Reglas anti-IA de copy de la marca: sin guion largo, sin negrita decorativa, frases directas,
  cadencia variada. Texto que acompaña, no que rellena: cada pantallazo con 2-4 líneas máximo.
- Título de capítulo = la pregunta que la gente busca. Secciones con anclas (`#firma-remota`)
  para que soporte pueda linkear directo a la sección exacta.
- Cada capítulo cierra igual: "¿Listo para probarlo? 14 días gratis" → signup.

## Mantenimiento

- Al cambiar una pantalla del sistema, regenerar solo los pantallazos del capítulo afectado
  (scripts por capítulo: `guia-cap03.mjs`, etc., versionados en el repo `chapni`, no en scratchpad).
- Revisión trimestral rápida: correr todos los scripts y comparar visualmente.
