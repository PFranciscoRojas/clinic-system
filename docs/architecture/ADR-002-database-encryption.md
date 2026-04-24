# ADR-002: Estrategia de Cifrado de Datos en PostgreSQL

- **Estado:** Revisado — 2026-04-23 (gestión de claves actualizada a Bootstrap)
- **Fecha original:** 2026-04-23
- **Autores:** Equipo de Arquitectura

## Contexto

Las historias clínicas psicológicas son datos de salud mental — la categoría más sensible dentro de los "datos sensibles" de la Ley 1581/2012. Una brecha de estos datos puede causar estigmatización, discriminación laboral o daño directo al paciente. La Resolución 1995/1999 exige confidencialidad y la Ley 23/1981 establece el secreto profesional médico como principio ético-legal. Necesitamos una estrategia de cifrado que proteja los datos **en reposo**, **en tránsito** y contra **acceso interno no autorizado** (insider threat).

## Decisión

**Cifrado en tres capas combinadas:**

1. **TDE (Transparent Data Encryption) a nivel de infraestructura**: En la fase Bootstrap (VPS), el proveedor (Hetzner) cifra el disco del servidor por defecto a nivel de hipervisor. Protege contra robo físico. En cloud, equivale a volúmenes RDS encrypted con CMEK.
2. **Cifrado a nivel de aplicación (AEA — Application-Level Encryption)** para campos de alto riesgo: Go cifra los valores antes de escribir en PostgreSQL usando AES-256-GCM con envelope encryption (DEK por paciente). Esta capa protege incluso contra un DBA con acceso directo a la BD.
3. **TLS 1.3 obligatorio** en todas las conexiones cliente↔Caddy, Caddy↔core-api, y core-api↔PostgreSQL.

## Gestión de Claves — Bootstrap

```
┌────────────────────────────────────────────────────────────────────────┐
│  MASTER_KEY  (variable de entorno en /etc/sghcp/.env, permisos 600)   │
│  Generación: openssl rand -hex 32                                      │
│  Rotación semestral — ver procedimiento más abajo                      │
│                                                                        │
│  ┌──────────────────────────────────┐                                  │
│  │ MASTER_KEY (32 bytes, AES-256)   │ ← cargada en memoria al inicio  │
│  │ Cifra y descifra DEKs            │   nunca escrita en BD ni logs    │
│  └────────────────┬─────────────────┘                                  │
│                   │ cifra (AES-256-GCM)                                │
│                   ▼                                                    │
│  ┌──────────────────────────────────┐                                  │
│  │ DEK — Data Encryption Key        │ ← AES-256-GCM, una por paciente │
│  │ Almacenado como encrypted_dek    │   en tabla encryption_keys       │
│  │ (BYTEA) en la BD                 │                                  │
│  └────────────────┬─────────────────┘                                  │
│                   │ cifra (AES-256-GCM)                                │
│                   ▼                                                    │
│  Campos [AEA] de la BD (BYTEA)     ← datos clínicos cifrados          │
└────────────────────────────────────────────────────────────────────────┘
```

### Campo `key_source` en `encryption_keys`

El campo `key_source` (TEXT) identifica qué clave maestra protege cada DEK, habilitando la migración a KMS sin tocar los datos cifrados:

```sql
-- Bootstrap:
key_source = 'env:MASTER_KEY_V1'   -- variable de entorno, versión 1

-- Post-migración a cloud:
key_source = 'aws-kms:arn:aws:kms:sa-east-1:123456:key/abc-def'
```

El código Go lee `key_source`, decide si descifrar con la variable de entorno o con el SDK de KMS, y obtiene el DEK en claro. El schema y los datos cifrados no cambian en la migración.

### Procedimiento de rotación de MASTER_KEY (Bootstrap)

```bash
# 1. Generar nueva clave
NEW_KEY=$(openssl rand -hex 32)

# 2. Para cada DEK en encryption_keys:
#    a. Leer encrypted_dek; descifrar con MASTER_KEY actual
#    b. Re-cifrar el DEK con NEW_KEY
#    c. UPDATE encryption_keys SET encrypted_dek = <nuevo>, key_source = 'env:MASTER_KEY_V2'

# 3. Actualizar /etc/sghcp/.env: MASTER_KEY=<NEW_KEY>
# 4. Reiniciar core-api (carga nueva clave desde .env)
# 5. Verificar operación normal
# 6. Limpiar historial del shell: history -c
```

