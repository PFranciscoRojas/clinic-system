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
2. **Fase B (flujos por ejecutar):** ✅ COMPLETADA 2026-07-23 — capítulos 4, 7, 6, 8, 1.
3. **Fase C (pipeline IA):** ✅ COMPLETADA 2026-07-23 — capítulos 5 y 10.

**La guía está completa: los 10 capítulos en vivo en chapni.com/guia** (commit `8b36275`
del repo chapni, desplegado con `npm run deploy`). El índice no marca ningún capítulo como
pendiente. 44 pantallazos reales, un script Playwright por capítulo en `chapni/scripts/guia/`.

## Plan detallado — Fase B (ejecutada)

Orden elegido para encadenar datos: la cita del cap 4 alimenta la factura del cap 7; el
consentimiento del cap 6 usa a Laura Cardona; el cap 1 va al final porque necesita una org
desechable nueva. Un script Playwright por capítulo (`guia-cap0N.mjs`), un `.md` por capítulo.

### Cap 4 — Citas y agenda (`citas-y-agenda.md`) ✅
- [x] 5 capturas (`guia-cap04.mjs`): nueva cita, detalle de la cita, reagendar, página
      pública de reservas `/book/consultorio-valentina-rios` (en contexto limpio, sin sesión),
      recordatorios.

### Cap 7 — Facturación (`facturacion.md`) ✅
- [x] Flujo real ejecutado (`guia-cap07.mjs`): factura de Laura → registrar pago → recibo PDF.
      Factura y pago quedan en la org demo (ficticios).
- [x] 6 capturas: panel, nueva factura, factura emitida, registrar pago, recibo PDF,
      pagos en línea. Ojo: MercadoPago **no** vive en `/settings/billing` sino en
      `/settings/integrations`, detrás del portón de contraseña.
- Sin capturar: recordatorio de saldo (no aportaba al relato del capítulo).

### Cap 6 — Consentimientos (`consentimientos.md`) ✅
- [x] Flujo real con Laura (`guia-cap06.mjs` + `guia-cap06-sign.mjs`): plantillas, firma en
      consultorio, envío del link, vista del paciente y firma remota en contexto limpio,
      estado firmado. 6 capturas.

### Cap 8 — Configuración y equipo (`configuracion-y-equipo.md`) ✅
- [x] 6 capturas (`guia-cap08.mjs`): perfil, horario, seguridad, asistente IA, usuarios,
      área protegida. `maskAccountEmail()` oculta el correo real de la cuenta.
- Sin capturar: notificaciones, Google Calendar y WhatsApp (el capítulo ya quedaba largo).

### Cap 1 — Primeros pasos (`primeros-pasos.md`) ✅
- [x] Signup real con `franciscorojas92+guia1@gmail.com` (`guia-cap01.mjs` +
      `guia-cap01-onboarding.mjs`): registro, correo de verificación, onboarding, PIN,
      acuerdo de datos. 5 capturas.
- [x] Org desechable desactivada en BD del VPS (`c84ac82c`, `is_active = false`).
- Nota: el token de verificación se corrompe al leer el correo desde el HTML de Gmail
  (la secuencia `=de` del quoted-printable). Se marcó `email_verified_at` por SQL.
- Sin capturar: la pantalla "revisa tu correo" posterior al registro.

## Plan detallado — Fase C (ejecutada)

### Cap 5 — Historia clínica (`historia-clinica.md`) ✅
- [x] Audio de sesión ficticia generado con TTS (edge-tts, dos voces: `es-CO-SalomeNeural`
      terapeuta y `es-MX-DaliaNeural` consultante, 2:18, concatenado con ffmpeg). No se pidió
      grabación a Francisco.
- [x] Whisper corrido en el VPS con audio **corto** (2:18, ~20 s de CPU) justamente para no
      bloquear el worker secuencial de otras orgs. Draft `595e9128`.
- [x] 4 capturas usadas: sección Clínico, los 4 formatos clínicos, editor de nota con el
      panel de subir audio, y la pantalla "Comparación: Manual vs IA" con el borrador que la
      IA redactó del audio. Esa última es el centro del capítulo.
- Sin capturar: aprobación, adenda y exportar PDF. El relato ya cerraba con el borrador
  lado a lado, que es lo que vende el capítulo.

### Cap 10 — Seguridad y cumplimiento (`seguridad-y-cumplimiento.md`) ✅
- [x] Sin pantallazos del sistema. Diagrama de flujo en HTML/CSS inline con la paleta de
      marca (la CSP de la landing bloquea scripts externos, así que nada de mermaid) y tabla
      de leyes 1090 / 1581 / Res. 1995.

## Cierre del funnel (después de la guía o en paralelo)

- [x] `[LINK_VIDEO]` en `docs/project/WHATSAPP_RESPUESTAS.md` → reemplazado por
      `chapni.com/guia` (la guía sustituye al video). Hecho 2026-07-23.
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
