# Ideas y Tareas Futuras (No procesar aún)

## Infraestructura / DevOps (pre go-live o post-1.0)
- **Proteger rama `main` en GitHub** — antes o al llegar a 1.0.0: activar branch protection (require PR + 1 approval, no direct push, no force-push). Complementar con pipeline CI (GitHub Actions) que corra `go build ./...` + `tsc --noEmit` en cada PR antes de permitir merge. Hoy el flujo manual funciona pero no escala ni protege ante errores de madrugada.
- **Disco VPS — Capa 2 (2026-06-24)** — Deferred (el usuario prefiere no aumentar el plan por ahora, no es producción real). Si el disco vuelve a apretar: añadir Hetzner Volume de 50 GB (~€2.5/mes) y mover el volumen `audio_data` ahí. Capa 1 (crons de limpieza + alerta email >80%) y Capa 3 (imagen ai-service a ghcr.io, whisper.tiny + spaCy sm, borrado de audio post-transcripción) ya implementadas.
- **Migrar más servicios a build CI (2026-06-24)** — `ai-service` ya se construye en GitHub Actions y se despliega a ghcr.io. Considerar lo mismo para `core-api` (hoy `docker compose up --build` en el VPS) si el build local vuelve a llenar disco.

## Code-debt — features mockeadas sin backend (auditoría 2026-06-24)
- **Evaluaciones psicométricas sin persistencia (ALTO)** — `pages/Evaluations/EvaluationsPage.tsx`: el flujo completa la prueba (PHQ-9, GAD-7, etc.), muestra resultado e interpretación clínica con `setTimeout(onComplete, 1400)` y se descarta. No hay tabla en BD, ni API, ni endpoint Go. El profesional no puede recuperar resultados históricos. Implementar: tabla `patient_evaluations` (cifrada), endpoints BC-5, persistir score+band+respuestas, listar histórico en perfil de paciente. (Ya estaba en roadmap post-1.0 "PHQ-9 y escalas", aquí se confirma que la UI existe pero sin backend.)
- **Bloqueo de pantalla configurable pero ignorado (MEDIO)** — `Settings/SettingsPage.tsx` SecuritySection: el toggle "Bloqueo automático" y los botones 2/5/10/15/30 min marcan dirty y muestran "✓ Guardado" pero `handleSave` global solo actúa para `section==='ai'`. El tiempo real está hardcoded en `AppShell.tsx:46` (`IDLE_MS = 5min`). Persistir la preferencia (BD o localStorage) y que AppShell la lea.
- **Formato "Con viñetas" sin implementar en IA (TRIVIAL)** — `Settings/SettingsPage.tsx:926` ofrece `bullet` en NOTE_STYLES, pero `ai-service/drafts/claude.py` solo tiene instrucciones para `structured` y `narrative`; si el profesional elige viñetas, el backend cae a structured silenciosamente. Añadir instrucción `bullet` en `_STYLE_INSTRUCTIONS` o quitar la opción del frontend.
- **Retención de borradores no aprobados sin enforcement (MEDIO)** — la preferencia se persiste en `ai_prefs.data_retain` (6m/1a/2a) pero no existe cron/job que borre los `ai_drafts` vencidos. Implementar un sweep periódico que elimine drafts no aprobados más viejos que el umbral.
- **SoonRow "Próximamente" en Notificaciones (BAJO)** — `Settings/SettingsPage.tsx`: SMS, "Nuevo paciente registrado", "Cancelación de cita", "Resumen semanal", "Borrador IA listo" son toggles decorativos con badge Próximamente, sin backend.
- **`StubPage.tsx` muerto (BAJO)** — componente "en construcción" exportado pero sin imports. Eliminar.

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
- Tasa de cancelación y reagendamiento por profesional / período: ¿sirve? Sí tiene valor — una tasa alta de cancelaciones puede indicar problemas de adherencia del paciente o de horarios mal configurados; una tasa alta de reagendas puede indicar que el profesional cambia mucho. Podría mostrarse como tarjeta en el módulo de facturación o en un futuro panel de gestión. Datos ya disponibles en BD (status CANCELLED + cancel_reason = 'Reagendado').

## Agenda — Agendado rápido (2026-06-21)
- ✅ Implementado (2026-06-22, `8b38fd1`): el popover de agendado rápido detecta solapamiento con citas del día (`byDay[day]`, helper `slotIsBusy`) y muestra estado "ocupado" en vez de proponer una hora que luego saldría bloqueada.
