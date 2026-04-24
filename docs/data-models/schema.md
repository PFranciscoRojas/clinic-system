# Modelos de Datos v2 — Esquema de Plataforma (PostgreSQL 16)

> **Leyendas:**
> - `[AEA]` — cifrado a nivel de aplicación, AES-256-GCM + KMS. Tipo `BYTEA`.
> - `[HASH]` — SHA-256 del valor normalizado. No reversible. Solo búsqueda exacta.
> - `[PUB]` — dato semipúblico del profesional (matrícula, nombre en tarjeta). Sin AEA.
> - `[SOFT_FK]` — FK lógica (UUID), sin `REFERENCES` en DDL. Se convierte en FK dura en el monolito
>   y en contrato de API cuando se separa en microservicio. Marcado donde cruza contexto.

---

## 0. Visión de Arquitectura de Datos

### 0.1 Contextos delimitados (Bounded Contexts)

El schema está particionado en cinco dominios. Cada uno puede convertirse en un
microservicio independiente con su propia base de datos sin reescribir la lógica de negocio.
Las FKs que cruzan dominios están marcadas `[SOFT_FK]` — hoy son FKs reales en el monolito,
mañana son referencias por ID con validación en la capa de aplicación.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BC-1: Organización & Auth                                                │
│   organizations · users · roles · permissions · role_permissions         │
│   user_roles · supervision_rel                                            │
└────────────────────────────┬─────────────────────────────────────────────┘
         [SOFT_FK] cruce      │ user_id
┌────────────────────────────▼─────────────────────────────────────────────┐
│ BC-2: Staff & Perfiles                                                   │
│   professional_profiles                                                   │
└────────────────────────────┬─────────────────────────────────────────────┘
         [SOFT_FK] cruce      │ staff_id
┌────────────────────────────▼─────────────────────────────────────────────┐
│ BC-3: Pacientes                                                          │
│   patients · encryption_keys · patient_staff_rel                         │
└──────┬─────────────────────┬────────────────────────────────────────────┘
       │ patient_id           │ patient_id
┌──────▼──────────┐  ┌───────▼────────────────────────────────────────────────────────┐
│ BC-4: Agenda    │  │ BC-5: Clínico                                                   │
│   appointments  │  │   clinical_records · consents · ai_drafts                       │
└─────────────────┘  │   assessment_scales · patient_assessments · treatment_plans     │
                     └────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ BC-6: Facturación (module_billing)                                       │
│   service_rates · patient_billing_profiles · invoices · payments         │
└──────────────────────────────────────────────────────────────────────────┘

Transversal (no pertenecen a un BC, sirven a todos):
   encryption_keys · audit_log · domain_events (outbox)
```

### 0.2 Datos operativos vs. analíticos

```
┌────────────────────────────────────────────────────────┐
│  CAPA OPERACIONAL (OLTP) — este schema                  │
│  PostgreSQL 16, RDS Multi-AZ                            │
│  Optimizado para transacciones, no para reportes        │
│  Contiene PII cifrada                                   │
└──────────────────────┬─────────────────────────────────┘
                       │ CDC (Debezium) o Outbox pattern
                       │ Solo payloads ANONIMIZADOS
                       ▼
┌────────────────────────────────────────────────────────┐
│  CAPA ANALÍTICA (OLAP) — fuera de este schema           │
│  BigQuery / Redshift / PostgreSQL con star schema       │
│  SIN PII — aggregated, anonymized                       │
│  Métricas: sesiones/semana, tasa de aprobación IA,      │
│    distribución de tipos de consulta, ocupación,        │
│    duración promedio, cancelaciones, etc.               │
└────────────────────────────────────────────────────────┘
```

**Regla:** ningún campo `_enc` ni nombre de paciente llega a la capa analítica.
El evento que sale tiene `patient_id` (UUID), no datos identificadores.

---

## 1. ENUMs

```sql
-- ── Auth & Organización ──────────────────────────────────────────────────
CREATE TYPE plan_tier AS ENUM (
    'STARTER',      -- 1 profesional, funcionalidades base
    'PROFESSIONAL', -- hasta 5 profesionales, módulos clínicos completos
    'ENTERPRISE'    -- ilimitado, módulos adicionales (inventario, billing, etc.)
);

-- ── Staff ────────────────────────────────────────────────────────────────
CREATE TYPE license_state AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- ── Pacientes ────────────────────────────────────────────────────────────
-- (Sin ENUM para género — campo TEXT libre para cumplir Decreto 1227/2015
--  que reconoce múltiples identidades de género en Colombia)

-- ── Agenda ───────────────────────────────────────────────────────────────
CREATE TYPE appointment_modality AS ENUM ('IN_PERSON', 'VIRTUAL', 'HYBRID');

CREATE TYPE appointment_status AS ENUM (
    'SCHEDULED',    -- agendada, sin confirmar
    'CONFIRMED',    -- paciente confirmó
    'COMPLETED',    -- sesión realizada
    'CANCELLED',    -- cancelada por cualquier parte
    'NO_SHOW',      -- no se presentó sin avisar
    'RESCHEDULED'   -- reagendada; la cita original queda en este estado
);

-- ── Clínico ──────────────────────────────────────────────────────────────
CREATE TYPE record_type AS ENUM (
    'INITIAL',
    'EVOLUTION',
    'DISCHARGE',
    'INTERCONSULTATION'
);

CREATE TYPE record_status AS ENUM (
    'DRAFT',    -- editable
    'APPROVED'  -- firmado e inmutable
);

CREATE TYPE ai_draft_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'DRAFT_READY',
    'APPROVED',
    'REJECTED',
    'ERROR'
);

CREATE TYPE consent_type AS ENUM (
    'TREATMENT',
    'RECORDING',
    'DATA_PROCESSING',
    'INFORMATION_SHARING'
);

CREATE TYPE consent_signing_method AS ENUM (
    'DIGITAL',        -- generated in-system, signed electronically (OTP or drawn)
    'PHYSICAL_SCAN'   -- printed, physically signed, scanned and uploaded
);

-- ── Facturación ──────────────────────────────────────────────────────────
CREATE TYPE invoice_status AS ENUM (
    'DRAFT',      -- generated but not yet issued to patient
    'ISSUED',     -- delivered to patient, awaiting payment
    'PAID',       -- payment received in full
    'PARTIAL',    -- partial payment received
    'INSURED',    -- fully covered by EPS/insurance, no patient payment
    'CANCELLED'   -- voided
);

