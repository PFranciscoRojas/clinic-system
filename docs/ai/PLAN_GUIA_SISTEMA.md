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

1. **Fase A (sin dependencias):** capítulos 2, 3, 9 — los datos ya existen; el pipeline ya los
   capturó una vez. Además el esqueleto Astro de `/guia/` con índice y navegación.
2. **Fase B (flujos por ejecutar):** capítulos 1, 4, 6, 7, 8 — hay que ejecutar cada flujo en la
   org demo (crear factura, firmar consentimiento, wizard de cita, etc.) capturando por el camino.
3. **Fase C (pipeline IA):** capítulo 5 — subir un audio de prueba a la org demo (dispara
   Whisper + Claude en el VPS, avisar antes de correrlo) para capturar transcripción y borrador
   IA reales. Capítulo 10 con el material legal existente.

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
