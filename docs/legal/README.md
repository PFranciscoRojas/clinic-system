# Textos legales de Chapni: borradores 2026-09-25

Estado: **BORRADOR, no publicado.** Los textos vigentes viven en la tabla
`legal_documents` (versión `2026-07-07` de privacidad y términos, `2026-07-02` del
DPA) y se publican desde SuperAdmin → Legal. Estos archivos son la propuesta que
reemplaza esas versiones una vez se cumplan los pasos de abajo.

Salen de la auditoría legal del 2026-09-25 (ver la conversación de esa fecha y los
PRs #325, #326, chapni#3 y marcela-chapues#3). Es una revisión técnica, no una
asesoría legal: un abogado colombiano tiene que leerlos antes de publicar.

## Qué cambia frente a lo publicado

Privacidad (`privacidad.md`):
- Identifica al responsable (hoy no hay razón social, NIT ni dirección; Decreto 1377
  art. 13 y Ley 1480 art. 50 los exigen).
- Corrige dos citas: el secreto profesional del psicólogo es la Ley 1090 de 2006,
  no la Ley 23 de 1981 (ética médica); los 15 años de conservación los fija la
  Resolución 839 de 2017, que modificó la 1995 de 1999.
- Completa la lista de encargados: faltaban Resend (correo, EE. UU.), Cloudflare
  (sitio chapni.com) y Google Fonts (IP de visitantes de chapni.com).
- Agrega transferencia/transmisión internacional (Decreto 1377 art. 25).
- Agrega la sección de cookies y almacenamiento local.
- Describe la anonimización tal como es (NER + patrones), sin prometer que sea total.
- Cubre a los pacientes que agendan en la página pública, que ahora dan una
  autorización propia (PR #326).

Términos (`terminos.md`):
- Reembolsos: propuesta nueva (ver abajo).
- Planes: mensual y anual; no existe plan trimestral.
- Terminación: los términos decían que los datos se borran a los 90 días de
  cancelar, pero no hay ningún proceso que lo haga y la página de seguridad dice
  que nada se borra solo. Se alinea con lo que el sistema hace.
- IVA: se deja marcado para que lo confirme un contador.

DPA: solo cambia la lista de sub-encargados de la sección 4 (agregar Resend y
Cloudflare). No va archivo aparte.

## Propuesta de reembolsos (decisión pendiente)

Suscripción de Chapni (versión ajustada el 2026-09-25, tras "está muy libre"):
- Retracto: 5 días hábiles desde el primer pago de la primera suscripción,
  reembolso del 100%. Una sola vez por profesional y por organización, para que
  no se pueda encadenar cancelar y volver a suscribirse. Si la Ley 1480 aplica,
  el retracto no se puede quitar ni condicionar al uso, así que ese es el
  margen real para cerrarlo. Reemplaza los "5 días calendario" y el límite de
  "10 sesiones de uso activo", que no estaba definido.
- Mensual: después del retracto no hay reembolso; al cancelar, el servicio sigue
  hasta el fin del mes pagado.
- Anual: después del retracto se devuelve lo pagado menos cada mes iniciado,
  cobrado al precio mensual completo. Así el descuento del anual solo se gana
  quedándose el año, y a partir del mes 10 ya no hay nada que devolver.
- Cobros duplicados o por error del sistema: reembolso completo siempre.
- Suspensión por fraude o incumplimiento: sin reembolso.

Reservas de pacientes: se mantiene la política que ya aplica la página
(cancelación gratis hasta 24 horas antes, sin reembolso después o por
inasistencia), más el reembolso completo cuando el profesional cancela.

## Antes de publicar

1. Identificación del responsable. Sin sociedad, es la persona natural que opera
   Chapni: nombre completo, cédula o RUT, dirección de notificaciones y teléfono.
   Se reemplazan los `[PENDIENTE: …]` de los dos textos.
2. Revisión de un abogado. Preguntas concretas:
   - ¿Aplica la Ley 1480 a un profesional que contrata Chapni para su consulta?
     (define si el retracto es obligatorio o voluntario).
   - ¿La limitación de responsabilidad a 3 meses de pago es válida frente al
     art. 43 de la Ley 1480?
   - ¿Chapni debe inscribirse en el RNBD? (Decreto 090 de 2018: hoy aplica a
     sociedades con activos superiores a 100.000 UVT).
3. Confirmar con un contador si la suscripción causa IVA.
4. Avisar a los usuarios por correo con 10 días de anticipación: los términos
   vigentes (sección 11) y la política (sección 9) lo exigen para cambios materiales.
5. Publicar desde SuperAdmin → Legal con versión `AAAA-MM-DD` y borrar esta carpeta.
