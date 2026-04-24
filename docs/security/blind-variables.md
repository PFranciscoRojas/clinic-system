# Variables Ciegas — Lo Que el RFC No Menciona Explícitamente

> Análisis de los aspectos que se omiten frecuentemente en sistemas de salud y que pueden generar problemas legales, operativos o de seguridad en Colombia.

---

## 1. Retención y Purga Segura de Datos

### Retención mínima legal (15 años)
- **Norma:** Resolución 1995 de 1999, Art. 15 — la historia clínica debe conservarse mínimo 15 años desde la última atención.
- **Implicación práctica:** Si un paciente abandona el tratamiento en 2026, su historia debe existir hasta 2041. Nuestro sistema de backups y archivado **debe** garantizarlo.
- **Acción:** Política de retención en S3 Glacier con Object Lock (WORM — Write Once Read Many) configurado en 15 años. Ningún proceso puede borrar antes de que venza el lock.

### Purga segura con certificado de destrucción
- Cuando vence el periodo de retención, los datos no se "eliminan" con un DELETE — se ejecuta una purga segura:
  1. Destrucción de la DEK en KMS (todos los datos cifrados con esa clave se vuelven inaccesibles).
  2. Sobrescritura de los archivos físicos en S3 (S3 maneja esto internamente; para otros medios, usar estándar DoD 5220.22-M).
  3. Generación de un **certificado de destrucción** con timestamp, método y campos eliminados.
  4. El certificado se guarda en `audit_log` como evidencia ante la SIC.

---

## 2. Manejo de Secretos y Variables de Entorno

### Problema del `.env` en producción
- Variables de entorno en texto plano en el servidor = secretos expuestos si alguien obtiene acceso al sistema de archivos.
- **Solución:** AWS Secrets Manager para producción. Las credenciales de BD, API keys de Claude, claves de email — todo en Secrets Manager. El código solo conoce el ARN del secreto.

### Rotación de secretos
- Contraseña de PostgreSQL: rotación automática cada 90 días (AWS Secrets Manager lo hace sin downtime con RDS).
- CMK de KMS: rotación anual automática (AWS KMS lo maneja sin re-cifrar datos existentes).
- JWT signing key: rotación trimestral con periodo de gracia de 24h para tokens en vuelo.
- API Key de Claude/Anthropic: rotación semestral, almacenada en Secrets Manager.

### CI/CD
- Nunca imprimir variables de entorno en logs de CI.
- Usar OIDC entre el pipeline (GitHub Actions) y AWS IAM — sin secretos de AWS estáticos en el repositorio.

---

## 3. Auditoría: Quién Vio Qué y Cuándo

### Más allá del logging básico
El sistema debe poder responder en una inspección de la SIC:
- ¿Quién accedió a la historia del paciente X el día Y?
- ¿Desde qué IP?
- ¿Qué campos consultó?
- ¿Hubo intentos fallidos de acceso?

### Registros críticos en `audit_log`
| Evento | Campos registrados |
|---|---|
| `LOGIN_SUCCESS` / `LOGIN_FAILURE` | user_id, ip, user_agent, timestamp |
| `READ_PATIENT` | user_id, patient_id, campos accedidos |
| `READ_CLINICAL_RECORD` | user_id, record_id, patient_id |
| `CREATE/UPDATE_CLINICAL_RECORD` | user_id, record_id, campos modificados (sin valores) |
| `APPROVE_AI_DRAFT` | user_id, draft_id, clinical_record_id |
| `EXPORT_RECORD` | user_id, patient_id, formato de export |
| `CONSENT_SIGNED` | user_id (paciente), consent_type |
| `FAILED_DECRYPTION` | intento, recurso, ip — alerta inmediata |
| `PASSWORD_CHANGED` | user_id, ip |
| `MFA_DISABLED` | user_id — alerta de seguridad |

### Alertas automáticas
- Más de 5 intentos fallidos de login → bloqueo temporal de cuenta + notificación al admin.
- Acceso fuera de horario laboral (configurable por profesional) → alerta por email.
- Descarga masiva de registros (más de 20 en 10 minutos) → alerta de posible exfiltración.

---

## 4. Consentimiento Informado Digital

### Lo que la ley exige
- Ley 23/1981 (Código de Ética Médica) y Resolución 8430/1993: el consentimiento informado debe ser previo, libre, voluntario, informado y documentado.
- Para grabación de sesiones: consentimiento explícito y específico — no basta con un consentimiento general de tratamiento.

### Lo que el sistema debe implementar
1. **Consentimiento de tratamiento:** Antes de crear la primera historia clínica.
2. **Consentimiento de grabación:** Antes de habilitar la funcionalidad de subida de audio. Se puede revocar en cualquier momento.
3. **Consentimiento de procesamiento por IA:** El paciente debe saber que su sesión será transcrita por software y procesada por un LLM (aunque sea texto anonimizado).
4. **Firma digital:** Puede ser tan simple como un OTP enviado al celular del paciente que valida su identidad — no se requiere firma electrónica avanzada para este caso.
5. **Versioning:** Si cambia la política de privacidad o el uso de IA, se requiere nuevo consentimiento.

---

## 5. DPIA (Data Protection Impact Assessment)

