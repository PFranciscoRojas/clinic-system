-- Publishes the 2026-09-25 revision of the privacy policy, terms and DPA
-- (drafted in docs/legal/ after the legal audit of that date). Same effect as
-- publishing from SuperAdmin -> Legal: the previous version stays in the table
-- with is_current = false, so each user's accepted version remains readable.
UPDATE legal_documents SET is_current = false
WHERE doc_type IN ('privacy', 'terms', 'dpa') AND is_current;

INSERT INTO legal_documents (doc_type, version, body_md) VALUES
('privacy', '2026-09-25', $legal$## Política de Tratamiento de Datos Personales

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
| Hetzner Online GmbH | Alemania (casa matriz) | Servidores donde vive la plataforma | Toda la información, cifrada en lo clínico |
| Backblaze Inc. | EE. UU. | Respaldos | Copias cifradas con GPG |
| Anthropic PBC | EE. UU. | Borradores de IA | Solo texto anonimizado |
| MercadoPago S.A.S. | Colombia | Pagos de suscripciones y de citas | Nombre, correo y datos de pago |
| Resend | EE. UU. | Envío de correos | Nombre, correo y contenido del mensaje (p. ej., fecha de una cita) |
| Cloudflare Inc. | EE. UU. | Alojamiento y protección de chapni.com | IP y datos de navegación de visitantes |
| Google LLC (Google Fonts) | EE. UU. | Tipografías de chapni.com y de la aplicación | IP y navegador de quien carga la página |

Cuando un proveedor trata datos fuera de Colombia, lo hace como transmisión a un encargado (Decreto 1377, art. 25), con un contrato que le exige un nivel de protección igual o superior al colombiano. Si agregamos o cambiamos un encargado, lo avisamos a los clientes con al menos 10 días de anticipación.

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
$legal$),
('terms',   '2026-09-25', $legal$## Términos y Condiciones del Servicio

Vigentes desde: 25 de septiembre de 2026

### 1. Quién presta el servicio

Chapni se presta desde Bogotá, Colombia. Canales de contacto:

- Teléfono y WhatsApp: +57 301 653 0579
- Correo: hola@chapni.com

### 2. Descripción del servicio

Chapni es una plataforma de gestión de historias clínicas psicológicas (SaaS) para profesionales de la salud mental y sus equipos: historia clínica, agenda, página pública de reservas, cobros y borradores de notas asistidos por inteligencia artificial.

El servicio es solo para profesionales habilitados y sus organizaciones. Al contratar, el profesional declara estar autorizado para ejercer la psicología en Colombia conforme a la Ley 1090 de 2006.

### 3. Registro y cuenta

Para usar el servicio hay que crear una cuenta con información veraz y completa. El usuario cuida la confidencialidad de sus credenciales y responde por la actividad de su cuenta.

Chapni puede suspender o cancelar cuentas usadas de forma fraudulenta o con información falsa, según la sección 11.

### 4. Precio, planes y renovación

- **Prueba gratis:** 14 días sin tarjeta. Al terminar, el acceso queda restringido hasta que se active un plan.
- **Plan mensual:** se cobra cada mes a la tarjeta registrada en MercadoPago y se renueva solo hasta que lo canceles.
- **Plan anual:** un pago único equivalente a 10 meses por 12 meses de servicio. No se renueva solo.
- Los precios vigentes están publicados en chapni.com/precios.
- Los cambios de precio se avisan por correo con al menos 30 días de anticipación y aplican desde el siguiente período.

### 5. Retracto, reembolsos y cancelación

**Retracto.** Puedes retractarte dentro de los 5 días hábiles siguientes al primer pago de tu primera suscripción, mensual o anual, y te devolvemos el 100% de lo pagado. El retracto aplica una sola vez por profesional y por organización: si cancelas y vuelves a suscribirte, la nueva suscripción no tiene retracto.

**Plan mensual.** Después del retracto no hay reembolsos proporcionales. Puedes cancelar cuando quieras desde Configuración → Facturación y el servicio sigue activo hasta el final del mes pagado. No hay permanencia mínima ni penalidad.

**Plan anual.** Después del retracto, si cancelas te devolvemos lo pagado menos cada mes iniciado, cobrado al precio del plan mensual (sin el descuento del anual). Si ese valor ya iguala o supera lo pagado, no hay reembolso. Ejemplo con el precio actual de $180.000 mensuales: pagaste $1.800.000 y cancelas en el mes 4; se descuentan 4 × $180.000 = $720.000 y se devuelven $1.080.000.

**Cobros por error.** Un cobro duplicado o hecho por una falla del sistema se devuelve completo en cualquier momento.

**Sin reembolso.** No hay reembolso cuando la cuenta se suspende o termina por uso fraudulento, ilegal o por incumplimiento de estos términos (sección 11).

**Cómo pedirlo.** Escribe a hola@chapni.com con el asunto "Reembolso" y el comprobante de pago. El dinero vuelve al mismo medio de pago en un plazo de 5 a 15 días hábiles, según el medio. Esto no afecta tu derecho a la reversión del pago en los casos del artículo 51 de la Ley 1480 de 2011.

### 6. Pagos de pacientes

Los pagos que tus pacientes hacen al agendar llegan a tu propia cuenta de MercadoPago. La relación de ese pago, incluida la cancelación y el reembolso de la cita, es entre tú y tu paciente. La página de reservas muestra la política de cancelación que el paciente acepta antes de pagar: cancelación sin costo hasta 24 horas antes, sin reembolso después o por inasistencia, y reembolso completo si el profesional cancela.

### 7. Obligaciones del usuario

- Usar el servicio para fines lícitos y conforme a la normativa vigente.
- Como responsable de los datos de sus pacientes, obtener su consentimiento informado y su autorización para el tratamiento de datos (Ley 1581 de 2012) antes de registrar su información, y atender sus solicitudes de acceso, corrección y supresión.
- No compartir credenciales con personas no autorizadas.
- No intentar vulnerar la seguridad del sistema, acceder a datos de otras organizaciones ni hacer ingeniería inversa del software.
- Mantener actualizada la información de la cuenta y del medio de pago.

### 8. Inteligencia artificial

Los borradores que genera la IA son sugerencias automáticas. No son diagnósticos, prescripciones ni historia clínica definitiva. La responsabilidad clínica, diagnóstica y terapéutica es exclusiva del profesional, que debe revisar, corregir y aprobar cada borrador antes de que entre a la historia clínica.

El audio de las sesiones se transcribe en los servidores de Chapni y se borra al terminar. Para redactar, el texto se anonimiza y se envía a Anthropic. La anonimización es automática y puede no detectar todo dato identificable. El detalle está en la Política de Tratamiento de Datos.

### 9. Propiedad intelectual

El software, el diseño y la marca Chapni están protegidos por la Ley 23 de 1982 y la Decisión Andina 351. El usuario recibe una licencia de uso limitada, no exclusiva e intransferible mientras su suscripción esté activa.

Los datos que el profesional y su organización registran son suyos. Chapni no reclama derechos sobre ellos y los entrega o elimina a pedido del usuario, dentro de lo que permita la obligación legal de conservar la historia clínica.

### 10. Disponibilidad y responsabilidad

Chapni no garantiza un servicio sin interrupciones. Ante una caída, el objetivo es restablecerlo en máximo 24 horas. Chapni no responde por daños causados por fuerza mayor o hechos de terceros fuera de su control. La responsabilidad total de Chapni frente al usuario no podrá superar el valor pagado por el servicio en los tres meses anteriores al hecho que originó el daño, salvo dolo o culpa grave.

### 11. Terminación

El usuario puede cancelar en cualquier momento según la sección 5. Al terminar la suscripción, la cuenta pasa a modo restringido y los datos se conservan; el usuario puede pedir una exportación en cualquier momento. Chapni no borra historias clínicas de forma automática: su conservación es una obligación legal del profesional (Resolución 1995 de 1999, modificada por la Resolución 839 de 2017). Si el usuario pide eliminar su organización, Chapni borra los datos que no estén sujetos a esa obligación y le entrega una exportación de las historias.

Chapni puede suspender o terminar el servicio por incumplimiento de estos términos, avisando por correo con al menos 5 días hábiles de anticipación, salvo uso fraudulento o ilegal.

### 12. Ley aplicable y controversias

Estos términos se rigen por las leyes de Colombia. Las controversias se resuelven ante los jueces de Bogotá D.C., o por arbitraje (Ley 1563 de 2012) si las partes lo acuerdan. Esto no limita tu derecho a acudir a la Superintendencia de Industria y Comercio.

### 13. Cambios

Los cambios materiales a estos términos se avisan por correo con al menos 10 días de anticipación. Si no estás de acuerdo, puedes cancelar antes de que entren en vigencia.
$legal$),
('dpa',     '2026-09-25', $legal$## Contrato de Encargo de Tratamiento de Datos

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

Chapni podrá contratar sub-encargados para la prestación del servicio, incluyendo los proveedores listados en la Política de Privacidad (Hetzner, Backblaze, Anthropic con datos anonimizados, MercadoPago para pagos, Resend para correos y Cloudflare para el sitio web). El Responsable acepta esta lista al suscribir este Acuerdo.

Chapni notificará al Responsable sobre cambios en los sub-encargados con al menos 10 días de antelación.

### 5. Derechos de los titulares (pacientes)

El Responsable (profesional) es quien debe atender directamente las solicitudes de derechos de sus pacientes (acceso, corrección, supresión). Chapni facilitará el acceso técnico a los datos para que el Responsable pueda cumplir con estas solicitudes dentro de los plazos legales.

### 6. Duración

Este Acuerdo tiene la misma vigencia que la suscripción al servicio Chapni. Al cancelar la suscripción, el encargo termina y Chapni procederá a eliminar los datos según la política de terminación descrita en los Términos y Condiciones.$legal$);
