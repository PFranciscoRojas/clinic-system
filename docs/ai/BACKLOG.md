# Ideas y Tareas Futuras (No procesar aún)

## Marketing / SEO (2026-07-06)

- **Plan Backlinks + SEO + GEO para chapni.com (2026-07-06)** — auditoría SEO puntúa bajo solo por Enlaces (0-3 backlinks, 1 dominio ref) + contenido delgado (landing de 1 página); lo técnico ya está en verde. Estrategia de 4 frentes en paralelo (fundamentos de entidad/perfiles, directorios, motor de contenido `/recursos`, PR institucional colombiano) documentada en el repo `../chapni`: `docs/marketing/plan-seo-backlinks-geo.md`. Fixes técnicos ya desplegados (2026-07-06): estilos inline eliminados, email fuera de texto plano, schema local (Bogotá + WhatsApp), redirect `/sitemap.xml`, Cloudflare Web Analytics activado. **Mayor multiplicador pendiente: construir el hub `/recursos` en Astro** (blog + plantillas descargables + FAQ schema) — sin él los frentes de contenido no tienen dónde vivir.
- **Perfiles sociales creados, Facebook pendiente de completar (2026-07-06)** — LinkedIn (`linkedin.com/company/chapni`) bien montada. Instagram (`instagram.com/chapni.app` — "chapni" ya estaba ocupado) con bio correcta pero sin posts/seguidores todavía. **Facebook (`facebook.com/profile.php?id=61591492061615`) creada pero vacía**: sin foto, categoría ni sección Información — no aporta como señal de entidad hasta completarse. Pendiente: completar Facebook, publicar primeros posts en LinkedIn/IG, y decidir si cruzar los 3 enlaces al footer del sitio ya o esperar a que Facebook esté lista.

## Ola B2B Clínicas (2026-07-03)

> Análisis completo en conversación 2026-07-03. Base multi-usuario ya existe (roles, invitaciones, need-to-know, RLS); lo que falta son los flujos de producto que quedaron uni-profesional.

