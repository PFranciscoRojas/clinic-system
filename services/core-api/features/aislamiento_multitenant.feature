# language: es
@aislamiento
Característica: Cada consultorio ve solamente sus propios pacientes

  Un consultorio no puede ver, editar ni saber de la existencia de los pacientes
  de otro. Es la promesa que sostiene todo lo demás: si se rompe, ninguna de las
  otras promesas del sistema importa.

  La API no responde 403 al pedir un paciente ajeno, responde 404. Un 403 sería
  confirmar que ese paciente existe en algún sitio, y eso ya es una filtración.

  Antecedentes:
    Dado un consultorio "Consultorio Norte" con la profesional "norte@ejemplo.co"
    Y un consultorio "Consultorio Sur" con la profesional "sur@ejemplo.co"

  Escenario: Un paciente registrado en un consultorio no aparece en el otro
    Dado que "norte@ejemplo.co" inició sesión
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando "sur@ejemplo.co" inicia sesión
    Y consulta la lista de pacientes
    Entonces la lista no contiene a "Lucía"

  Escenario: Pedir un paciente ajeno por su identificador responde 404
    Dado que "norte@ejemplo.co" inició sesión
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando "sur@ejemplo.co" inicia sesión
    Y pide esa misma paciente por su identificador
    Entonces la respuesta es 404

  Escenario: Buscar por el documento de un paciente ajeno no lo encuentra
    Dado que "norte@ejemplo.co" inició sesión
    Cuando registra a la paciente "Lucía" "Restrepo" con documento "1010101010"
    Entonces la paciente queda registrada
    Cuando "sur@ejemplo.co" inicia sesión
    Y busca pacientes por "1010101010"
    Entonces la lista no contiene a "Lucía"

  Escenario: Sin sesión no se accede a nada
    Cuando alguien consulta la lista de pacientes sin haber iniciado sesión
    Entonces la respuesta es 401
