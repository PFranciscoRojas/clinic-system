CREATE TABLE legal_documents (
    id           BIGSERIAL    PRIMARY KEY,
    doc_type     TEXT         NOT NULL,
    version      TEXT         NOT NULL,
    body_md      TEXT         NOT NULL,
    is_current   BOOLEAN      NOT NULL DEFAULT true,
    published_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by   UUID
);

-- Only one current version per doc_type at any time.
CREATE UNIQUE INDEX legal_documents_current ON legal_documents (doc_type) WHERE is_current;

-- Public read access (no RLS — docs are global, not per-tenant).
GRANT SELECT ON legal_documents TO sghcp_app;

-- ── Seed: initial versions (matching content.ts @ 2026-06-24) ──────────────

INSERT INTO legal_documents (doc_type, version, body_md) VALUES (
'privacy',
'2026-06-24',
$$## Política de Tratamiento de Datos Personales

*Ley 1581 de 2012 · Decreto 1377 de 2013*

### 1. Identificación del Responsable y del Encargado del tratamiento

Chapni (en adelante "Chapni", "nosotros" o "el Encargado") es una plataforma de software como servicio (SaaS) para la gestión de historias clínicas psicológicas. Opera bajo la legislación colombiana.

Para efectos de la Ley 1581 de 2012, el profesional o la institución que contrata el servicio (en adelante "el Responsable") es quien determina los fines y medios del tratamiento de los datos personales de sus pacientes. Chapni actúa como Encargado del tratamiento, procesando dichos datos únicamente por instrucción del Responsable y conforme a las condiciones pactadas.

Los datos personales del Responsable y de los usuarios de la plataforma (correo, nombre, información de pago) son tratados directamente por Chapni en su calidad de Responsable para los fines descritos en esta política.

Canal de contacto: privacidad@chapni.com

### 2. Datos que recopilamos

**De los profesionales y administradores (clientes de Chapni):** nombre completo, correo electrónico, información de facturación y pago (procesada por MercadoPago S.A.S.), historial de suscripción, registros de uso y acceso.

**De los pacientes de nuestros clientes:** estos datos (nombre, número de documento, teléfono, historia clínica, notas SOAP) son ingresados por el profesional como Responsable. Chapni los almacena cifrados (AES-256-GCM con clave única por paciente) y los trata exclusivamente para prestar el servicio contratado.

**Datos técnicos:** dirección IP, agente de usuario, registros de auditoría internos (fecha/hora de acceso, acciones realizadas). Estos registros son necesarios para la seguridad del sistema y el cumplimiento de la Resolución 1995 de 1999.

### 3. Finalidades del tratamiento

- Prestación del servicio de gestión de historias clínicas psicológicas en modalidad SaaS.
- Gestión de la relación contractual y de facturación con el profesional.
- Envío de comunicaciones operativas y de soporte relacionadas con el servicio.
- Cumplimiento de obligaciones legales, incluyendo las dispuestas en la Resolución 1995 de 1999 (retención de historia clínica por mínimo 15 años) y la Ley 23 de 1981 (secreto profesional).
- Seguridad e integridad de la plataforma.
- Mejora del servicio mediante análisis agregados y anónimos de uso.

### 4. Derechos del titular

Como titular de datos personales, usted tiene los siguientes derechos reconocidos por la Ley 1581 de 2012:

- Conocer los datos personales que Chapni trata sobre usted.
- Actualizar y rectificar sus datos cuando sean inexactos, incompletos o fraccionados.
- Solicitar la supresión de sus datos cuando no exista deber legal de conservarlos.
- Revocar la autorización otorgada para el tratamiento, en los términos permitidos por la ley.
- Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la normativa de protección de datos.

### 5. Cómo ejercer sus derechos (consultas y reclamos)

Para ejercer sus derechos, envíe una solicitud al correo privacidad@chapni.com indicando: (i) nombre completo y documento de identidad, (ii) descripción clara de la solicitud, (iii) documentos que soporten la solicitud si aplica.

El término de respuesta es de 10 días hábiles para consultas y 15 días hábiles para reclamos, conforme al Decreto 1377 de 2013. Si el reclamo está incompleto, se solicitará la información faltante dentro de los 5 días hábiles siguientes a la recepción.

### 6. Encargados del tratamiento (sub-encargados)

Para prestar el servicio, Chapni comparte datos con los siguientes proveedores, quienes actúan como sub-encargados bajo acuerdos de confidencialidad y protección de datos:

- **MercadoPago S.A.S. (Colombia):** procesamiento de pagos y suscripciones.
- **Anthropic PBC (EE. UU.):** modelos de inteligencia artificial para generación de borradores clínicos. Solo recibe texto anonimizado; nunca recibe nombre, documento ni datos de identificación del paciente.
- **Hetzner Online GmbH (Alemania):** infraestructura de servidores donde residen los datos.
- **Backblaze Inc. (EE. UU.):** almacenamiento de respaldos cifrados.

El audio de las sesiones es procesado por Whisper, un modelo que corre localmente en la infraestructura de Chapni. El audio nunca sale del servidor.

### 7. Medidas de seguridad

Chapni implementa medidas técnicas y organizativas para proteger los datos, incluyendo: cifrado AES-256-GCM con clave única por paciente para todos los datos clínicos (nombre, documento, teléfono, notas); transmisión bajo TLS/HTTPS; control de acceso basado en roles (RBAC) con aislamiento multi-tenant por organización (Row-Level Security en PostgreSQL); autenticación con bcrypt; respaldos cifrados con GPG y almacenados en Backblaze B2; registro de auditoría de todas las operaciones sobre datos clínicos.

### 8. Período de conservación

Los datos de historia clínica se conservan por el período mínimo exigido por la Resolución 1995 de 1999 (15 años desde la última atención). Los datos de facturación y de cuenta se conservan durante la vigencia de la relación contractual y por el período adicional que exija la normativa tributaria colombiana.

Los borradores de historia clínica generados por IA y no aprobados por el profesional se eliminan automáticamente transcurrido el período configurado por el profesional (mínimo 6 meses).

### 9. Modificaciones a esta política

Chapni podrá modificar esta política en cualquier momento. Los cambios materiales se comunicarán por correo electrónico con al menos 10 días de anticipación. El uso continuado del servicio después de dicho período implica la aceptación de la versión actualizada.$$
);