- **✅ B2B-1 — Mínimo vendible (RESUELTO 2026-07-04, PR #130)** — Booking público multi-profesional (selector de profesional en `/book/:slug`, slots y checkout por `staff_id`) y agenda de clínica (filtro por profesional en `AgendaCalendar`, asignación de profesional al crear cita para CLINIC_ADMIN/RECEPTIONIST).
- **✅ B2B-2 — Plan Clínica cobrable (RESUELTO 2026-07-04)** — `mp_plan_amount` ahora es precio por asiento de profesional; checkout MP multiplica por asientos elegidos (`pending_seats` → `seat_limit` al confirmar); enforcement de asientos en invitar/registrar/reactivar/cambiar rol (solo con plan pagado — el trial no limita porque el checkout cobra por headcount real); activación manual del operador acepta asientos. Ampliar asientos con plan activo = re-checkout asistido (WhatsApp) por ahora.
- **✅ B2B-3 — Dashboard del dueño (RESUELTO 2026-07-04)** — Tab "Equipo" en Facturación (`GET /invoices/team-stats`, gated `billing:reports`): por profesional sesiones realizadas/agendadas, no-show, canceladas (con tasa), reagendas, horas, ocupación (horas agendadas vs horario configurado, calculada en el frontend) e ingresos (pagos de facturas vía cita + reservas online pagadas sin factura, sin doble conteo). Fila "Sin asignar" para dinero no atribuible. Cubre también "Agenda — Métricas operativas" (abajo).
- **B2B menores (2026-07-03)** — ✅ Tarifas por profesional (2026-07-04: `service_rates.staff_id` opcional, selector en Tarifario y etiqueta en los pickers de factura). ✅ "Soy clínica" en signup ya existía ("No, solo administro" → invita profesionales). Pendiente post-1.0: RIPS/ADRES para IPS; multi-sede fuera de alcance v1.

## Producto — Auditoría 360° (2026-07-01, "lo que falta para completo")

> Los hallazgos técnicos de la auditoría tienen plan de ejecución en `PLAN_AUDIT_FIXES.md`; aquí van solo los features de producto, diferidos post-validación.

- **Portal del paciente (2026-07-01)** — ver sus citas, pagar, firmar consentimientos y recibir recordatorios desde un link propio. Reduce no-shows y es requisito típico del tier Clínica. Reusar la infraestructura de tokens públicos del booking/consentimientos.
- **Teleconsulta: embeber, no construir (2026-07-01)** — para la videollamada del roadmap (post-1.0), usar embed de Jitsi/Whereby con el link adjunto a la cita; video propio no aporta diferenciación y sí costo de mantenimiento.
- **Runbook de backup/DR verificable (2026-07-01)** — para vender confidencialidad hay que poder responder "¿y si se cae tu servidor?": documentar y probar restauración completa (Postgres + MASTER_KEY + SEARCH_PEPPER + volúmenes) con un simulacro cronometrado; respaldo offsite del dump cifrado.
- **Búsqueda de pacientes — mitigar la fricción del match exacto (2026-07-01)** — el hash sobre cifrado impide fuzzy/prefijos por diseño. Mitigaciones que no rompen el modelo: lista "mis pacientes recientes" prominente (alimentada por `patient_staff_rel`/citas), búsqueda por `patient_code`, y si la beta confirma la queja, hash adicional de prefijo fonético.
- **Anonimización IA — upgrade de modelo NER (2026-07-01)** — pasar de `es_core_news_sm` a `md`/`lg` (mejor recall de nombres) cuando el disco del VPS lo permita (hoy bloqueado por espacio; ver Capa 2 de disco en Infraestructura). El reemplazo literal de nombres conocidos (Fase 3 del plan de auditoría) cubre el grueso mientras tanto.

## Validación / Go-to-market

- **Beta de diseño con 2-3 psicólogas externas (2026-06-27)** — dar acceso gratis 2 semanas a colegas de la esposa (2 contactos ya identificados); acompañar la 1ª carga de paciente + grabación en vivo (do things that don't scale); anotar bugs/fricción reales que el founder solo nunca detecta; al cierre preguntar "¿lo seguirías usando? ¿cuánto pagarías?". Objetivo: separar hobby de negocio antes de invertir más en features.
- **Congelar features hasta tener señal de willingness-to-pay externa (2026-06-27)** — pausar nuevas olas (WhatsApp templates, RIPS, videollamada, verificación Google, SuperAdmin extras) hasta que al menos una psicóloga externa confirme que pagaría. Cada feature nueva antes de eso es ruido.
- **Mensaje de reclutamiento para beta (2026-06-27)** — plantilla aprobada: "Hola [nombre]. Construí un sistema de historia clínica para psicólogos — cifrado, cumple la norma colombiana, y graba la sesión y te arma el borrador de la nota en segundos. Lo uso con [esposa] y funciona muy bien. Quiero que 2 colegas en quien confío lo prueben gratis 2 semanas y me digan sin filtro qué sirve y qué se rompe. ¿Te animas? Te lo dejo listo y te acompaño yo mismo."

## Marca Chapni — follow-ups del rebrand (2026-07-02)

- **RESUELTO 2026-07-02**: marca definida (**Chapni** — Índigo & Oro, brand book en `~/Downloads/Chapni Brand - Indigo Oro.html`), landing en repo `../chapni` (Astro → chapni.com vía Cloudflare), sistema rebrandeado (PRs #117 frontend, #118 backend). Pendientes del rebrand:
- **RESUELTO 2026-07-02 — Dominio app.chapni.com** (PR #119): DNS A (DNS-only) → VPS, Caddy multi-dominio con cert emitido, `APP_BASE_URL` actualizado, redirect URI de Google añadido en Cloud Console. El dominio viejo mantiene `/api` vivo (webhooks MP de preapprovals existentes) y redirige 308 el resto. Opcional futuro: `PatchPreapprovalNotificationURL` para migrar los webhooks de suscripciones viejas y poder retirar `api.marcelachapues.com`.
- **Remitente de emails `@chapni.com`** — `RESEND_FROM` hoy es `citas@marcelachapues.com`; verificar dominio chapni.com en Resend y cambiar el env (ops, sin código).
- **Favicon modo oscuro** — usar `Chapni-favicon-oscuro.svg` del brand kit (`~/Downloads/brandchapni/exports/svg/`) vía `<link rel="icon" media="(prefers-color-scheme: dark)">`.
- **Pauta digital** — Facebook/Instagram segmentada a psicólogos Colombia una vez live la landing. Argumento central: "Menos de lo que cobras en una sesión."

## Evaluaciones psicológicas / Measurement-Based Care

- **Módulo MBC — plan completo listo, pendiente validación beta (2026-06-28)** — Ver `docs/ai/PLAN_ASSESSMENTS.md`. Veredicto: sí vale la pena, vacío de mercado en Colombia. Costo de licencias $0 (PHQ-9, GAD-7, PCL-5, AUDIT, DASS-21, HAM-A, ACE son dominio público y validadas en Colombia). Ningún software colombiano tiene gráficas de progreso tipo MBC. Implementación en 4 fases; Fase 1 toma 2–3 semanas. **Validar primero con las psicólogas beta** preguntando: *"¿Enviarías un cuestionario de 2 min a tus pacientes antes de cada sesión?"*

## Plantillas de registro — Widgets personalizados

- **Crear widgets clínicos personalizados (2026-06-28)** — El sistema ya soporta `{widget:nombre}` en plantillas. Para agregar uno nuevo: 1) Crear componente en `components/clinical/MiWidget.tsx` (inline styles + CSS vars), 2) Importarlo y añadir `case 'mi_widget':` en `TemplatedSectionsForm.tsx` (`WidgetField` switch ~línea 254), 3) Registrar la etiqueta en `WIDGET_LABELS` en `RecordTemplatesSection.tsx`. Sin cambios de backend. Ejemplo discutido: escala visual de estado de ánimo con 5 niveles y colores semafóricos.

## Gobernanza clínica / Control de acceso
- **Auto-registrar supervisor en patient_staff_rel al asignar cosignatario (2026-06-26)** — Al crear un `clinical_record` con `requires_cosign=true` y `supervisor_id`, hacer UPSERT en `patient_staff_rel` con relation_type `SUPERVISING`. Actualmente el `IsAssignedToPatient` ya incluye supervisores vía JOIN a `clinical_records.supervisor_id`, pero si el supervisor no tiene citas con el paciente y no tiene fila en `patient_staff_rel`, el chequeo sí lo deja pasar (porque el UNION lo encuentra). Sin embargo, para las listas de diagnósticos y planes terapéuticos donde el chequeo es sobre `patient_staff_rel` solo, sería más limpio tener la fila explícita. Requiere tocar `clinicalrecords/handler/writer.go` para añadir el upsert al aprobar o crear el record con cosign.
- **Visor de accesos break-the-glass en Settings (2026-06-24)** — C.3 del plan de sesión 6 diferida (el registro en audit_log ya funciona, lo urgente es el audit trail). Backend necesario: `GET /audit/clinical-access` → últimas N entradas con `action IN ('CLINICAL_RECORD_READ','CLINICAL_RECORD_LIST')` y `metadata.reason IS NOT NULL`, gated por `audit_log:read`. Frontend: tarjeta en Settings → Auditoría mostrando quién, qué HC, cuándo y con qué motivo (CLINIC_ADMIN accedió).
- **Re-aceptación forzada al publicar versión legal nueva (2026-06-24)** — El usuario eligió "solo registrar versión". Si alguna vez se requiere re-aceptación (cambio material en ToS/DPA): limpiar `terms_accepted_at` / `dpa_accepted_at` para usuarios activos + mostrar modal bloqueante al siguiente login. Considerar notificación por email con 10 días de antelación (Ley 1480, art. 53).
- **Pseudoanonimización de datos de contacto de pacientes (2026-06-24)** — Si un paciente con historia clínica ejerce derecho de supresión (Ley 1581): no se puede borrar la HC (Res. 1995/1999, 15 años), pero sí se pueden blanquear nombre, DNI, teléfono, correo (campos `_enc` + hash SHA-256 reemplazados por valor neutro). Complejidad: requiere re-cifrar los blobs + invalidar el hash de búsqueda. Implementar como "Anonimizar datos de contacto" con justificación y trazabilidad de quién y cuándo.

## Legal / Cumplimiento (Colombia)
- **Validación por abogado de ToS y Política de Privacidad (2026-06-24)** — Los documentos publicados en `/legal/terminos` y `/legal/privacidad` son borradores funcionales redactados como base. Antes del primer cliente pagando real, revisar con un abogado colombiano especializado en derecho digital/protección de datos. Costo estimado: COP $500k–$1.5M para revisión y firma.
- **Registro SIC (RNBD) (2026-06-24)** — Verificar el estado actual del Registro Nacional de Bases de Datos ante la SIC (actualizado en 2022). Aplica cuando haya tracción real (5+ clientes pagando).
- **Cláusula de arbitraje formal (Ley 1563/2012) (2026-06-24)** — Agregar cláusula de arbitraje a los ToS cuando el volumen de usuarios justifique la complejidad. Por ahora la ley aplicable y jurisdicción Bogotá ya están definidas.
- **Política de cookies (2026-06-24)** — Diferida. Solo aplica si se añade analytics de terceros (Google Analytics, Hotjar, etc.). Hoy no hay tracking externo.
- **Estructura legal (SAS vs persona natural) (2026-06-24)** — Decisión de negocio pendiente: para los primeros $20–40/cliente/mes, persona natural régimen SIMPLE es suficiente. Evaluar cuando supere el umbral de ingresos mínimos para SAS.

## Infraestructura / DevOps (pre go-live o post-1.0)
- **Proteger rama `main` en GitHub** — antes o al llegar a 1.0.0: activar branch protection (require PR + 1 approval, no direct push, no force-push). Complementar con pipeline CI (GitHub Actions) que corra `go build ./...` + `tsc --noEmit` en cada PR antes de permitir merge. Hoy el flujo manual funciona pero no escala ni protege ante errores de madrugada.
- **Disco VPS — Capa 2 (2026-06-24)** — Deferred (el usuario prefiere no aumentar el plan por ahora, no es producción real). Si el disco vuelve a apretar: añadir Hetzner Volume de 50 GB (~€2.5/mes) y mover el volumen `audio_data` ahí. Capa 1 (crons de limpieza + alerta email >80%) y Capa 3 (imagen ai-service a ghcr.io, whisper.tiny + spaCy sm, borrado de audio post-transcripción) ya implementadas.
- **Migrar más servicios a build CI (2026-06-24)** — ✅ `core-api` y `ai-service` ya se construyen en GitHub Actions. El VPS solo hace `docker pull`.
- **Prometheus + Grafana (cuando haya clientes reales pagando)** — añadir 2 contenedores al VPS: `prometheus` + `grafana` + `postgres_exporter`. Da gráficas de series de tiempo (conexiones, latencia, IOPS, etc.) con historial de días/semanas. ~300 MB RAM adicional. Diferir hasta tener carga real que justifique el overhead operativo.
- **Smoke tests en deploy de frontend (2026-06-30)** — el job `smoke` en `build-core-api.yml` solo se activa cuando cambia `services/core-api/**`. Si se quiere cobertura total, añadir un `workflow_dispatch` standalone en un archivo `smoke.yml` separado que se pueda disparar manualmente o desde el futuro CI de frontend.
- **Testing exploratorio con agente IA (2026-06-30)** — para detectar bugs visuales y de UX que un script de API no detecta, considerar `browser-use` (Python, integra Playwright + LLM) para sesiones periódicas manuales de exploración. No sirve como gate CI (no-determinístico, costoso), pero sí como herramienta del fundador antes de releases importantes. LangGraph/LangChain no aportan valor en este caso de uso.
- **ESLint: subir reglas react-hooks de `warn` a `error` (2026-07-02)** — ✅ Parcial (2026-07-03, PR #124): `no-explicit-any`, `purity`, `static-components` y `refs` arreglados (13 findings) y promovidos a `error`. **Pendiente:** `set-state-in-effect` (×24) y `exhaustive-deps` (×8) siguen en `warn` — necesitan refactors reales de efectos (sincronización de estado derivado); abordar como sesión propia de calidad.
- **Arreglar secret `SMOKE_PASSWORD` del smoke test (2026-07-02)** — ✅ Resuelto (2026-07-03, PR #123): tenant `demo-clinica` re-sembrado en prod (org dedicada, CLINIC_ADMIN+PROFESSIONAL, suscripción activa hasta 2099), secret rotado, y `smoke_test.py` actualizado al contrato actual del API (dominio app.chapni.com, `staff_id` en citas, `mental_exam` requerido en INITIAL, approve→204). Pipeline completo verde por primera vez, smoke incluido.

## Pruebas Psicológicas / Psicométricas (investigar antes de implementar)

- **Investigar valor diferencial de pruebas psicométricas integradas (2026-06-27)** — antes de construir nada, responder: ¿qué pruebas usan realmente los psicólogos colombianos en consulta? (PHQ-9, GAD-7, BDI-II, SCL-90, MMSE, escalas de ansiedad Beck, Conners pediátricas, pruebas proyectivas). ¿Están disponibles en dominio público o tienen licencia de pago (TEA, Pearson)? ¿Se pueden aplicar digitalmente sin infringir derechos? ¿Qué valor le aporta al profesional vs. papel? Preguntas para las betas de diseño. Solo implementar si hay demanda clara y los instrumentos son de libre uso.
- **Diseño técnico si se implementa (2026-06-27)** — tabla `patient_evaluations` (score cifrado, respuestas JSONB cifradas, instrumento, fecha, profesional); endpoints BC-5; display de score+banda normativa en perfil paciente; historial de mediciones para tracking de evolución; posibilidad de incluir resultado en el borrador IA. Complejidad: media-alta dependiendo del número de instrumentos a soportar.

## Code-debt — features mockeadas sin backend (auditoría 2026-06-24)
- **Evaluaciones psicométricas (ALTO)** — módulo eliminado completamente (decisión producto 2026-06-24: no se implementa por ahora). Ver sección "Pruebas Psicológicas" arriba para el análisis pendiente.
- ✅ **Bloqueo de pantalla configurable (MEDIO)** — resuelto 2026-06-24: `lib/screenLock.ts` + AppShell reactivo.
- ✅ **Formato "Con viñetas" sin implementar (TRIVIAL)** — resuelto 2026-06-24: opción eliminada de la UI.
- ✅ **Retención de borradores no aprobados (MEDIO)** — resuelto 2026-06-24: sweeper `internal/aidrafts/retention` activo.
- **SoonRow "Próximamente" en Notificaciones (BAJO)** — SMS, "Nuevo paciente registrado", "Cancelación de cita", "Resumen semanal", "Borrador IA listo" son toggles decorativos. Se dejan como señal de roadmap (honestos con badge Próximamente).
- ✅ **`StubPage.tsx` muerto (BAJO)** — eliminado 2026-06-24.

## Historia clínica — UX pendiente (sesión 20)

- ✅ **Picker de formato antes de abrir el RecordForm (2026-06-30)** — implementado como "paso de configuración" inline: al hacer clic en "Crear registro clínico" o "+ Nuevo", se muestra una tarjeta de setup con selector de tipo + selector de plantilla (cuando hay templates disponibles). Al confirmar, RecordForm abre con `defaultType` y `lockedTemplateId` preseleccionados y el selector de formato oculto. `AppointmentPage` con estados `setupOpen/setupType/setupTemplateId`; `RecordForm` con prop `lockedTemplateId`.
- **Visor de "borrador bloqueado" no cubre plantillas personalizadas (2026-06-30, sesión 24)** — El fix de `0e53e1d` (mostrar/recuperar contenido cuando el formato ya no aplica al proceso clínico) solo renderiza `blockedRestoreDraft` vía `RecordSectionsForm` (formato integrado). Si el borrador bloqueado usaba una plantilla personalizada (`customSections`), el visor de solo-lectura no lo muestra — necesitaría capturar también `customSections`/`selectedTemplateId` en el estado bloqueado y renderizar con `TemplatedSectionsForm` cuando corresponda. Dado que la org de Marcela ahora usa plantillas personalizadas para los 4 formatos, este caso ya no es marginal.

## Plantillas de registro — Fase 2 (post sesión 15)

- **Autodetección de plantilla por IA (2026-06-28)** — cuando el profesional no elige plantilla, que el LLM detecte el tipo de registro y sugiera la plantilla más adecuada basándose en el contenido transcrito. Complejidad alta; requiere umbral de confianza y confirmación explícita del profesional.
- **Importación de plantillas entre clínicas (2026-06-28)** — exportar plantillas como `.md` y permitir subir el mismo archivo en otra organización. Útil para cadenas de clínicas o consultores que configuran múltiples tenants.
- **Versionado estricto de plantillas para registros firmados (2026-06-28)** — actualmente `template_id` apunta a la plantilla viva (incluso si fue actualizada). Para mayor integridad legal: guardar snapshot del schema en el momento de la aprobación directamente en `clinical_records.sections_enc` o en una columna `template_schema_snapshot JSONB`. Requiere decisión de producto (complejidad vs. espacio).
- ✅ **PDF con etiquetas de plantilla personalizada (2026-06-28)** — implementado (`2991af2`): `RenderInput.TemplateSections`, render por tipo, dispatch de widgets, fallback a formato integrado.
- **AIDraftPage — edición de secciones tipadas (2026-06-28)** — el modo edición del draft con plantilla custom actualmente es read-only (muestra el form deshabilitado y el botón "Editar" activa el formulario). Verificar que `TemplatedSectionsForm` con `disabled=false` funcione fluidamente para todos los tipos de campo (especialmente widgets de solo lectura como `TreatmentPlanPanel` y `DiagnosesPanel` que son self-contained).

## Fase 3 — IA y Automatizaciones
- **Google Calendar (OAuth + sync)** — ✅ Implementado (2026-06-24): OAuth per-profesional con tokens cifrados, sync SGHCP→Google en create/cancel/backfill, limpieza al desconectar, `GoogleCalendarCard` en Settings.
- **Recordatorios + confirmación por WhatsApp (Meta Cloud API)** — ✅ Implementado (2026-06-23): credenciales por-tenant cifradas (`org_whatsapp_config`, migración 000034), sender `internal/whatsapp`, recordatorios 24h/2h y confirmación de cita por plantilla aprobada, UI de configuración en Ajustes → Notificaciones. Pendiente operativo (no-código): cada clínica verifica su Meta Business + aprueba sus plantillas. Sin webhooks de estado de entrega aún.
- **WhatsApp — System User token permanente (2026-06-24)** — las 3 plantillas HSM creadas están en revisión con Meta. Una vez aprobadas, generar un System User token permanente desde Meta Business Suite (el temporal dura 24h) y configurar en Ajustes → Notificaciones con Phone Number ID `1138431989358649`.
- **Robustecer la grabación en el navegador para que no se pierda al dar F5** — ✅ Implementado (2026-06-24): IndexedDB store `recordingStore.ts`, chunks por appointmentId, banner de recuperación al remontarse, `beforeunload` guard.
- **Google Calendar bidireccional (Google→SGHCP) (2026-06-24)** — Deferred. La sync actual es solo SGHCP→Google. Para bidireccional: registrar watch channel en Google Calendar API, recibir push notifications webhook, usar `sync_token` para cambios incrementales, renovar canales cada 7 días, resolver conflictos. Complejidad alta, requiere verificación de app con Google.
- **Google Calendar: verificación de app con Google (2026-06-24)** — App en "testing mode": máximo 100 usuarios test. Para producción con +100 clínicas, Google requiere verificación del scope `calendar.events` (proceso de semanas, similar al de Meta). Necesario antes de escalar.

## Clínico — Datos de paciente
- **Campos de la Sección I del Formato 1 faltantes en `patients` (2026-06-21)** — ✅ Estado civil, Escolaridad y Ocupación: implementados (migración `000029_patient_demographics`, blob cifrado `demographics_enc`, forms + franja de identificación).
- **Número de HC y Fecha de Apertura en la franja "I. Datos de identificación" (2026-06-21)** — ✅ Implementado (2026-06-22, `7e2e132`): Nº de HC correlativo por org (`patient_code`, patrón `invoice_number`), asignado al registrar el paciente; Fecha de apertura = `created_at`. Migración 000030 con backfill. Franja muestra `HC-000001`. Pendiente derivado: incluir el Nº de HC en el PDF de la historia.

## Facturación
- Analytics avanzado: ingresos por servicio, ticket promedio, conversión de leads.

## Booking público
- **Email de "reserva apartada" a admins** — ✅ Implementado (2026-06-24): `BookingDeferredAdmin` en notifier + resend, llamado desde `holdDeferred()` goroutine.
- **Doble booking en diferidos** — ✅ Implementado (2026-06-24): re-check de slot en `confirm()` antes del INSERT usando `BusyAppointments`; si hay conflicto → estado `PAID_CONFLICT` + `BookingConflictAdmin` a admins.
- **Nº de HC en PDF de historia clínica (2026-06-22)** — ✅ Implementado (2026-06-22, `7fdaff7`): header `HC-000001` junto al documento y fila "Nº de HC + apertura" en Sección I. Legacy sin `patient_code` omite la fila.

## Agenda — Métricas operativas (2026-06-19)
- ✅ Implementado (2026-07-04, B2B-3): tasa de cancelación y reagendas por profesional/período en Facturación → Equipo.

## Agenda — Agendado rápido (2026-06-21)
- ✅ Implementado (2026-06-22, `8b38fd1`): el popover de agendado rápido detecta solapamiento con citas del día (`byDay[day]`, helper `slotIsBusy`) y muestra estado "ocupado" en vez de proponer una hora que luego saldría bloqueada.
