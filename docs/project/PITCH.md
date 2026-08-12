# Pitch hablado de Chapni

Material para hablar, no para leer. Se memorizan cuatro bloques y unas pocas frases fijas;
lo demás se improvisa encima y sale distinto cada vez. Un pitch recitado se nota a los tres
segundos.

Última revisión: 2026-08-08. Registro: profesional pero cercano, con ganchos en forma de
pregunta. Las reglas de escritura de la skill `chapni-social` aplican al copy publicado
(landing, redes), no a lo hablado: acá manda que suene a alguien contando algo.

---

## 1. Hechos verificados (contra esto se contrasta cualquier frase)

Verificado en código y en producción el 2026-08-08. Si algo de acá cambia, este documento
cambia antes que el discurso.

**Lo que pasa con el audio.** La grabación se transcribe con Whisper corriendo en el mismo
servidor, con el modelo horneado en la imagen del contenedor (`ai-service`,
`transcription/whisper.py:65-71`, `config.py:32`). No hay ningún proveedor externo de
transcripción en el servicio, y `docs/ai/PLAN_LATENCIA_AUDIO.md:7` deja esa restricción por
escrito, descartando a propósito Deepgram, AssemblyAI, Groq y la API de OpenAI. El archivo
de audio se borra cuando termina la transcripción.

**Lo que sí sale del servidor.** El texto ya transcrito y anonimizado, sin nombre ni
documento, viaja a la API de Anthropic para redactar el borrador. Es una salida real de
información y se dice cuando preguntan.

**Dónde vive.** VPS arrendado en Hetzner, fuera de Colombia. La frase honesta es "corre en
nuestro propio servidor, no en un proveedor de transcripción externo". Nunca "los datos no
salen de Colombia" ni "ni yo puedo leerlos": la MASTER_KEY vive en el servidor que operamos.
Lo defendible es "está cifrado paciente por paciente, no es una base de datos que alguien
abre y lee de corrido".

**El dato de la carga de documentación.** Existe y tiene fuente: Eleos Health encontró ~35%
de la jornada en documentación, unas 14 horas de una semana de 40, ~16 minutos por sesión.
El NHS reporta 13,5 horas semanales en profesionales de salud en general. Entre 60 y 70% de
los clínicos de salud mental documentan fuera de horario. Matiz que hay que tener listo:
Eleos vende lo mismo que nosotros y la data es de Estados Unidos; en Colombia no hay estudio
equivalente. Se cita como "los estudios en salud mental", y si preguntan la fuente se dice
tal cual. Nunca inventar una cifra colombiana.

**Tracción real hoy.** Una usuaria: Marcela, cofundadora y psicóloga clínica, un año de uso
diario con pacientes reales. Cero clientes pagos. En producción, 180.000 COP/mes por
profesional. Se dice así, sin "solo" y sin "todavía".

**Qué no prometer.** RIPS/ADRES no existe (bloqueante para quien factura a EPS). No decir
"certificado" en cumplimiento: hay Resolución 1995, registros inmutables tras la firma,
consentimientos y Ley 1581, pero certificación no hay. No prometer que la IA diagnostica.

## 2. La estructura, cuatro bloques

> **el gancho · la propuesta · el diferencial · el remate**

1. **El gancho.** La escena concreta: terminar la consulta y quedar debiendo dos horas de
   notas escritas de memoria.
2. **La propuesta.** Agenda, cobros e historia clínica cifrada en un solo lugar.
3. **El diferencial.** Graba la sesión y entrega el borrador de la nota, el diagnóstico CIE
   y el plan en el enfoque terapéutico de ese profesional. La transcripción corre en nuestro
   servidor. La IA sugiere, el psicólogo corrige y firma.
4. **El remate.** La frase de marca más el pedido. Lo único que cambia según con quién estés.

La frase de marca, fija: **que tu día termine cuando termina tu última sesión.**

## 3. Informal, amigos y conocidos (30 segundos)

> Desarrollamos Chapni, un software colombiano para psicólogos. La mayoría termina su día de
> consulta y se sienta otras dos horas a escribir las notas de sus pacientes de memoria.
>
> Chapni junta agenda, cobros e historia clínica cifrada. Y con permiso del paciente graba la
> sesión y deja escrito el borrador de la nota y el diagnóstico. El psicólogo revisa, corrige
> y firma. Se va a su casa a la hora en que salió su último paciente.
>
> Lo hice para mi esposa, que es psicóloga. Resultó que a todas les pasaba lo mismo.