INSERT INTO legal_documents (doc_type, version, body_md) VALUES (
'terms',
'2026-06-24',
$$## Términos y Condiciones del Servicio

*Ley 1480 de 2011 (Estatuto del Consumidor)*

### 1. Descripción del servicio

Chapni es una plataforma de gestión de historias clínicas psicológicas (SaaS) que permite a profesionales de la salud mental y a sus equipos llevar registros clínicos, gestionar citas, obtener borradores asistidos por inteligencia artificial y administrar su consultorio.

El servicio es de uso exclusivo para profesionales habilitados y sus organizaciones. Al contratar el servicio, el profesional declara estar legalmente autorizado para ejercer la psicología o la salud mental en Colombia conforme a la Ley 1090 de 2006.

### 2. Registro y cuenta

Para usar el servicio es necesario crear una cuenta y proporcionar información veraz, actualizada y completa. El usuario es responsable de mantener la confidencialidad de sus credenciales y de todas las actividades realizadas desde su cuenta.

Chapni se reserva el derecho de suspender o cancelar cuentas que incumplan estos términos, sean utilizadas de forma fraudulenta, o cuya información resulte falsa o engañosa.

### 3. Planes, suscripción y renovación automática

El servicio se ofrece mediante suscripción de pago, con planes mensuales, trimestrales o anuales según los precios publicados en la plataforma. Todos los precios incluyen IVA.

La suscripción se renueva automáticamente al final de cada período, salvo que el usuario la cancele antes. El cobro se realiza a través de MercadoPago sobre el método de pago registrado.

El período de prueba gratuita (14 días) no requiere tarjeta de crédito. Al vencer sin activar un plan pago, el acceso queda restringido hasta que se active una suscripción.

### 4. Política de reembolsos

El usuario podrá solicitar reembolso dentro de los 5 días calendario siguientes al primer cobro de una nueva suscripción, siempre que no haya realizado más de 10 sesiones de uso activo durante ese período.

No se realizan reembolsos proporcionales por cancelaciones anticipadas de suscripciones en curso. Al cancelar, el servicio permanece activo hasta el final del período pagado.

Para solicitar un reembolso, contacte a legal@chapni.com con el asunto "Solicitud de reembolso" adjuntando el comprobante de pago. El reembolso se tramitará en un plazo de 5 a 15 días hábiles.

### 5. Obligaciones del usuario

- Usar el servicio únicamente para los fines lícitos descritos y en cumplimiento de la normativa vigente.
- Obtener el consentimiento informado de sus pacientes para el tratamiento de sus datos conforme a la Ley 1581 de 2012, antes de registrar información en la plataforma.
- No compartir credenciales de acceso con personas no autorizadas.
- No intentar vulnerar la seguridad del sistema, acceder a datos de otras organizaciones ni realizar ingeniería inversa del software.
- Mantener la información de su cuenta y método de pago actualizada.

### 6. Inteligencia artificial — aviso legal

Chapni incorpora herramientas de inteligencia artificial para generar borradores de notas clínicas a partir de transcripciones de audio o datos ingresados por el profesional. Estos borradores son sugerencias automáticas y **NO** constituyen diagnósticos, prescripciones ni historia clínica definitiva.

La responsabilidad clínica, diagnóstica y terapéutica recae exclusivamente en el profesional habilitado. El profesional debe revisar, editar y aprobar explícitamente cada borrador antes de que sea incorporado a la historia clínica.

Los textos procesados por los modelos de IA se anonimizan antes de ser enviados al proveedor externo (Anthropic). El audio de las sesiones se procesa localmente y nunca sale de la infraestructura de Chapni.

### 7. Propiedad intelectual

El código fuente, diseño, marca y demás elementos de Chapni son propiedad de sus desarrolladores y están protegidos por la Ley 23 de 1982 y la Decisión Andina 351. El usuario obtiene una licencia de uso limitada, no exclusiva e intransferible.

Los datos clínicos ingresados por el profesional y sus pacientes son de titularidad del profesional y/o de la organización. Chapni no reclama derechos sobre dichos datos y se compromete a entregarlos o eliminarlos a solicitud del usuario conforme a la política de privacidad.

### 8. Limitación de responsabilidad

Chapni no garantiza la disponibilidad ininterrumpida del servicio; en caso de interrupción, el objetivo de recuperación es de 24 horas. Se excluye la responsabilidad por daños indirectos, lucro cesante o pérdida de datos ocasionada por causas fuera del control de Chapni (fuerza mayor, fallas de proveedores de infraestructura, ataques externos).

La responsabilidad total de Chapni frente al usuario no podrá superar el valor pagado por el servicio en los tres meses anteriores al evento que originó el daño.

### 9. Terminación del servicio

El usuario puede cancelar su suscripción en cualquier momento desde Configuración → Facturación. Tras la cancelación, los datos se conservan durante 90 días para permitir la exportación. Después de ese plazo, los datos se eliminan salvo que la ley exija conservarlos (Resolución 1995 de 1999).

Chapni puede suspender o terminar el servicio por incumplimiento de estos términos, previa notificación por correo electrónico con un mínimo de 5 días hábiles de antelación, excepto en casos de uso fraudulento o ilegal.

### 10. Ley aplicable y jurisdicción

Estos términos se rigen por las leyes de la República de Colombia. Para la resolución de controversias, las partes acuerdan someterse a la jurisdicción de los jueces y tribunales de la ciudad de Bogotá D.C., o al mecanismo de arbitraje previsto en la Ley 1563 de 2012 si así lo acuerdan.

### 11. Modificaciones

Chapni podrá modificar estos términos notificando al usuario con al menos 10 días de antelación por correo electrónico. El uso continuado del servicio después de ese plazo implica la aceptación de los términos actualizados.$$
);

