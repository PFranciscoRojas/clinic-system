## Sin tarea pendiente

Sesión 2026-07-10 cerrada limpia (PRs #167–#176, todo mergeado, desplegado y verificado):

- **Formatos org-only de punta a punta**: el picker de sesión ofrece solo los formatos que configuró la organización (sin "integrado"); `TemplatedSectionsForm` reescrito con los estilos reales de la app (estaba en Tailwind, que este frontend no tiene); el `record_type` se deriva de la etapa del proceso (la plantilla solo define campos — una org con un solo formato SOAP abre historia y evoluciona con él); selector de tipo en el editor de plantillas (antes clavado a EVOLUTION); caché React Query limpiada en login/logout (fuga entre tenants); "Cambiar formato" con modal in-app (PWA móvil suprimía `window.confirm`); aprobar borrador IA con plantilla reparado (faltaba `WithTemplateRepo` en el handler de aidrafts).
- **Admin de tenants**: `organizations.is_test` (migración 000062) + eliminación total transaccional de orgs de prueba (30+ tablas, usuarios, DEKs, audios); las reales NUNCA son eliminables (Res. 1995/1999); métricas excluyen orgs de prueba.
- **Búsqueda inteligente de pacientes** (migración 000063): índice `patient_search_tokens` con hashes peppered por prefijo de palabra sin tildes; `?q=` encuentra por cualquier parte del nombre mientras se escribe; backfill con `rehash` corrido en prod (7 pacientes).

**Acción manual pendiente del usuario (no de código):** Superadmin → Tenants → marcar `marcelachapues` y `consultorio-aurora` como prueba y eliminarlas escribiendo su slug. `marcela-chapues` es la real y queda protegida.

## Sugerencia de siguiente paso

Basándome en STATUS.md (bloqueantes + roadmap) y BACKLOG.md, lo más valioso a atacar ahora es:

1. **Cierre (DISCHARGE) con plantilla personalizada** (BACKLOG → Plantillas Fase 2, 2026-07-10) — el backend exige `discharge_reason` válido incluso con `template_id`, y el flujo templado de `RecordForm`/`AIDraftPage` no parece pedirlo. La org real de Marcela usa plantilla para los 4 formatos: su primer cierre real fallaría con "datos inválidos". Fix corto que desbloquea a la única usuaria real.
2. **Beta de diseño con 2-3 psicólogas externas** (bloqueante 🔴 más antiguo del 1.0.0) — ya sin excusa técnica: formatos configurables funcionando end-to-end, buscador decente, responsive. Acción del founder. Alternativa técnica: verificar desbloqueo de WhatsApp Meta (🟡) y configurar `tpl_reminder_24h`/`tpl_reminder_2h`.