Si el conocido resulta ser psicólogo, no se sigue el pitch: se pregunta cuánto le toma la
nota de una sesión y se deja hablar. Lo que responda es el pitch.

## 4. Psicólogo independiente (45 segundos)

> ¿Cuántas veces has terminado tu última consulta del día sabiendo que todavía te faltan dos
> horas de notas, escritas de memoria?
>
> Chapni es la plataforma que ordena tu consulta: agenda, cobros e historia clínica cifrada
> en un solo lugar. Con el consentimiento del paciente graba la sesión y redacta el borrador
> de la nota, el diagnóstico CIE y el plan de tratamiento en tu propio enfoque terapéutico.
> La transcripción corre en nuestro servidor, no en un proveedor externo. Tú revisas,
> corriges y firmas. Nada entra a tu historia clínica sin tu aprobación.
>
> Lo construí para mi esposa, que es psicóloga clínica y lo usa todos los días desde hace un
> año. Ahora está abierto para más colegas, por 180.000 pesos al mes.
>
> Chapni. Que tu día termine cuando termina tu última sesión.

El cierre para quien muestra interés es el trato de fundadora, no el precio: cuenta montada
esta semana con sus propios formatos, un mes completo gratis, acompañamiento en la primera
sesión, y al día 30 la pregunta de sigues o no sigues. Secuencia completa, seguimientos y
objeciones en `docs/ai/PLAN_VENTA_DIRECTA.md`.

## 5. Evento, versión corta a dúo (20 segundos)

La que se dice cincuenta veces en el día. Marcela abre siempre: una psicóloga diciendo "yo
uso esto" pesa más que cualquier cosa que diga el que lo programó.

> Marcela: Yo soy psicóloga clínica. Hace un año dejé de escribir mis notas de sesión de
> memoria.
>
> Francisco: Y yo soy el que construyó el sistema que las escribe. Se llama Chapni. Graba la
> sesión con consentimiento del paciente y deja el borrador de la nota con el diagnóstico y
> el plan, en el enfoque de cada quien. Ella corrige y firma.
>
> Marcela: Y salgo a la misma hora que termina mi último paciente.

Y de una la pregunta de vuelta: "¿tú qué estás haciendo acá?". La respuesta define qué
versión larga usar.

**Reglas del dúo.** Uno habla, el otro complementa con una frase, nunca los dos encima.
Francisco no corrige lo clínico, Marcela no explica lo técnico. Si preguntan quién hace qué:
"ella es la psicóloga y define el producto, yo lo construyo".

## 6. Evento, versión larga (90 segundos) — Colombia Tech Fest 2026

El pedido en este evento es **clientes y socio comercial**, no inversión. Eso cambia todo:
a un inversionista hay que probarle mercado; a un socio comercial hay que probarle que hay
producto construido y nadie vendiéndolo, que es exactamente la situación.

> En salud mental hay un problema que desde afuera no se ve: los terapeutas dedican cerca de
> un tercio de su jornada a documentar, no a atender. Unas catorce horas a la semana, y la
> mayoría fuera de horario, de noche y de memoria.
>
> Chapni es la plataforma colombiana que ataca ese problema. Centraliza agenda, cobros e
> historia clínica cifrada paciente por paciente. Y con el consentimiento del paciente graba
> la sesión y entrega el borrador de la nota, el diagnóstico CIE y el plan de tratamiento,
> redactados en el enfoque terapéutico de cada profesional.
>
> Dos cosas nos separan. La transcripción corre en nuestro propio servidor y no en un
> proveedor externo, y al modelo de lenguaje solo le llega texto anonimizado, sin nombre ni
> documento. Y la autonomía del profesional es una regla del producto, no una promesa: la IA
> sugiere, el psicólogo corrige y firma. Un borrador no es historia clínica hasta que él lo
> aprueba.
>
> Somos dos fundadores. Ella es psicóloga clínica y lleva un año usando esto todos los días
> en su consulta. Yo lo construí. Cada función salió de un problema real de su consultorio.
>
> Estamos en producción, cobramos 180.000 pesos al mes por profesional, y ahora vamos por los
> primeros diez clientes. Busco dos cosas: psicólogos con consulta privada a quienes me
> puedan presentar, y un socio comercial. Yo construyo, pero no vendo.
>
> Chapni existe para que el día de un psicólogo termine cuando termina su última sesión.