INSERT INTO legal_documents (doc_type, version, body_md) VALUES (
'dpa',
'2026-06-24',
$$## Contrato de Encargo de Tratamiento de Datos

*Ley 1581 de 2012 · Decreto 1377 de 2013*

### 1. Objeto

El presente Acuerdo de Tratamiento de Datos (en adelante "Acuerdo") regula la relación entre el profesional o la organización que utiliza la plataforma Chapni (en adelante "el Responsable") y Chapni en su calidad de Encargado del tratamiento, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.

Mediante la aceptación de este Acuerdo, el Responsable instruye a Chapni para que trate los datos personales de los pacientes y usuarios de su organización estrictamente conforme a las condiciones aquí pactadas.

### 2. Naturaleza y alcance del encargo

Chapni tratará datos personales de pacientes (nombre, documento, datos de contacto, datos clínicos sensibles de salud) únicamente para prestar el servicio de gestión de historias clínicas y funciones relacionadas (agenda, facturación, generación de borradores IA con texto anonimizado).

Chapni no tratará los datos para fines propios distintos a las instrucciones del Responsable, no los cederá a terceros no autorizados y no los comercializará.

### 3. Obligaciones de Chapni como Encargado

- Tratar los datos únicamente según las instrucciones documentadas del Responsable.
- Implementar medidas de seguridad técnicas y organizativas apropiadas (cifrado AES-256-GCM, control de acceso, auditoría, respaldos cifrados).
- Guardar confidencialidad sobre los datos tratados y exigir lo mismo a sus empleados y colaboradores.
- Informar al Responsable sin demora de cualquier incidente de seguridad que afecte los datos.
- Asistir al Responsable en el cumplimiento de los derechos de los titulares (pacientes) en la medida en que sea técnicamente posible.
- Al término del contrato, eliminar o devolver los datos conforme a las instrucciones del Responsable, salvo que la ley exija su conservación.

### 4. Sub-encargados

Chapni podrá contratar sub-encargados para la prestación del servicio, incluyendo los proveedores listados en la Política de Privacidad (Hetzner, Backblaze, Anthropic con datos anonimizados, MercadoPago para facturación). El Responsable acepta esta lista al suscribir este Acuerdo.

Chapni notificará al Responsable sobre cambios en los sub-encargados con al menos 10 días de antelación.

### 5. Derechos de los titulares (pacientes)

El Responsable (profesional) es quien debe atender directamente las solicitudes de derechos de sus pacientes (acceso, corrección, supresión). Chapni facilitará el acceso técnico a los datos para que el Responsable pueda cumplir con estas solicitudes dentro de los plazos legales.

### 6. Duración

Este Acuerdo tiene la misma vigencia que la suscripción al servicio Chapni. Al cancelar la suscripción, el encargo termina y Chapni procederá a eliminar los datos según la política de terminación descrita en los Términos y Condiciones.$$
);