- **Norma:** CONPES 3995/2020 recomienda el DPIA para tratamientos de datos de alto riesgo. El tratamiento de datos de salud mental califica como alto riesgo por definición.
- **Qué es:** Un análisis formal que documenta: qué datos se recogen, por qué, quién accede, los riesgos y las medidas de mitigación.
- **Cuándo:** Antes del go-live del sistema. Si cambia el propósito del tratamiento (ej. se añade un nuevo uso de los datos), hay que actualizar el DPIA.
- **Quién lo hace:** El responsable del tratamiento (la profesional/clínica), con apoyo del equipo de desarrollo.
- **Registro:** Debe registrarse ante la SIC si se tratan datos sensibles a gran escala.

---

## 6. Notificación de Incidentes de Seguridad

- **Norma:** Ley 1581/2012 Art. 17 lit. h y Decreto 1377/2013 obligan al responsable a notificar a los afectados y a la SIC ante una brecha.
- **Plazo:** La SIC recomienda 72 horas (alineado con GDPR), aunque la ley colombiana no establece un plazo explícito. Adoptar 72h es la mejor práctica.
- **Plan de respuesta a incidentes necesario:**
  1. Detección → aislamiento del sistema afectado.
  2. Análisis forense (preservar evidencia antes de restaurar).
  3. Notificación a afectados (pacientes cuya información se comprometió).
  4. Notificación a SIC con formulario de reporte.
  5. Medidas correctivas + post-mortem.
- **Acción:** Crear el `docs/security/incident-response-plan.md` antes del go-live.

---

## 7. Gestión de Acceso de Dispositivos de los Usuarios

- **Riesgo ignorado frecuentemente:** Un profesional con su laptop comprometida = acceso a todos sus pacientes.
- **Controles recomendados:**
  - MFA obligatorio para todos los roles.
  - Sesiones con timeout de 30 minutos de inactividad.
  - Invalidación remota de sesiones (si el dispositivo se pierde, el admin puede revocar todos los tokens del usuario).
  - Política de cifrado de disco en los dispositivos del profesional (FileVault en Mac, BitLocker en Windows).
  - No almacenar datos de pacientes en el dispositivo local — todo en la nube vía el sistema.

---

## 8. Accesibilidad y Continuidad Operacional

- **Acceso sin internet:** Si el consultorio pierde conexión, ¿puede el profesional registrar algo? El frontend PWA debe permitir registrar notas básicas offline y sincronizar cuando se restaure la conexión. Los datos offline se guardan cifrados en IndexedDB.
- **Exportación de datos (portabilidad):** La Ley 1581 da al titular el derecho de acceder a sus datos. El sistema debe poder exportar la historia clínica de un paciente en un formato legible (PDF). El paciente puede solicitarlo desde su portal.
- **Continuidad sin el sistema:** El plan de DRP (Disaster Recovery Plan) debe considerar el tiempo máximo tolerable de inactividad (RTO) y la pérdida máxima tolerable de datos (RPO). Para este sistema: RTO = 4h, RPO = 1h (sugerido). Documentar el procedimiento de restauración y probarlo semestralmente.

---

## 9. Gestión del Ciclo de Vida de Usuarios

- **Alta de usuarios:** Solo el ADMIN puede crear cuentas de PROFESSIONAL. Un PROFESSIONAL puede crear el portal de un PATIENT, pero no puede crear otros PROFESSIONAL.
- **Baja de un profesional:** Si una psicóloga deja la clínica, su cuenta se desactiva (no elimina). Sus historias clínicas quedan accesibles al ADMIN y a un posible profesional sucesor designado explícitamente.
- **Baja de un paciente:** El paciente puede solicitar la eliminación de su cuenta del portal, pero la historia clínica NO se elimina — debe conservarse los 15 años. Lo que se elimina es el acceso al portal, no el registro clínico.
- **Derecho al olvido vs. retención médica:** En Colombia, el derecho de supresión de la Ley 1581 cede ante la obligación de retención de la Resolución 1995/1999. El sistema debe manejar esta excepción y documentarla en la política de privacidad.

---

## 10. Pruebas y Datos de Test

- **Nunca usar datos reales en entornos de desarrollo o staging.**
- Crear un generador de datos sintéticos (con Faker en Python) para poblar el entorno de dev.
- Los ambientes de dev/staging deben tener su propia instancia de KMS con claves de test.
- Los dumps de BD nunca deben copiarse de producción a otro ambiente sin anonimización previa.

---

## Resumen Ejecutivo de Brechas Identificadas

| # | Variable Ciega | Riesgo si se omite | Prioridad |
|---|---|---|---|
| 1 | Retención 15 años + purga certificada | Multa SIC + pérdida de evidencia | CRÍTICA |
| 2 | Rotación de secretos | Brecha por credencial comprometida | ALTA |
| 3 | Auditoría granular (quién vio qué) | Sin trazabilidad ante inspección SIC | CRÍTICA |
| 4 | Consentimiento grabación + IA | Violación Ley 23/1981 + Ley 1581 | CRÍTICA |
| 5 | DPIA antes de go-live | Operación sin base legal documentada | ALTA |
| 6 | Plan de respuesta a incidentes | Sin protocolo ante brecha = pánico | ALTA |
| 7 | Gestión de dispositivos de usuarios | Vector de ataque más probable | MEDIA |
| 8 | Continuidad sin internet / DRP | Pérdida de datos en fallo | MEDIA |
| 9 | Ciclo de vida usuarios (baja profesional) | Acceso huérfano a datos de pacientes | ALTA |
| 10 | Datos sintéticos en dev/staging | Exposición accidental de datos reales | ALTA |