**Logística.** El demo en el celular listo antes de entrar: la pantalla del borrador, cuarenta
segundos, una sola pantalla, nunca el tour completo. El nombre de quien habló se anota en el
momento con una palabra de qué hace. Nada de "somos el Uber de X".

## 7. Centros de terapia y clínicas (60 segundos)

> En un centro de terapia cada psicólogo lleva su historia clínica a su manera: Word, Excel,
> un cuaderno. La carga administrativa termina en agotamiento profesional y rotación, y la
> información se va con quien se va.
>
> Chapni unifica la gestión clínica y operativa de todo su equipo en una plataforma
> desarrollada en Colombia: agenda, cobros e historia clínica cifrada paciente por paciente,
> con control de quién ve qué y registro de cada acceso.
>
> El diferencial está en la documentación. Con consentimiento del paciente la sesión se graba
> y el sistema entrega el borrador de la nota, el diagnóstico CIE y el plan según el enfoque
> de cada profesional. La transcripción corre en nuestro propio servidor. La IA sugiere; la
> decisión clínica siempre es del terapeuta, que revisa y firma.
>
> Sus psicólogos recuperan horas de su semana y usted ve por primera vez el consolidado de su
> operación. ¿Agendamos una demo de veinte minutos?

La pregunta de si facturan a EPS o particular la hace Francisco, antes de que salga RIPS por
el otro lado. Si es EPS, se dice de frente que hoy no existe. Precios por tramo y brechas
conocidas en `docs/ai/PLAN_B2B_COMERCIAL.md`; no improvisar descuentos.

## 8. Las preguntas difíciles, con respuesta corta

- **"¿Cuántos clientes tienen?"** Hoy tenemos una usuaria, y es mi cofundadora: psicóloga
  clínica, un año usándolo todos los días con sus pacientes. Está en producción y probado.
  Ahora vamos por los primeros diez. Sin "solo" y sin "todavía".
- **"¿Por qué no han vendido?"** Porque yo construyo y no vendo. Es una de las dos razones
  por las que estoy acá.
- **"¿Grabar la sesión no viola la confidencialidad?"** El paciente firma un consentimiento
  específico dentro del sistema. Sin esa firma no se graba.
- **"¿Y si la IA se equivoca?"** Se equivoca. Por eso nada entra a la historia clínica hasta
  que el profesional lo corrige y lo firma.
- **"¿A dónde va el audio?"** Se transcribe en nuestro propio servidor y se borra. Lo que sale
  es el texto anonimizado que redacta el borrador.
- **"¿Eso ya existe, no?"** Software de historia clínica hay varios. Lo que no encontramos fue
  uno que armara la nota desde el audio sin mandar el audio a un tercero.
- **"¿Cumple con la ley?"** Resolución 1995, registros que no se alteran una vez firmados,
  consentimientos y Ley 1581. Certificados no estamos, y no lo decimos.
- **"¿Y si tú desapareces?"** Es un riesgo real de trabajar con alguien pequeño. Por eso
  cualquiera exporta toda su historia clínica en PDF cuando quiera, sin pedir permiso.
- **"¿De dónde sale el nombre?"** Del apellido de Marcela, que es Chapues, y de Nieve, una
  perrita que tuvimos. Dos sílabas y no se parece a nada más. Se cuenta y se sigue.

## 9. Cómo ensayarlo

1. Memorizar los cuatro bloques y la frase de marca. Los párrafos completos no: se recitan.
2. Decirlo diez veces en voz alta cambiando las palabras de conexión cada vez. Si dos salen
   idénticas, cambiar la siguiente a propósito.
3. Los tres ritmos: normal, rápido a propósito para soltar la lengua, y lento y sereno, que
   es el tono real.
4. Grabarse una vez y escucharse caminando. Lo que suene a leído se bota.
5. El dúo con Marcela se ensaya junto, mínimo tres veces, con ella abriendo.
6. La prueba final: contárselo a alguien fuera del gremio y pedirle que lo repita al otro
   día. Si repite "es un programa para psicólogos", falló. Si repite "graba la sesión y la
   nota queda escrita, y el audio no se manda a nadie", quedó.

---

Fuentes del dato de documentación: [Eleos
Health](https://eleos.health/press-releases/eleos-health-saves-behavioral-health-providers-260-days-total-documentation-time-across-more-than-30-partnerships/),
[resumen 2026](https://reframepractice.com/guides/therapist-documentation-time),
[estudio NHS](https://buildingbetterhealthcare.com/clinicians-spend-a-third-of-their-time-on-clinical-documentation-204644).
