# Textos legales de Chapni

Versión vigente: `2026-09-25` de privacidad, términos y DPA, publicada con la
migración `000083_legal_documents_2026_09_25`. El texto está en esa migración y
en la tabla `legal_documents`; las versiones anteriores siguen en la tabla con
`is_current = false`. Los cambios siguientes se publican desde SuperAdmin → Legal.

Se publicó por decisión del usuario el 2026-09-25, sin cumplir antes todo lo que
había pedido la auditoría legal. Quedan pendientes:

1. Identificación del responsable. No hay sociedad, así que el responsable es la
   persona natural que opera Chapni. Los textos solo dicen "operada desde Bogotá"
   y dan los canales de contacto; faltan nombre, cédula o RUT y dirección de
   notificaciones (Decreto 1377 art. 13, Ley 1480 art. 50).
2. Revisión de un abogado. Preguntas concretas:
   - ¿Aplica la Ley 1480 a un profesional que contrata Chapni para su consulta?
     De eso depende si el retracto es obligatorio.
   - ¿Es admisible la limitación de responsabilidad a lo pagado en 3 meses frente
     al art. 43 de la Ley 1480?
   - ¿Chapni debe inscribirse en el RNBD? (Decreto 090 de 2018).
3. Contador: confirmar si la suscripción causa IVA.
4. País del centro de datos de Hetzner: la política dice "Alemania (casa matriz)".
   Si el servidor está fuera de Alemania, hay que decirlo en la tabla de encargados.
5. Contratos de transmisión con los encargados fuera de Colombia (Anthropic,
   Backblaze, Resend, Cloudflare, Google): la política dice que existen.
