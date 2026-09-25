-- Corrects where the platform's data lives: the Hetzner server is in Ashburn,
-- Virginia (us-east), not Germany as 000083 assumed. New version rather than an
-- in-place edit, so the 2026-09-25 text stays exactly as it was published.
UPDATE legal_documents SET is_current = false
WHERE doc_type = 'privacy' AND is_current;

INSERT INTO legal_documents (doc_type, version, body_md) VALUES
('privacy', '2026-09-25.1', $legal$## Política de Tratamiento de Datos Personales

*Ley 1581 de 2012 · Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015)*

Vigente desde: 25 de septiembre de 2026

### 1. Quién es el responsable

Chapni es una plataforma de software como servicio (SaaS) para la gestión de historias clínicas psicológicas, operada desde Bogotá, Colombia. Canales de contacto:

- Teléfono y WhatsApp: +57 301 653 0579
- Correo para asuntos de datos personales: privacidad@chapni.com

En esta política, "Chapni" o "nosotros" se refiere a ese responsable.

### 2. Dos papeles distintos: responsable y encargado

Chapni trata datos en dos calidades:

- **Como responsable**, sobre los datos de quienes contratan y usan la plataforma (profesionales, administradores y personal de las organizaciones) y de quienes visitan chapni.com. Esta política aplica completa a esos datos.
- **Como encargado**, sobre los datos de los pacientes que cada profesional u organización registra. El responsable de esos datos es el profesional o la organización (en adelante, "el cliente"), que decide para qué se usan. Chapni los trata solo por instrucción del cliente y según el Contrato de Encargo de Tratamiento de Datos que el cliente acepta al registrarse.

Si eres paciente y quieres ejercer tus derechos, dirígete al profesional o consultorio que te atiende. Si nos escribes a nosotros, le trasladaremos tu solicitud.

### 3. Datos que tratamos

**De los clientes y usuarios de la plataforma:** nombre, correo electrónico, teléfono opcional, nombre del consultorio u organización, datos de facturación y pago (procesados por MercadoPago; Chapni no almacena números de tarjeta), historial de suscripción y registros de uso y acceso.

**De los pacientes de nuestros clientes:** los datos que el profesional registra (nombre, documento, teléfono, historia clínica, notas de sesión, audio de sesiones cuando el profesional decide grabar) y los que el paciente entrega al agendar en la página pública de reservas (nombre, correo, celular, fecha y modalidad de la cita). Son datos sensibles de salud. Los datos de identificación y el contenido clínico se guardan cifrados con AES-256-GCM y una llave distinta por paciente.

**De los visitantes de chapni.com:** métricas agregadas de visitas y, si llegas con un enlace de referido, el código de referido (ver sección 10).

**Datos técnicos de todos:** dirección IP, navegador, y fecha, hora y acción de cada acceso a la plataforma. Los accesos a historias clínicas quedan en un registro de auditoría.

### 4. Para qué los usamos

- Prestar el servicio: historia clínica, agenda, reservas, cobros y borradores asistidos por IA.
- Gestionar la relación contractual, la facturación y el soporte.
- Enviar comunicaciones operativas: confirmaciones, recordatorios de citas, avisos de la cuenta.
- Enviar información comercial sobre Chapni a clientes y personas que la hayan pedido. Puedes darte de baja en cualquier momento.
- Seguridad de la plataforma y prevención de fraude.
- Cumplir obligaciones legales, incluida la conservación de la historia clínica (Resolución 1995 de 1999, modificada por la Resolución 839 de 2017) y el secreto profesional del psicólogo (Ley 1090 de 2006).
- Mejorar el servicio con análisis agregados que no identifican a nadie.

No vendemos datos personales y no los usamos para entrenar modelos de inteligencia artificial.

### 5. Datos sensibles

Los datos de salud son sensibles (Ley 1581, art. 5). Solo se tratan con autorización expresa del titular, salvo las excepciones de la ley. Nadie está obligado a autorizar el tratamiento de datos sensibles ni a responder preguntas sobre ellos. En la plataforma, la autorización del paciente la recoge el profesional (consentimiento informado) o la página de reservas, que guarda la fecha y la versión del texto aceptado.

### 6. Inteligencia artificial

- **Audio:** cuando el profesional graba una sesión, el audio viaja cifrado a los servidores de Chapni, se transcribe ahí con un modelo que corre en esos mismos servidores (Whisper) y se borra apenas termina la transcripción. Ningún servicio externo recibe el audio.
- **Texto:** para redactar el borrador, el texto pasa primero por un anonimizador que reemplaza nombres, documentos, teléfonos, correos, lugares e instituciones. El texto anonimizado se envía a Anthropic, que lo procesa sin usarlo para entrenar sus modelos. La anonimización es automática y puede no detectar todo dato identificable; por eso cada borrador lo revisa y aprueba el profesional.
- **Decisiones:** la IA solo sugiere. Nada entra a la historia clínica sin la aprobación explícita del profesional.

