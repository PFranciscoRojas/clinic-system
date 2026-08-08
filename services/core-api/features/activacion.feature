# language: es
@activacion
Característica: El operador ve en qué paso se detienen los consultorios nuevos

  Chapni se vende sin vendedor: alguien crea la cuenta desde la web, tiene
  catorce días de prueba y nadie lo acompaña. Si no se sabe en qué paso se
  queda la gente, cada cambio en el producto y en la página se decide a ciegas.

  El embudo no pregunta nada ni instala nada: mide hechos que ya están en la
  base de datos. Verificar el correo, terminar la puesta en marcha, registrar
  al primer paciente, agendar la primera cita, firmar la primera historia.

  Antecedentes:
    Dado un consultorio "Consultorio Nuevo" con la profesional "nueva@ejemplo.co"
    Y que existe el operador de la plataforma

  Escenario: Un consultorio recién creado aparece en el embudo sin haber empezado
    Cuando el operador consulta el embudo de activación
    Entonces "Consultorio Nuevo" aparece en el embudo
    Y "Consultorio Nuevo" todavía no registró a su primer paciente

  Escenario: El embudo refleja el primer paciente y la primera historia firmada
    Dado que "nueva@ejemplo.co" inició sesión
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando le agenda una cita presencial para mañana
    Entonces la cita queda agendada
    Cuando marca la cita como atendida
    Y abre la historia clínica de la sesión
    Y la firma
    Entonces la historia queda firmada
    Cuando el operador consulta el embudo de activación
    Entonces "Consultorio Nuevo" ya registró a su primer paciente
    Y "Consultorio Nuevo" ya firmó su primera historia clínica

  # La consola contaba los pacientes de cada tenant con una consulta que la
  # política RLS deja siempre en cero: el operador veía "0 pacientes" en todos
  # los consultorios, incluido el que acababa de registrar a alguien.
  Escenario: La consola de organizaciones cuenta los pacientes que hay de verdad
    Dado que "nueva@ejemplo.co" inició sesión
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando el operador consulta la consola de organizaciones
    Entonces "Consultorio Nuevo" aparece con 1 paciente

  # Activar un consultorio a mano desde la consola no es una venta. El embudo
  # los contaba juntos, y con una cohorte pequeña esa diferencia es la lectura
  # entera: tener un cliente que paga o tener uno al que se le regaló el mes.
  Escenario: Un consultorio activado a mano no cuenta como pago cobrado
    Cuando el operador activa "Consultorio Nuevo" por 1 mes
    Y el operador consulta el embudo de activación
    Entonces "Consultorio Nuevo" figura como activado a mano
    Y el embudo no reporta ningún pago cobrado

  # Lo que separa este embudo de un contador de filas: el operador es un rol de
  # la plataforma, no un tenant más, y ningún otro rol puede asomarse.
  Escenario: Una profesional no puede consultar el embudo
    Dado que "nueva@ejemplo.co" inició sesión
    Cuando consulta el embudo de activación
    Entonces la respuesta es 403