CREATE TYPE payment_method_type AS ENUM (
    'CASH',
    'DEBIT_CARD',
    'CREDIT_CARD',
    'BANK_TRANSFER',
    'NEQUI',
    'DAVIPLATA',
    'PSE',
    'INSURANCE_EPS',
    'INSURANCE_PRIVATE',
    'OTHER'
);
```

---

## 2. Tablas de Referencia Globales

### `document_types`

```sql
CREATE TABLE document_types (
    code            TEXT    PRIMARY KEY,   -- 'CC', 'CE', 'PA', 'TI', 'RC', 'PEP', 'PPT'
    name            TEXT    NOT NULL,
    country_code    CHAR(2) NOT NULL DEFAULT 'CO',
    requires_expiry BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO document_types (code, name, requires_expiry) VALUES
    ('CC',  'Cédula de Ciudadanía',           FALSE),
    ('CE',  'Cédula de Extranjería',          TRUE),
    ('PA',  'Pasaporte',                      TRUE),
    ('TI',  'Tarjeta de Identidad',           FALSE),
    ('RC',  'Registro Civil de Nacimiento',   FALSE),
    ('PEP', 'Permiso Especial de Permanencia',TRUE),
    ('PPT', 'Permiso de Protección Temporal', TRUE),
    ('NIT', 'NIT (persona jurídica)',         FALSE);
```

### `specialties`

```sql
CREATE TABLE specialties (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO specialties (code, name) VALUES
    ('PSI_CLI', 'Psicología Clínica'),
    ('PSI_NEU', 'Neuropsicología'),
    ('PSI_INF', 'Psicología Infantil y del Adolescente'),
    ('PSI_FOR', 'Psicología Forense'),
    ('PSI_ORG', 'Psicología Organizacional'),
    ('PSI_GEN', 'Psicología General'),
    ('MED_GEN', 'Medicina General'),           -- futura expansión multidisciplinaria
    ('NUT',     'Nutrición y Dietética'),
    ('TO',      'Terapia Ocupacional'),
    ('FIS',     'Fisioterapia');
```

---

## 3. Dominio: Organización & Auth (BC-1)

### `organizations`

> Raíz de la multi-tenencia. Todo dato clínico pertenece a una organización.
> Si hoy hay una sola clínica, igual necesita su `organization_id` — añadirlo
> después implica una migración de toda la BD.

```sql
CREATE TABLE organizations (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT    NOT NULL,
    slug        TEXT    NOT NULL UNIQUE, -- subdominio futuro: 'clinica-garcia'
    nit         TEXT    UNIQUE,          -- NIT de la razón social (Colombia)
    plan        plan_tier NOT NULL DEFAULT 'STARTER',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    -- Feature flags por organización (activa módulos sin deploy)
    -- Ej: {"module_inventory": false, "module_billing": false, "ai_enabled": true}
    features    JSONB   NOT NULL DEFAULT '{}',
    -- Configuración operativa
    settings    JSONB   NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `users`

> Solo autenticación. Sin datos de negocio. Un usuario pertenece a una organización.

```sql
CREATE TABLE users (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id),
    email           TEXT    NOT NULL,
    email_hash      TEXT    NOT NULL,               -- [HASH] SHA-256(lower(trim(email)))
    password_hash   TEXT    NOT NULL,               -- bcrypt cost=12
    mfa_secret_enc  BYTEA,                          -- [AEA] secreto TOTP
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Email único dentro de la organización (no globalmente — mismo email en dos clínicas OK)
    UNIQUE (organization_id, email_hash)
);

CREATE INDEX idx_users_org       ON users(organization_id);
CREATE INDEX idx_users_email_hash ON users(organization_id, email_hash);
```

### `roles`

> Roles predefinidos del sistema + roles personalizados por organización.
> `organization_id IS NULL` = rol de sistema (globalmente disponible).

```sql
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),  -- NULL = rol de sistema
    name            TEXT NOT NULL,
    description     TEXT,
    is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

-- Roles de sistema (seed)
INSERT INTO roles (name, description, is_system_role) VALUES
    ('SYSTEM_ADMIN',   'Acceso completo. Gestiona organizaciones.',             TRUE),
    ('CLINIC_ADMIN',   'Admin de la organización. Gestiona usuarios y config.', TRUE),
    ('PROFESSIONAL',   'Acceso clínico completo a sus pacientes asignados.',    TRUE),
    ('INTERN',         'Acceso supervisado. Puede crear borradores, no aprobar.',TRUE),
    ('RECEPTIONIST',   'Agenda y registro de pacientes. Sin acceso clínico.',   TRUE),
    ('PATIENT',        'Portal del paciente. Solo sus propios datos.',          TRUE);
```

### `permissions`

> Permisos atómicos en formato `recurso:acción`.
> Preparados para módulos futuros — `inventory:*`, `billing:*` ya están listados.

```sql
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,  -- 'patients:read', 'clinical_records:approve'
    description TEXT,
    module      TEXT NOT NULL DEFAULT 'core'  -- 'core', 'inventory', 'billing', 'analytics'
);

INSERT INTO permissions (code, description, module) VALUES
    -- Organización
    ('organization:read',              'Ver configuración de la organización',     'core'),
    ('organization:configure',         'Modificar configuración de la organización','core'),
    -- Usuarios
    ('users:read',                     'Ver listado de usuarios',                  'core'),
    ('users:create',                   'Crear usuarios',                           'core'),
    ('users:update',                   'Modificar usuarios',                       'core'),
    ('users:deactivate',               'Desactivar usuarios',                      'core'),
    -- Pacientes
    ('patients:read',                  'Ver pacientes asignados',                  'core'),
    ('patients:read_all',              'Ver todos los pacientes de la org',        'core'),
    ('patients:create',                'Registrar nuevos pacientes',               'core'),
    ('patients:update',                'Modificar datos de pacientes',             'core'),
    -- Historia clínica
    ('clinical_records:read',          'Leer historias clínicas',                  'core'),
    ('clinical_records:create',        'Crear registros en borrador',              'core'),
    ('clinical_records:update',        'Editar borradores',                        'core'),
    ('clinical_records:approve',       'Aprobar y firmar registros oficiales',     'core'),
    ('clinical_records:cosign',        'Co-firmar registros de supervisados',      'core'),
    -- Agenda
    ('appointments:read',              'Ver citas',                                'core'),
    ('appointments:create',            'Agendar citas',                            'core'),
    ('appointments:update',            'Modificar citas',                          'core'),
    ('appointments:cancel',            'Cancelar citas',                           'core'),
    -- Consentimientos
    ('consents:read',                  'Ver consentimientos',                      'core'),
    ('consents:create',                'Generar documentos de consentimiento',     'core'),
    -- IA
    ('ai_drafts:request',              'Solicitar procesamiento de audio',         'core'),
    ('ai_drafts:review',               'Revisar y resolver borradores de IA',      'core'),
    -- Auditoría
    ('audit_log:read',                 'Consultar registros de auditoría',         'core'),
    -- Módulo Inventario (futuro)
    ('inventory:read',                 'Ver inventario',                           'inventory'),
    ('inventory:create',               'Agregar ítems al inventario',              'inventory'),
    ('inventory:update',               'Modificar inventario',                     'inventory'),
    ('inventory:delete',               'Eliminar ítems del inventario',            'inventory'),
    -- Módulo Facturación
    ('billing:read',                   'Ver facturas y pagos del paciente',        'billing'),
    ('billing:create',                 'Generar facturas manualmente',             'billing'),
    ('billing:record_payment',         'Registrar un pago recibido',               'billing'),
    ('billing:manage_rates',           'Gestionar tarifario de servicios',         'billing'),
    ('billing:manage_insurance',       'Gestionar datos de EPS/seguro del paciente','billing'),
    ('billing:reports',                'Ver reportes de ingresos y cartera',       'billing'),
    -- Evaluaciones psicométricas
    ('assessments:read',               'Ver evaluaciones del paciente',            'core'),
    ('assessments:create',             'Aplicar instrumento psicométrico',         'core'),
    -- Planes terapéuticos
    ('treatment_plans:read',           'Ver plan terapéutico del paciente',        'core'),
    ('treatment_plans:create',         'Crear plan terapéutico',                   'core'),
    ('treatment_plans:update',         'Modificar o cerrar plan terapéutico',      'core'),
    -- Reportes
    ('reports:read',                   'Ver reportes clínicos y de gestión',       'analytics'),
    ('reports:generate',               'Generar y exportar reportes',              'analytics'),
    -- Analítica
    ('analytics:read',                 'Ver dashboards y reportes',                'analytics');
```

### `role_permissions`

```sql
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Asignación de permisos a roles de sistema (seed)
-- Se hace via INSERT con subqueries en la migración inicial
```

### `user_roles`

> Un usuario puede tener múltiples roles simultáneamente.
> Ejemplo: alguien es PROFESSIONAL y además CLINIC_ADMIN.

```sql
CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    assigned_by     UUID REFERENCES users(id),
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
```

### `supervision_rel`

> Vincula un supervisor (PROFESSIONAL) con un supervisado (INTERN).
> Un practicante puede tener un solo supervisor activo.
> Un supervisor puede tener N practicantes.

```sql
CREATE TABLE supervision_rel (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    supervisor_id   UUID NOT NULL REFERENCES users(id),
    supervisee_id   UUID NOT NULL REFERENCES users(id),
    started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_at        DATE,   -- NULL = activa
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_self_supervision CHECK (supervisor_id <> supervisee_id)
);

-- Solo una relación de supervisión activa por supervisado
CREATE UNIQUE INDEX idx_supervision_active
    ON supervision_rel(supervisee_id)
    WHERE ended_at IS NULL;

CREATE INDEX idx_supervision_supervisor ON supervision_rel(supervisor_id);
```

---

## 4. Dominio: Staff & Perfiles (BC-2)

### `professional_profiles`

> Extiende `users` con datos del profesional.
> Solo existe para usuarios que tienen el rol PROFESSIONAL o INTERN.
>
> **Por qué nombres separados en lugar de `full_name`:**
> - Apellidos son el identificador primario en contextos clínicos colombianos
>   ("la paciente de García Rodríguez" vs. "la paciente de María García").
> - `ORDER BY paternal_last_name, maternal_last_name` da listados alfabéticos correctos.
> - Integración con RIPS y EPS requiere los campos por separado.
> - El tratamiento formal varía: "Dr. García" usa solo `paternal_last_name`.

```sql
CREATE TABLE professional_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    specialty_id         UUID NOT NULL REFERENCES specialties(id),
    -- Name split into 4 fields (Colombian cédula standard)
    first_name           TEXT NOT NULL,        -- [PUB]
    middle_name          TEXT,                 -- [PUB] nullable
    paternal_last_name   TEXT NOT NULL,        -- [PUB] primer apellido
    maternal_last_name   TEXT,                 -- [PUB] segundo apellido, nullable
    -- Professional data
    license_number       TEXT NOT NULL UNIQUE, -- [PUB] tarjeta profesional (Ley 1090/2006)
    license_state        license_state NOT NULL DEFAULT 'ACTIVE',
    phone                TEXT,                 -- [PUB]
    session_duration_min INTEGER NOT NULL DEFAULT 60,
    -- {"monday":{"start":"08:00","end":"18:00"},"break":["12:00","13:00"]}
    working_hours        JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prof_specialty            ON professional_profiles(specialty_id);
CREATE INDEX idx_prof_paternal_last_name   ON professional_profiles(paternal_last_name);
CREATE INDEX idx_prof_license              ON professional_profiles(license_number);
```

---

## 5. Dominio: Pacientes (BC-3)

### `encryption_keys`

```sql
CREATE TABLE encryption_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encrypted_dek BYTEA   NOT NULL,       -- DEK cifrado por MASTER_KEY (Bootstrap) o AWS KMS (Cloud)
    key_source    TEXT    NOT NULL,       -- 'env:MASTER_KEY_V1' | 'aws-kms:arn:aws:kms:...'
    algorithm     TEXT    NOT NULL DEFAULT 'AES-256-GCM',
    key_version   INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at    TIMESTAMPTZ
);
```

### `patients`

> **Por qué los 4 campos de nombre para pacientes:**
> Los mismos argumentos del profesional aplican aquí, más:
> - La historia clínica física en Colombia usa apellidos primero (ej: "GARCÍA RODRÍGUEZ, María Elena").
> - Permite distinguir entre "María García" y "María García Rodríguez" sin ambigüedad.
> - Si en el futuro hay integración con FOSYGA/ADRES, el servicio espera los campos separados.
> - Búsqueda: buscar por `paternal_last_name_hash` es la query más común en recepción.
>
> Todos los campos de nombre son `BYTEA [AEA]`. Los hashes permiten búsqueda sin descifrar.

```sql
CREATE TABLE patients (
    id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           UUID    NOT NULL REFERENCES organizations(id),
    document_type_code        TEXT    NOT NULL REFERENCES document_types(code),
    dek_id                    UUID    NOT NULL REFERENCES encryption_keys(id),
    -- Name split into 4 fields [AEA] — Colombian cédula standard
    first_name_enc            BYTEA   NOT NULL,   -- [AEA]
    middle_name_enc           BYTEA,              -- [AEA] nullable
    paternal_last_name_enc    BYTEA   NOT NULL,   -- [AEA] primer apellido
    maternal_last_name_enc    BYTEA,              -- [AEA] segundo apellido, nullable
    -- Search hashes (no decryption needed for lookup)
    paternal_last_name_hash   TEXT    NOT NULL,   -- [HASH] SHA-256(normalize(paternal_last_name))
    full_name_search_hash     TEXT    NOT NULL,   -- [HASH] SHA-256(normalize(all 4 name fields))
    -- Document [AEA]
    document_number_enc       BYTEA   NOT NULL,   -- [AEA]
    doc_search_hash           TEXT    NOT NULL,   -- [HASH] SHA-256(document_number)
    -- Contact [AEA]
    phone_enc                 BYTEA,              -- [AEA]
    email_enc                 BYTEA,              -- [AEA]
    address_enc               BYTEA,              -- [AEA]
    -- Non-PII fields
    birth_date                DATE    NOT NULL,
    gender                    TEXT,               -- free text — Decreto 1227/2015
    is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_org                ON patients(organization_id);
CREATE INDEX idx_patients_paternal_last_name ON patients(organization_id, paternal_last_name_hash);
CREATE INDEX idx_patients_full_name          ON patients(organization_id, full_name_search_hash);
CREATE INDEX idx_patients_doc                ON patients(organization_id, doc_search_hash);
CREATE INDEX idx_patients_doctype            ON patients(document_type_code);
```

### `patient_staff_rel`

> M:N entre pacientes y miembros del staff (profesionales, practicantes, supervisores).
> `relation_type` define el rol en el contexto de este paciente específico,
> que puede ser diferente al rol global del usuario.

```sql
CREATE TYPE staff_relation_type AS ENUM (
    'PRIMARY_THERAPIST',     -- terapeuta principal — puede aprobar registros
    'SECONDARY_THERAPIST',   -- co-terapeuta — acceso de lectura + borradores
    'SUPERVISING',           -- supervisor vinculado a un practicante en este caso
    'INTERN_TRAINEE',        -- practicante — crea borradores, no aprueba
    'REFERRING'              -- derivó al paciente, solo lectura del alta
);

CREATE TABLE patient_staff_rel (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    staff_id        UUID NOT NULL REFERENCES users(id),    -- [SOFT_FK si BC-3 se separa de BC-1]
    relation_type   staff_relation_type NOT NULL,
    started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_at        DATE,          -- NULL = activa
    end_reason      TEXT,          -- 'alta', 'abandono', 'derivación', 'fin_práctica'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un staff_id solo puede tener un rol activo del mismo tipo con el mismo paciente
CREATE UNIQUE INDEX idx_psr_active_unique
    ON patient_staff_rel(patient_id, staff_id, relation_type)
    WHERE ended_at IS NULL;

CREATE INDEX idx_psr_patient ON patient_staff_rel(patient_id);
CREATE INDEX idx_psr_staff   ON patient_staff_rel(staff_id);
CREATE INDEX idx_psr_org     ON patient_staff_rel(organization_id);
```

---

## 6. Dominio: Agenda (BC-4)

### `appointments`

```sql
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    staff_id        UUID NOT NULL REFERENCES users(id),     -- [SOFT_FK si BC-4 se separa]
    scheduled_at    TIMESTAMPTZ NOT NULL,
    duration_min    INTEGER NOT NULL DEFAULT 60,
    modality        appointment_modality NOT NULL DEFAULT 'IN_PERSON',
    status          appointment_status   NOT NULL DEFAULT 'SCHEDULED',
    notes_enc       BYTEA,              -- [AEA] notas internas de la cita
    -- Reagendamiento (auto-referencia)
    rescheduled_to  UUID REFERENCES appointments(id),
    -- Cancelación
    cancelled_by    UUID REFERENCES users(id),
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appt_org          ON appointments(organization_id);
CREATE INDEX idx_appt_patient      ON appointments(patient_id);
CREATE INDEX idx_appt_staff        ON appointments(staff_id);
CREATE INDEX idx_appt_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appt_status       ON appointments(status);
-- Índice para vista de agenda diaria del profesional
CREATE INDEX idx_appt_daily
    ON appointments(staff_id, scheduled_at)
    WHERE status NOT IN ('CANCELLED', 'RESCHEDULED');
```

---

## 7. Dominio: Clínico (BC-5)

### `clinical_records`

> Añadida lógica de co-firma para practicantes:
> - Si `created_by` tiene rol INTERN, el registro requiere aprobación del supervisor.
> - `status = 'APPROVED'` solo alcanzable cuando `supervisor_cosigned_at IS NOT NULL`
>   (si `requires_cosign = TRUE`) Y el profesional responsable aprueba.
> - Trigger de BD rechaza UPDATE sobre campos `_enc` y `content_hash` si `status = 'APPROVED'`.

```sql
CREATE TABLE clinical_records (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id),
    patient_id            UUID NOT NULL REFERENCES patients(id),
    -- Quién es el responsable clínico del paciente
    responsible_staff_id  UUID NOT NULL REFERENCES users(id),
    -- Quién creó físicamente este registro (puede ser un practicante)
    created_by            UUID NOT NULL REFERENCES users(id),
    appointment_id        UUID REFERENCES appointments(id),
    dek_id                UUID NOT NULL REFERENCES encryption_keys(id),
    record_type           record_type   NOT NULL,
    session_date          DATE NOT NULL,
    -- Contenido SOAP [AEA]
    subjective_enc        BYTEA,   -- [AEA] relato subjetivo
    objective_enc         BYTEA,   -- [AEA] observaciones objetivas
    assessment_enc        BYTEA,   -- [AEA] evaluación / diagnóstico
    plan_enc              BYTEA,   -- [AEA] plan terapéutico
    -- Audio [AEA]
    audio_path_enc        BYTEA,   -- [AEA] ruta local del audio (/data/audio/...) o S3 key en cloud
    audio_duration_s      INTEGER,
    -- Flujo de aprobación
    status                record_status NOT NULL DEFAULT 'DRAFT',
    -- Aprobación del responsable
    approved_at           TIMESTAMPTZ,
    -- Co-firma del supervisor (requerida si created_by es INTERN)
    requires_cosign       BOOLEAN NOT NULL DEFAULT FALSE,
    supervisor_id         UUID REFERENCES users(id),
    supervisor_cosigned_at TIMESTAMPTZ,
    -- Integridad: SHA-256(concat ordenado de campos descifrados en el momento de aprobación)
    content_hash          TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cr_org            ON clinical_records(organization_id);
CREATE INDEX idx_cr_patient        ON clinical_records(patient_id);
CREATE INDEX idx_cr_responsible    ON clinical_records(responsible_staff_id);
CREATE INDEX idx_cr_created_by     ON clinical_records(created_by);
CREATE INDEX idx_cr_session_date   ON clinical_records(session_date);
CREATE INDEX idx_cr_status         ON clinical_records(status);
CREATE INDEX idx_cr_appointment    ON clinical_records(appointment_id);
-- Registros pendientes de co-firma (cola del supervisor)
CREATE INDEX idx_cr_pending_cosign
    ON clinical_records(supervisor_id)
    WHERE requires_cosign = TRUE AND supervisor_cosigned_at IS NULL;
```

### `consents`

> Soporta dos flujos de firma:
>
> **Flujo digital:** el sistema genera el PDF → el paciente firma en pantalla (OTP o trazo) →
> `document_enc` + `signature_enc` se llenan. `scan_path_enc` queda NULL.
>
> **Flujo físico:** el sistema genera el PDF → el profesional lo imprime → el paciente lo firma
> en papel → el staff escanea el documento firmado → `scan_path_enc` apunta a la ruta local del escaneo.
> `signature_enc` queda NULL porque la firma está dentro del documento escaneado.
>
> En ambos casos `document_template_hash` identifica exactamente qué versión del texto firmó el
> paciente, garantizando integridad legal aunque el PDF original sea regenerado.

```sql
CREATE TABLE consents (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES organizations(id),
    patient_id             UUID NOT NULL REFERENCES patients(id),
    staff_id               UUID NOT NULL REFERENCES users(id),
    dek_id                 UUID NOT NULL REFERENCES encryption_keys(id),
    consent_type           consent_type NOT NULL,
    signing_method         consent_signing_method NOT NULL DEFAULT 'DIGITAL',
    -- Template stored regardless of signing method [AEA]
    document_enc           BYTEA NOT NULL,   -- [AEA] PDF of the consent template as generated
    document_template_hash TEXT  NOT NULL,   -- SHA-256 of template (which text the patient agreed to)
    -- Digital signing (only when signing_method = 'DIGITAL')
    signature_enc          BYTEA,            -- [AEA] digital signature data; NULL for physical
    signature_method       TEXT,             -- 'OTP', 'DRAWN', 'TYPED'; NULL for physical
    -- Physical scanning (only when signing_method = 'PHYSICAL_SCAN')
    scan_path_enc          BYTEA,            -- [AEA] local path of the scanned signed document (or S3 key in cloud)
    scan_file_type         TEXT,             -- 'PDF', 'JPEG', 'PNG'
    scanned_at             TIMESTAMPTZ,      -- when the scan was uploaded
    scanned_by             UUID REFERENCES users(id),  -- staff who uploaded the scan
    -- Validity
    signed_at              TIMESTAMPTZ NOT NULL,
    valid_until            TIMESTAMPTZ,      -- NULL = indefinite
    revoked_at             TIMESTAMPTZ,
    revocation_reason      TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure physical consents have a scan and digital ones have a signature
    CONSTRAINT chk_digital_has_signature
        CHECK (signing_method <> 'DIGITAL' OR signature_enc IS NOT NULL),
    CONSTRAINT chk_physical_has_scan
        CHECK (signing_method <> 'PHYSICAL_SCAN' OR scan_path_enc IS NOT NULL)
);

CREATE INDEX idx_consent_org     ON consents(organization_id);
CREATE INDEX idx_consent_patient ON consents(patient_id);
CREATE INDEX idx_consent_type    ON consents(consent_type);
CREATE INDEX idx_consent_active
    ON consents(patient_id, consent_type)
    WHERE revoked_at IS NULL;
```

### `ai_drafts`

```sql
CREATE TABLE ai_drafts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    clinical_record_id  UUID REFERENCES clinical_records(id),
    patient_id          UUID NOT NULL REFERENCES patients(id),
    requested_by        UUID NOT NULL REFERENCES users(id),
    dek_id              UUID NOT NULL REFERENCES encryption_keys(id),
    draft_content_enc   BYTEA NOT NULL,  -- [AEA] JSON SOAP generado por LLM
    transcription_enc   BYTEA,           -- [AEA] transcripción anonimizada
    ai_model_version    TEXT NOT NULL,
    whisper_model       TEXT NOT NULL,
    status              ai_draft_status NOT NULL DEFAULT 'PENDING',
    error_message       TEXT,
    processed_at        TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    resolved_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delete_after        TIMESTAMPTZ GENERATED ALWAYS AS
                            (resolved_at + INTERVAL '30 days') STORED
);

CREATE INDEX idx_draft_org         ON ai_drafts(organization_id);
CREATE INDEX idx_draft_patient     ON ai_drafts(patient_id);
CREATE INDEX idx_draft_status      ON ai_drafts(status);
CREATE INDEX idx_draft_delete_after ON ai_drafts(delete_after);
```

### `assessment_scales` — catálogo de instrumentos psicométricos

> Tabla de referencia global (sin `organization_id`).
> Define los instrumentos estandarizados disponibles: PHQ-9, GAD-7, BDI, PCL-5, etc.
> La clínica puede crear escalas personalizadas con `is_system = FALSE`.

```sql
CREATE TABLE assessment_scales (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT    NOT NULL UNIQUE,  -- 'PHQ9', 'GAD7', 'BDI_II', 'PCL5', 'MMSE'
    name            TEXT    NOT NULL,
    description     TEXT,
    -- Number of items and score range
    item_count      INTEGER NOT NULL,
    min_score       INTEGER NOT NULL DEFAULT 0,
    max_score       INTEGER NOT NULL,
    -- JSON with interpretation bands: [{"min":0,"max":4,"label":"minimal","severity":"low"}, ...]
    scoring_guide   JSONB   NOT NULL DEFAULT '[]',
    -- Which clinical contexts this scale is validated for
    target_condition TEXT,  -- 'depression', 'anxiety', 'ptsd', 'cognition', 'general'
    is_system       BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = created by the org
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO assessment_scales (code, name, item_count, min_score, max_score, target_condition, scoring_guide) VALUES
    ('PHQ9',  'Patient Health Questionnaire-9 (Depression)',         9,  0, 27, 'depression',
     '[{"min":0,"max":4,"label":"Minimal","severity":"low"},{"min":5,"max":9,"label":"Mild","severity":"low"},{"min":10,"max":14,"label":"Moderate","severity":"medium"},{"min":15,"max":19,"label":"Moderately Severe","severity":"high"},{"min":20,"max":27,"label":"Severe","severity":"critical"}]'),
    ('GAD7',  'Generalized Anxiety Disorder-7',                     7,  0, 21, 'anxiety',
     '[{"min":0,"max":4,"label":"Minimal","severity":"low"},{"min":5,"max":9,"label":"Mild","severity":"low"},{"min":10,"max":14,"label":"Moderate","severity":"medium"},{"min":15,"max":21,"label":"Severe","severity":"high"}]'),
    ('BDI_II','Beck Depression Inventory-II',                       21, 0, 63, 'depression',
     '[{"min":0,"max":13,"label":"Minimal","severity":"low"},{"min":14,"max":19,"label":"Mild","severity":"low"},{"min":20,"max":28,"label":"Moderate","severity":"medium"},{"min":29,"max":63,"label":"Severe","severity":"high"}]'),
    ('PCL5',  'PTSD Checklist for DSM-5',                          20, 0, 80, 'ptsd',
     '[{"min":0,"max":32,"label":"Below threshold","severity":"low"},{"min":33,"max":80,"label":"Probable PTSD","severity":"high"}]'),
    ('MMSE',  'Mini-Mental State Examination',                     30, 0, 30, 'cognition',
     '[{"min":25,"max":30,"label":"Normal","severity":"low"},{"min":18,"max":24,"label":"Mild impairment","severity":"medium"},{"min":0,"max":17,"label":"Severe impairment","severity":"high"}]');
```

### `patient_assessments` — seguimiento longitudinal de escalas

> Cada fila es una aplicación de un instrumento psicométrico en una sesión.
> Permite graficar la evolución del paciente a lo largo del tratamiento
> (ej: PHQ-9 sesión 1 = 18, sesión 5 = 12, sesión 10 = 6 → respuesta positiva).
>
> Las respuestas individuales van cifradas. El `total_score` e `interpretation`
> son datos no-PII que sí pueden fluir a `domain_events` para analytics.

```sql
CREATE TABLE patient_assessments (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID    NOT NULL REFERENCES organizations(id),
    patient_id          UUID    NOT NULL REFERENCES patients(id),
    staff_id            UUID    NOT NULL REFERENCES users(id),
    clinical_record_id  UUID    REFERENCES clinical_records(id),  -- linked to the session
    scale_id            UUID    NOT NULL REFERENCES assessment_scales(id),
    dek_id              UUID    NOT NULL REFERENCES encryption_keys(id),
    applied_at          TIMESTAMPTZ NOT NULL,
    -- Individual responses [AEA] — JSON: {"q1": 2, "q2": 0, "q3": 3, ...}
    responses_enc       BYTEA   NOT NULL,   -- [AEA]
    -- Computed at application time (not re-derived later)
    total_score         INTEGER NOT NULL,
    interpretation      TEXT,               -- label from scoring_guide (e.g. 'Moderate')
    severity            TEXT,               -- 'low', 'medium', 'high', 'critical'
    notes_enc           BYTEA,              -- [AEA] clinical notes on this assessment
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assessment_org       ON patient_assessments(organization_id);
CREATE INDEX idx_assessment_patient   ON patient_assessments(patient_id);
CREATE INDEX idx_assessment_scale     ON patient_assessments(scale_id);
CREATE INDEX idx_assessment_staff     ON patient_assessments(staff_id);
-- Evolution over time per patient+scale (the most common query for follow-up charts)
CREATE INDEX idx_assessment_evolution
    ON patient_assessments(patient_id, scale_id, applied_at ASC);
```

### `treatment_plans` — plan terapéutico formal

> Un paciente tiene un plan activo a la vez por profesional responsable.
> El plan define las metas del tratamiento y el enfoque — sirve de hilo conductor
> entre sesiones y permite evaluar si el tratamiento está funcionando.
> Todos los campos de contenido clínico van cifrados.

```sql
CREATE TYPE treatment_plan_status AS ENUM (
    'ACTIVE',
    'COMPLETED',     -- alta terapéutica exitosa
    'DISCONTINUED'   -- abandono o derivación
);

CREATE TABLE treatment_plans (
    id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID    NOT NULL REFERENCES organizations(id),
    patient_id           UUID    NOT NULL REFERENCES patients(id),
    responsible_staff_id UUID    NOT NULL REFERENCES users(id),
    dek_id               UUID    NOT NULL REFERENCES encryption_keys(id),
    -- Clinical content [AEA]
    diagnosis_enc        BYTEA,              -- [AEA] clinical diagnosis / CIE-10 codes
    goals_enc            BYTEA,              -- [AEA] JSON array of therapeutic goals
    approach_enc         BYTEA,              -- [AEA] therapeutic approach / modality
    -- Timeline
    started_at           DATE    NOT NULL DEFAULT CURRENT_DATE,
    estimated_end_at     DATE,              -- optional target date
    actual_end_at        DATE,
    status               treatment_plan_status NOT NULL DEFAULT 'ACTIVE',
    end_reason_enc       BYTEA,             -- [AEA] clinical rationale for ending/modifying
    -- Review cadence
    next_review_at       DATE,              -- when the plan should be formally reviewed
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active plan per patient-professional pair
CREATE UNIQUE INDEX idx_treatment_plan_active
    ON treatment_plans(patient_id, responsible_staff_id)
    WHERE status = 'ACTIVE';

CREATE INDEX idx_treatment_plan_org     ON treatment_plans(organization_id);
CREATE INDEX idx_treatment_plan_patient ON treatment_plans(patient_id);
CREATE INDEX idx_treatment_plan_review  ON treatment_plans(next_review_at)
    WHERE status = 'ACTIVE';
```

---

## 7.6 Dominio: Facturación (BC-6)

> Activado por `organizations.features.module_billing = true`.
> Todo el dominio puede desactivarse sin afectar los BCs clínicos.
> El `patient_id` en estas tablas es un `[SOFT_FK]` hacia BC-3 — si Billing se separa
> en su propio servicio, lo consulta vía API, no vía JOIN.

### `service_rates` — tarifario de servicios

> Define cuánto cobra la clínica por cada tipo de sesión.
> Permite tarifas distintas por modalidad (presencial vs virtual) y por vigencia.
> Sin `organization_id` como FK para permitir tarifas globales en cadenas de clínicas.

```sql
CREATE TABLE service_rates (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID    NOT NULL REFERENCES organizations(id),
    name             TEXT    NOT NULL,          -- 'Sesión individual', 'Evaluación inicial', 'Interconsulta'
    description      TEXT,
    specialty_id     UUID    REFERENCES specialties(id),  -- NULL = applies to all specialties
    modality         appointment_modality,                -- NULL = same price for all modalities
    amount           NUMERIC(10,2) NOT NULL,
    currency         CHAR(3) NOT NULL DEFAULT 'COP',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from       DATE    NOT NULL DEFAULT CURRENT_DATE,
    valid_until      DATE,                      -- NULL = no expiry
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rates_org      ON service_rates(organization_id);
CREATE INDEX idx_rates_active   ON service_rates(organization_id, is_active, valid_from);
```

### `patient_billing_profiles` — perfil de facturación del paciente

> Extiende `patients` con datos de seguro/EPS y método de pago preferido.
> Solo existe si el módulo de facturación está activo.
> Los datos de póliza y EPS son PII → cifrados.

```sql
CREATE TABLE patient_billing_profiles (
    patient_id            UUID    PRIMARY KEY,       -- [SOFT_FK] → patients.id (BC-3)
    organization_id       UUID    NOT NULL REFERENCES organizations(id),
    dek_id                UUID    NOT NULL REFERENCES encryption_keys(id),
    -- Insurance coverage
    insurance_type        TEXT,                      -- 'EPS', 'MEDICINA_PREPAGADA', 'ARL', 'NONE'
    insurance_name_enc    BYTEA,                     -- [AEA] name of EPS / insurer
    policy_number_enc     BYTEA,                     -- [AEA] membership / policy number
    -- For EPS billing: RIPS authorization (renewed per period)
    eps_auth_code_enc     BYTEA,                     -- [AEA] current authorization code
    eps_auth_expires_at   DATE,
    -- Billing preferences
    preferred_payment_method payment_method_type,
    billing_email_enc     BYTEA,                     -- [AEA] email for invoices (may differ from contact email)
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_profile_org ON patient_billing_profiles(organization_id);
```

### `invoices` — facturas por sesión

> Una factura se crea automáticamente cuando la cita pasa a `COMPLETED`,
> o manualmente por el recepcionista.
> Soporta factura electrónica DIAN (Resolución 000042/2020) vía `dian_invoice_number`.

```sql
CREATE TABLE invoices (
    id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID    NOT NULL REFERENCES organizations(id),
    patient_id           UUID    NOT NULL,       -- [SOFT_FK] → patients.id
    appointment_id       UUID,                   -- [SOFT_FK] → appointments.id; NULL for manual invoices
    rate_id              UUID    REFERENCES service_rates(id),
    dek_id               UUID    NOT NULL REFERENCES encryption_keys(id),
    -- Amounts (COP by default)
    currency             CHAR(3) NOT NULL DEFAULT 'COP',
    subtotal             NUMERIC(10,2) NOT NULL,
    discount             NUMERIC(10,2) NOT NULL DEFAULT 0,
    insurance_covered    NUMERIC(10,2) NOT NULL DEFAULT 0,  -- amount paid by EPS/insurance
    total_due            NUMERIC(10,2) NOT NULL,            -- subtotal - discount - insurance_covered
    total_paid           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- updated as payments come in
    -- Status
    status               invoice_status NOT NULL DEFAULT 'DRAFT',
    -- Colombian tax compliance (DIAN electronic invoicing)
    dian_invoice_number  TEXT    UNIQUE,         -- número de factura electrónica; NULL until issued
    issued_at            TIMESTAMPTZ,
    due_at               TIMESTAMPTZ,
    -- Internal notes [AEA]
    notes_enc            BYTEA,                  -- [AEA]
    created_by           UUID    NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_org        ON invoices(organization_id);
CREATE INDEX idx_invoice_patient    ON invoices(patient_id);
CREATE INDEX idx_invoice_status     ON invoices(organization_id, status);
CREATE INDEX idx_invoice_appointment ON invoices(appointment_id);
-- Overdue invoices (for collections follow-up)
CREATE INDEX idx_invoice_overdue
    ON invoices(due_at)
    WHERE status IN ('ISSUED', 'PARTIAL') AND due_at IS NOT NULL;
```

### `payments` — transacciones de pago

> Una factura puede tener múltiples pagos parciales.
> La suma de `payments.amount` donde `invoice_id` coincide debe igualar `invoices.total_paid`.

```sql
CREATE TABLE payments (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID    NOT NULL REFERENCES organizations(id),
    invoice_id       UUID    NOT NULL REFERENCES invoices(id),
    amount           NUMERIC(10,2) NOT NULL,
    currency         CHAR(3) NOT NULL DEFAULT 'COP',
    payment_method   payment_method_type NOT NULL,
    -- Transaction reference for non-cash methods [AEA]
    reference_enc    BYTEA,   -- [AEA] bank transfer ID, card approval code, Nequi TX id
    paid_at          TIMESTAMPTZ NOT NULL,
    recorded_by      UUID    NOT NULL REFERENCES users(id),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_org     ON payments(organization_id, paid_at DESC);
CREATE INDEX idx_payments_method  ON payments(organization_id, payment_method);
```

---

## 8. Infraestructura Transversal

### `domain_events` — Outbox Pattern

> Cada operación importante escribe un evento en esta tabla en la **misma transacción**.
> Una goroutine dentro de `core-api` (`outbox-publisher`) lee los no publicados y los envía
> a Redis Streams. Garantiza at-least-once delivery hacia la capa analítica.
>
> El `payload` contiene solo IDs y métricas — NUNCA PII ni campos cifrados.
> Esta tabla es el punto de integración con módulos futuros y el data warehouse.

```sql
CREATE TABLE domain_events (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL,                -- [SOFT_FK] sin REFERENCES por diseño
    aggregate_type  TEXT    NOT NULL,                -- 'Patient', 'ClinicalRecord', 'Appointment'
    aggregate_id    UUID    NOT NULL,
    event_type      TEXT    NOT NULL,
    -- Anonymized payload — examples (no PII ever):
    -- PatientCreated:        {"document_type": "CC", "birth_year": 1990, "gender": "F"}
    -- RecordApproved:        {"record_type": "EVOLUTION", "had_ai_assist": true, "session_date": "2026-04-23", "cosigned": false}
    -- AppointmentCancelled:  {"modality": "VIRTUAL", "cancelled_by_role": "PATIENT", "notice_hours": 2}
    -- AssessmentApplied:     {"scale_code": "PHQ9", "total_score": 14, "severity": "moderate", "session_number": 5}
    -- TreatmentPlanClosed:   {"status": "COMPLETED", "duration_days": 180, "total_sessions": 22}
    -- TreatmentPlanReviewed: {"scale_code": "PHQ9", "score_delta": -8, "weeks_elapsed": 12}
    -- InvoiceIssued:         {"currency": "COP", "total_due": 120000, "insurance_covered": 0, "modality": "IN_PERSON"}
    -- PaymentReceived:       {"method": "NEQUI", "amount": 120000, "invoice_status_after": "PAID"}
    -- ConsentSigned:         {"consent_type": "RECORDING", "signing_method": "PHYSICAL_SCAN"}
    payload         JSONB   NOT NULL DEFAULT '{}',
    -- Control de publicación
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_unpublished
    ON domain_events(occurred_at)
    WHERE published = FALSE;
CREATE INDEX idx_events_aggregate
    ON domain_events(aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX idx_events_org
    ON domain_events(organization_id, event_type, occurred_at DESC);
```

### `audit_log` — Append-Only

> `GRANT INSERT, SELECT ON audit_log TO app_user;` — sin UPDATE, sin DELETE.

```sql
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    organization_id UUID,
    user_id         UUID,
    user_email_hash TEXT,       -- [HASH]
    -- Roles activos del usuario en el momento (snapshot — puede cambiar después)
    user_roles_snapshot TEXT[], -- Ej: ['PROFESSIONAL', 'CLINIC_ADMIN']
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     UUID,
    ip_address      INET,
    user_agent      TEXT,
    success         BOOLEAN NOT NULL,
    error_code      TEXT,
    metadata        JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Particionamiento por año para retención de 15 años (pg_partman)
CREATE INDEX idx_audit_org         ON audit_log(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_user        ON audit_log(user_id, occurred_at DESC);
CREATE INDEX idx_audit_resource    ON audit_log(resource_type, resource_id, occurred_at DESC);
CREATE INDEX idx_audit_occurred_at ON audit_log(occurred_at DESC);
```

---

## 9. DER Completo

```
╔══════════════ BC-1: ORGANIZACIÓN & AUTH ════════════════════════════════════╗
║                                                                              ║
║  organizations                                                               ║
║  ┌─────────────────┐                                                        ║
║  │ id PK           │◄──────────────────────── organization_id FK             ║
║  │ name, slug, nit │        (en users, patients, appointments, etc.)         ║
║  │ plan, features  │                                                         ║
║  └────────┬────────┘                                                        ║
║           │ 1:N                                                              ║
║           ▼                                                                  ║
║  users                    roles             permissions                      ║
║  ┌─────────────────┐      ┌──────────────┐  ┌────────────────┐              ║
║  │ id PK           │      │ id PK        │  │ id PK          │              ║
║  │ organization_id │      │ org_id (null │  │ code (unique)  │              ║
║  │ email_hash      │      │   =sistema)  │  │ module         │              ║
║  │ password_hash   │      │ name         │  └───────┬────────┘              ║
║  │ mfa_secret_enc  │      └──────┬───────┘          │                       ║
║  └──────┬──────────┘             │ M:N              │ M:N                   ║
║         │                        └────┬─────────────┘                       ║
║         │ M:N (user_roles)             ▼                                     ║
║         └─────────────────► role_permissions                                ║
║                              (role_id FK, permission_id FK)                  ║
║                                                                              ║
║  supervision_rel                                                              ║
║  (supervisor_id FK → users, supervisee_id FK → users)                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
                  │ user_id [SOFT_FK cruce BC-1→BC-2]
╔══════════════ BC-2: STAFF & PERFILES ═══════════════════════════════════════╗
║                                                                              ║
║  professional_profiles                  specialties                          ║
║  ┌──────────────────────────────┐       ┌───────────────┐                   ║
║  │ user_id PK/FK                │──N:1─►│ id PK         │                   ║
║  │ first_name [PUB]             │       │ code, name    │                   ║
║  │ middle_name [PUB]            │       └───────────────┘                   ║
║  │ paternal_last_name [PUB]     │                                            ║
║  │ maternal_last_name [PUB]     │                                            ║
║  │ license_number [PUB]         │                                            ║
║  │ working_hours JSONB          │                                            ║
║  └──────────────────────────────┘                                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
                  │ staff_id [SOFT_FK cruce BC-2→BC-3]
╔══════════════ BC-3: PACIENTES ══════════════════════════════════════════════╗
║                                                                              ║
║  document_types       encryption_keys                                        ║
║  ┌──────────────┐     ┌─────────────────┐                                   ║
║  │ code PK      │     │ id PK           │◄──── dek_id FK                    ║
║  │ name         │     │ encrypted_dek   │      (patients, records,           ║
║  │ requires_exp │     │ key_source      │       consents, ai_drafts)         ║
║  └──────┬───────┘     └─────────────────┘                                   ║
║         │ 1:N (document_type_code)                                           ║
║         ▼                                                                    ║
║  patients                                                                    ║
║  ┌───────────────────────────────────┐                                      ║
║  │ id PK                             │                                       ║
║  │ organization_id FK                │                                       ║
║  │ first_name_enc          [AEA]     │                                       ║
║  │ middle_name_enc         [AEA]     │                                       ║
║  │ paternal_last_name_enc  [AEA]     │                                       ║
║  │ maternal_last_name_enc  [AEA]     │                                       ║
║  │ paternal_last_name_hash [HASH]    │                                       ║
║  │ full_name_search_hash   [HASH]    │                                       ║
║  │ document_number_enc  [AEA]        │                                       ║
║  │ doc_search_hash      [HASH]       │                                       ║
║  │ phone_enc, email_enc [AEA]        │                                       ║
║  │ birth_date, gender               │                                       ║
║  └──────────────┬────────────────────┘                                      ║
║                 │ M:N                                                        ║
║                 ▼                                                            ║
║  patient_staff_rel                                                           ║
║  (patient_id FK, staff_id [SOFT_FK], relation_type ENUM)                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
         │ patient_id FK          │ patient_id FK
╔════════▼═══════════╗   ╔═══════▼══════════════════════════════════════════╗
║ BC-4: AGENDA       ║   ║ BC-5: CLÍNICO                                    ║
║                    ║   ║                                                   ║
║  appointments      ║   ║  clinical_records                                 ║
║  ┌─────────────┐   ║   ║  ┌──────────────────────────────┐                ║
║  │ id PK       │   ║   ║  │ id PK                        │                ║
║  │ patient_id  │   ║   ║  │ patient_id FK                │                ║
║  │ staff_id    │   ║   ║  │ responsible_staff_id FK       │                ║
║  │ scheduled_at│   ║   ║  │ created_by FK                │                ║
║  │ modality    │   ║   ║  │ appointment_id FK [SOFT_FK]  │                ║
║  │ status ENUM │   ║   ║  │ subjective/objective_enc[AEA]│                ║
║  │ notes_enc   │   ║   ║  │ assessment/plan_enc    [AEA] │                ║
║  └─────────────┘   ║   ║  │ requires_cosign, supervisor_id│               ║
╚════════════════════╝   ║  └────────────────┬─────────────┘                ║
                         ║                   │ 1:0..1                        ║
                         ║                   ▼                               ║
                         ║  ai_drafts         consents                       ║
                         ║  (clinical_record_id FK, draft_content_enc [AEA]) ║
                         ╚═══════════════════════════════════════════════════╝

══════════════════ TRANSVERSAL ═══════════════════════════════════════════════

  domain_events ◄── escritura en misma TX que el evento de negocio
  (aggregate_type, aggregate_id, payload SIN PII)
          │ outbox-publisher goroutine (core-api)
          ▼
  [Redis Streams] → Consumidores (analytics, notificaciones, billing)

  audit_log ◄── todos los eventos (append-only, sin UPDATE ni DELETE)
```

---

## 10. RBAC — Matriz de Permisos Predefinidos

```
Permiso                        SYS_ADMIN CLINIC_ADMIN PROFESSIONAL INTERN RECEPTIONIST PATIENT
─────────────────────────────────────────────────────────────────────────────────────────────
organization:read                 ✓          ✓           -           -         -          -
organization:configure            ✓          ✓           -           -         -          -
users:read                        ✓          ✓           -           -         -          -
users:create/update/deactivate    ✓          ✓           -           -         -          -
patients:read (propios)           ✓          ✓           ✓           ✓         ✓          -
patients:read_all                 ✓          ✓           -           -         ✓          -
patients:create/update            ✓          ✓           ✓           -         ✓          -
clinical_records:read             ✓          ✓           ✓ (propios) ✓(asign)  -          -
clinical_records:create/update    ✓          ✓           ✓           ✓         -          -
clinical_records:approve          ✓          ✓           ✓           -         -          -
clinical_records:cosign           ✓          ✓           ✓(supervisor) -       -          -
appointments:read                 ✓          ✓           ✓           ✓         ✓         ✓(propias)
appointments:create/update        ✓          ✓           ✓           -         ✓          -
appointments:cancel               ✓          ✓           ✓           -         ✓         ✓(propias)
consents:read                     ✓          ✓           ✓           ✓         -         ✓(propios)
consents:create                   ✓          ✓           ✓           -         -          -
ai_drafts:request                 ✓          ✓           ✓           ✓         -          -
ai_drafts:review                  ✓          ✓           ✓           ✓(asign)  -          -
assessments:read                  ✓          ✓           ✓           ✓(asign)  -         ✓(propios)
assessments:create                ✓          ✓           ✓           ✓(asign)  -          -
treatment_plans:read              ✓          ✓           ✓           ✓(asign)  -         ✓(propio)
treatment_plans:create/update     ✓          ✓           ✓           -         -          -
reports:read                      ✓          ✓           ✓(propios)  -         ✓(agenda)  -
reports:generate                  ✓          ✓           ✓(propios)  -         -          -
audit_log:read                    ✓          ✓           -           -         -          -
inventory:*                       ✓          ✓           -           -         ✓(read)    -
billing:read                      ✓          ✓           -           -         ✓          ✓(propios)
billing:create                    ✓          ✓           -           -         ✓          -
billing:record_payment            ✓          ✓           -           -         ✓          -
billing:manage_rates              ✓          ✓           -           -         -          -
billing:manage_insurance          ✓          ✓           -           -         ✓          -
billing:reports                   ✓          ✓           -           -         -          -
analytics:read                    ✓          ✓           ✓(propios)  -         -          -
```

**Caso de uso — practicante integrado:**
1. Admin crea usuario con rol `INTERN`.
2. Admin crea `supervision_rel` vinculando al supervisor.
3. Supervisor agrega al practicante como `INTERN_TRAINEE` en `patient_staff_rel` para cada paciente asignado.
4. El practicante puede crear `clinical_records` con `requires_cosign = TRUE` automáticamente.
5. El supervisor ve la cola de pendientes (`idx_cr_pending_cosign`) y co-firma.
6. El profesional responsable aprueba el registro final.

---

## 11. Capa Analítica — Separación Operacional vs. Analítica

```
┌─────────────────────────────────────────────────────────────────────────┐
│  QUÉ SALE DE LA CAPA OPERACIONAL HACIA ANALYTICS                        │
│                                                                         │
│  domain_events.payload — SOLO:                                          │
│    • IDs (UUID) — sin nombres, sin documentos                           │
│    • Fechas y duraciones                                                 │
│    • Tipos y estados (ENUM values)                                       │
│    • Métricas booleanas ("¿usó IA?", "¿fue puntual?")                   │
│    • Conteos y rangos (edad en años, no fecha de nacimiento)            │
│                                                                         │
│  QUÉ NO SALE NUNCA:                                                     │
│    • Ningún campo _enc (BYTEA cifrado)                                  │
│    • Ningún campo de nombre, documento, teléfono, email, dirección      │
│    • content_hash, document_hash, signature                             │
│    • audio_path_enc, scan_path_enc (rutas de archivo)                  │
│                                                                         │
│  MÉTRICAS DISPONIBLES EN ANALYTICS (ejemplos):                          │
│    • Sesiones completadas por semana / mes / profesional                │
│    • Tasa de cancelación (total y por modalidad)                        │
│    • Distribución de tipos de registro (INITIAL vs EVOLUTION)           │
│    • Tasa de uso y aprobación de borradores IA                          │
│    • Tiempo promedio entre cita y registro aprobado                     │
│    • Ocupación del profesional (citas / capacidad)                      │
│    • Consentimientos pendientes por tipo                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Notas de Implementación

| # | Regla | Detalle |
|---|---|---|
| 1 | **Row-Level Security** | `ALTER TABLE patients ENABLE ROW LEVEL SECURITY;` con política `organization_id = current_setting('app.org_id')`. Aislamiento multi-tenant a nivel de BD. |
| 2 | **Permisos de BD por tabla** | `app_user`: SELECT/INSERT/UPDATE/DELETE en todo excepto `audit_log` (INSERT/SELECT), `document_types` y `specialties` (SELECT), `encryption_keys` (SELECT/INSERT). |
| 3 | **Trigger de inmutabilidad** | Al aprobar un `clinical_record`, trigger rechaza UPDATE posterior sobre `*_enc` y `content_hash`. Aplica también a `consents`. |
| 4 | **Feature flags por org** | `organizations.features JSONB` controla qué módulos están activos. El backend verifica `features.module_inventory` antes de exponer esos endpoints. Añadir un módulo = INSERT en permissions + UPDATE en features. |
| 5 | **Suavizar FKs al separar BCs** | Los `[SOFT_FK]` marcados son los primeros candidatos a eliminar `REFERENCES` cuando un BC se separa. La integridad pasa a ser responsabilidad del servicio dueño del dato. |
| 6 | **Búsquedas sobre PII** | Solo por hash exacto. Para búsqueda difusa (autocomplete por apellido), la app descifra resultados del hash y filtra en memoria. Nunca `LIKE` sobre datos cifrados. |
| 7 | **Outbox publisher** | Goroutine dentro de `core-api`. Lee `domain_events WHERE published = FALSE ORDER BY occurred_at` en lotes de 100, publica a Redis Streams, marca `published = TRUE`. Idempotente — si Redis cae, los eventos quedan con `published = FALSE` y se re-publican al reiniciar. |
| 8 | **Migraciones** | `golang-migrate`. Cada migración tiene `up` y `down`. Los ENUMs se extienden con `ALTER TYPE ... ADD VALUE` — sin `down` posible, considerarlo antes de aplicar. |