### 7. Encargados y transferencias internacionales

Para prestar el servicio, Chapni comparte datos con estos proveedores, que actúan como encargados bajo acuerdos de confidencialidad y protección de datos:

| Proveedor | País | Para qué | Qué recibe |
|---|---|---|---|
| Hetzner Online GmbH | EE. UU. (Ashburn, Virginia) | Servidores donde vive la plataforma | Toda la información, cifrada en lo clínico |
| Backblaze Inc. | EE. UU. | Respaldos | Copias cifradas con GPG |
| Anthropic PBC | EE. UU. | Borradores de IA | Solo texto anonimizado |
| MercadoPago S.A.S. | Colombia | Pagos de suscripciones y de citas | Nombre, correo y datos de pago |
| Resend | EE. UU. | Envío de correos | Nombre, correo y contenido del mensaje (p. ej., fecha de una cita) |
| Cloudflare Inc. | EE. UU. | Alojamiento y protección de chapni.com | IP y datos de navegación de visitantes |
| Google LLC (Google Fonts) | EE. UU. | Tipografías de chapni.com y de la aplicación | IP y navegador de quien carga la página |

Los servidores de la plataforma, y por lo tanto todos los datos que se registran en ella, incluidos los de salud, están en un centro de datos de Hetzner en Ashburn, Virginia (Estados Unidos). Cuando un proveedor trata datos fuera de Colombia, lo hace como transmisión a un encargado (Decreto 1377, art. 25), con un contrato que le exige un nivel de protección igual o superior al colombiano. Si agregamos o cambiamos un encargado, lo avisamos a los clientes con al menos 10 días de anticipación.

### 8. Derechos del titular

Tienes derecho a:

- Conocer, actualizar y rectificar tus datos.
- Pedir prueba de la autorización que diste.
- Saber qué uso se ha dado a tus datos.
- Revocar la autorización o pedir la supresión de tus datos cuando no exista un deber legal o contractual de conservarlos. La historia clínica tiene un deber legal de conservación.
- Acceder gratis a tus datos.
- Presentar quejas ante la Superintendencia de Industria y Comercio después de agotar el trámite con nosotros.

### 9. Cómo ejercer tus derechos

Escribe a privacidad@chapni.com con tu nombre, tu documento de identidad, lo que pides y, si aplica, los documentos que lo soportan.

- Consultas: respuesta en máximo 10 días hábiles, prorrogables 5 días hábiles más si te avisamos antes del vencimiento.
- Reclamos: respuesta en máximo 15 días hábiles, prorrogables 8 días hábiles más con aviso. Si el reclamo está incompleto, te pedimos lo que falta dentro de los 5 días siguientes; si no respondes en 2 meses, se entiende desistido.

### 10. Cookies y almacenamiento en tu navegador

Chapni no usa cookies de publicidad ni de seguimiento entre sitios, ni píxeles de redes sociales.

- **chapni.com** guarda en tu navegador (localStorage), por 30 días, el código de referido con el que llegaste, para que el registro se atribuya a quien te recomendó. Las métricas de visitas son agregadas y no usan cookies. Cloudflare puede poner cookies técnicas para proteger el sitio de bots.
- **La aplicación** guarda en tu navegador los datos de tu sesión (para no pedirte la contraseña a cada rato) y los borradores de notas que aún no se han enviado, para que no se pierdan si se cierra la pestaña. Estos datos son necesarios para que el servicio funcione. Los de sesión se borran al cerrar sesión; los borradores, cuando guardas la nota.
- Ambos sitios cargan tipografías desde Google Fonts, lo que entrega tu IP a Google.

Puedes borrar estos datos desde la configuración de tu navegador. Si en el futuro usamos cookies de analítica o publicidad, pediremos tu consentimiento antes.

### 11. Seguridad

Cifrado AES-256-GCM con llave por paciente para datos de identificación y contenido clínico; TLS en toda comunicación; control de acceso por roles con aislamiento entre organizaciones (Row-Level Security en PostgreSQL); contraseñas con bcrypt; respaldos cifrados; registro de auditoría de los accesos a historias clínicas. Si ocurre un incidente que afecte datos personales, lo informamos a los clientes afectados sin demora y a la Superintendencia de Industria y Comercio en los términos de la ley.

### 12. Conservación

- Historia clínica: mínimo 15 años desde la última atención (Resolución 839 de 2017). Esta obligación es del profesional; Chapni no borra historias clínicas de forma automática.
- Borradores de IA no aprobados: se borran solos al vencer el plazo que configura el profesional.
- Audio de sesiones: se borra apenas se transcribe.
- Datos de cuenta y facturación: mientras dure la relación y el tiempo adicional que exija la ley tributaria.

### 13. Cambios a esta política

Los cambios materiales se avisan por correo a los clientes con al menos 10 días de anticipación y se publican aquí con su fecha de vigencia.
$legal$);