Los campos `_enc` de las tablas no se tocan: el DEK descifrado es el mismo, solo cambia cómo está protegido en BD.

### Ruta de migración a AWS KMS

```
1. Provisionar CMK en AWS KMS (región sa-east-1)
2. Para cada fila en encryption_keys:
   a. Descifrar encrypted_dek con MASTER_KEY (env var)
   b. Cifrar el DEK con KMS API (GenerateDataKeyWithoutPlaintext)
   c. UPDATE encryption_keys SET encrypted_dek = <kms_blob>, key_source = 'aws-kms:<ARN>'
3. Retirar MASTER_KEY del .env
4. Rotar (point-in-time): la lógica Go ya soporta ambas rutas por key_source
```

## Campos con cifrado a nivel de aplicación (AEA)

| Tabla | Campo | Justificación |
|---|---|---|
| `patients` | `first_name_enc`, `middle_name_enc` | Nombre del paciente |
| `patients` | `paternal_last_name_enc`, `maternal_last_name_enc` | Apellidos — dato identificador primario |
| `patients` | `document_number_enc` | Cédula/documento — dato sensible |
| `patients` | `phone_enc`, `email_enc`, `address_enc` | Contacto — dato personal |
| `clinical_records` | `subjective_enc`, `objective_enc` | Contenido SOAP — relato y observaciones |
| `clinical_records` | `assessment_enc`, `plan_enc` | Diagnóstico y plan terapéutico |
| `clinical_records` | `audio_path_enc` | Ruta local del audio de sesión (`/data/audio/...`) |
| `consents` | `document_enc`, `signature_enc` | PDF de consentimiento y firma digital |
| `consents` | `scan_path_enc` | Ruta local del escaneo físico firmado |
| `ai_drafts` | `draft_content_enc`, `transcription_enc` | Borrador IA y transcripción anonimizada |
| `users` | `mfa_secret_enc` | Secreto TOTP para MFA |
| `patient_billing_profiles` | `insurance_name_enc`, `policy_number_enc`, `eps_auth_code_enc`, `billing_email_enc` | Datos de seguro/EPS |
| `payments` | `reference_enc` | Referencia de transacción (Nequi, PSE, transferencia) |
| `appointments` | `notes_enc` | Notas internas de la cita |
| `patient_assessments` | `responses_enc`, `notes_enc` | Respuestas de escalas psicométricas |
| `treatment_plans` | `diagnosis_enc`, `goals_enc`, `approach_enc`, `end_reason_enc` | Contenido clínico del plan terapéutico |

## Alternativas descartadas

| Opción | Por qué se descartó |
|---|---|
| Solo TDE | Un DBA con acceso puede leer todos los datos en claro. No protege insider threats. |
| `pgcrypto` (cifrado en BD) | La clave de cifrado viaja hacia la BD en las queries — visible en `pg_stat_activity` y logs de PostgreSQL. |
| Clave única para todos los pacientes | Un compromiso único expone todos los datos. DEK por paciente limita el blast radius a un paciente. |
| Hardcoding de clave en código | La clave quedaría en el repositorio o en artefactos de build. Inauditable. |

## Consecuencias

- **Positivas:** Defensa en profundidad; una brecha a nivel BD no expone datos legibles; cumplimiento con Ley 1581 Art. 17; migración a KMS sin reescribir datos cifrados (solo re-cifrar DEKs).
- **Negativas:** No se puede hacer `WHERE paternal_last_name_enc LIKE '%garcia%'`. Las búsquedas sobre datos cifrados requieren estrategia adicional.
- **Mitigación de búsquedas:** Índices sobre hashes deterministas (`SHA-256` del valor normalizado) para búsqueda exacta: `paternal_last_name_hash`, `doc_search_hash`. Para búsqueda difusa por nombre, el backend descifra el subconjunto filtrado por hash y filtra en memoria.
- **Gestión de claves Bootstrap:** `MASTER_KEY` en `/etc/sghcp/.env` con permisos `600`, propiedad de `root`. Aceptable para escala inicial con controles compensatorios: acceso root auditado, rotación semestral, sin acceso SSH por contraseña (solo llaves).
