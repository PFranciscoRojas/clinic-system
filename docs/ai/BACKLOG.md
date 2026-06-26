# Ideas y Tareas Futuras (No procesar aún)

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

## Code-debt — features mockeadas sin backend (auditoría 2026-06-24)
- **Evaluaciones psicométricas (ALTO)** — módulo eliminado completamente (decisión producto 2026-06-24: no se implementa por ahora). Cuando se retome: tabla `patient_evaluations` (cifrada), endpoints BC-5, persistir score+band+respuestas, listar histórico en perfil de paciente. Roadmap post-1.0 "PHQ-9 y escalas".
- ✅ **Bloqueo de pantalla configurable (MEDIO)** — resuelto 2026-06-24: `lib/screenLock.ts` + AppShell reactivo.
- ✅ **Formato "Con viñetas" sin implementar (TRIVIAL)** — resuelto 2026-06-24: opción eliminada de la UI.
- ✅ **Retención de borradores no aprobados (MEDIO)** — resuelto 2026-06-24: sweeper `internal/aidrafts/retention` activo.
- **SoonRow "Próximamente" en Notificaciones (BAJO)** — SMS, "Nuevo paciente registrado", "Cancelación de cita", "Resumen semanal", "Borrador IA listo" son toggles decorativos. Se dejan como señal de roadmap (honestos con badge Próximamente).
- ✅ **`StubPage.tsx` muerto (BAJO)** — eliminado 2026-06-24.

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
