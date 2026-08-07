# language: es
@flujo
Característica: De la primera consulta a la factura cobrada

  El recorrido entero, en el orden en que lo vive una psicóloga: da de alta a la
  paciente, le agenda la cita, la atiende, escribe y firma la historia clínica,
  y cobra.

  Cada paso usa lo que produjo el anterior — el identificador de la paciente, el
  de la cita, el de la historia. Ahí está lo que este escenario añade a los
  tests unitarios: aquéllos comprueban que cada pieza funciona, éste comprueba
  que encajan. Un cambio que rompa el paso de un identificador entre dos
  contextos no rompe ningún test unitario y rompe el producto.

  Antecedentes:
    Dado un consultorio "Consultorio Central" con la profesional "clara@ejemplo.co"
    Y que "clara@ejemplo.co" inició sesión

  Escenario: Una consulta completa, de la cita a la factura pagada
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando le agenda una cita presencial para mañana
    Entonces la cita queda agendada
    Cuando marca la cita como atendida
    Y abre la historia clínica de la sesión
    Y la firma
    Entonces la historia queda firmada
    Cuando emite una factura de "150000" por esa cita
    Entonces la factura queda pendiente de cobro por "150000"
    Cuando registra el pago completo
    Entonces la factura queda pagada

  # La historia clínica es un documento legal: una vez cerrada no se corrige, se
  # le añade una adenda firmada y fechada. Poder reescribirla en silencio es la
  # diferencia entre un registro clínico y un borrador.
  Escenario: Una historia clínica cerrada ya no se puede reescribir
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando le agenda una cita presencial para mañana
    Entonces la cita queda agendada
    Cuando abre la historia clínica de la sesión
    Y la firma
    Y la cierra
    Y intenta reescribir la historia
    Entonces la respuesta es 409

  # El corolario: lo que sí puede hacer la profesional es dejar constancia de la
  # corrección, sin borrar lo anterior.
  Escenario: A una historia cerrada se le añade una adenda
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando le agenda una cita presencial para mañana
    Entonces la cita queda agendada
    Cuando abre la historia clínica de la sesión
    Y la firma
    Y la cierra
    Y añade una adenda a la historia
    Entonces la adenda queda registrada
