# Voz del cliente — Chapni v0 (2026-08-22)

> **Estado: v0 PRESTADA.** Este documento no contiene ni un solo verbatim de un cliente
> propio de Chapni, porque a la fecha no existen conversaciones de clientes que minar.
> Todo lo de aquí viene de fuentes públicas de terceros, y cada fila dice de dónde salió
> y qué tanto se le puede creer. Se reemplaza en cuanto haya material propio (§8).
>
> Origen: ejercicio del Día 1 del reto "Máquina de Contenido con AI" (Lab10), adaptado a
> un negocio pre-clientes. El método del reto asume conversaciones propias; aquí se
> sustituye el combustible por voz prestada + datos duros del gremio.

---

## 0. Reglas que no se negocian

1. **El cliente de Chapni es el psicólogo, nunca el paciente.** Todo lo que vive en
   `clinical_records`, `patients`, `ai_drafts` y las transcripciones de audio está
   cifrado, es dato clínico de un tercero y está fuera de alcance para marketing de
   forma permanente. No hay versión anonimizada aceptable de eso para contenido.
2. **Nada se inventa.** Cada cita de este documento es literal y tiene URL. Si una
   frase suena a cita pero no lo es, va marcada como paráfrasis o como hipótesis.
3. **No se confunde copy de competidor con voz de cliente.** Es el error central que
   este documento corrige (§1).

---

## 1. Semáforo de fuentes

Lo más importante del ejercicio no fueron las citas, fue descubrir de qué está hecho
el internet hispanohablante sobre "gestión de consulta psicológica": casi todo es SEO
escrito por los propios vendedores de software.

| Fuente | Qué es | Confianza | Nota |
|---|---|---|---|
| ENLAPSIC 2022 / Colpsic | Encuesta gremial, n = 8.495 psicólogos colombianos | **Alta** | Dato duro, colombiano, citable. La mejor fuente encontrada |
| Comunicado laboral Colpsic | Postura oficial del gremio | **Alta** | Contiene la frase más fuerte del corpus |
| Resolución tarifas SOAT | Norma vigente | **Alta** | Cifra oficial por sesión de psicoterapia |
| andainas.es | Blog de una psicóloga (España) sobre por qué NO abrir consulta | **Media** | Primera persona real, pero contexto español (autónomos, IRPF) |
| mentalgest.com | Blog de un competidor | **Baja** | Es la *hipótesis* de un vendedor sobre el dolor, no la voz del cliente. Útil como pista, nunca como cita |
| Blogs "opiniones de Doctoralia" | Testimonios sin nombre ni fecha | **Nula** | Descartados. Parecen redactados para el artículo |
| Reddit | Inaccesible al crawler | — | Requiere consulta manual |
| Grupos de Facebook del gremio | Cerrados | — | Requiere entrar como miembro (§8) |

**Conclusión operativa:** la voz cruda de psicólogos colombianos casi no está indexada
en la web abierta. Está en grupos cerrados, WhatsApp y comentarios de video. Por eso
este v0 se apoya en datos duros del gremio en vez de en verbatims.

---

## 2. Dolores

| Cita / hallazgo | Fuente | Confianza | Frecuencia |
|---|---|---|---|
| "La psicología en Colombia es una profesión golpeada por los malos salarios." | Colpsic, comunicado sobre situación laboral | Alta | Postura oficial del gremio |
| El 18% de los psicólogos encuestados no reportó **ningún** ingreso en 2022, y el 27% ganó hasta $1.500.000 al mes | ENLAPSIC 2022, Tabla 14 (n = 8.495) | Alta | Dato censal |
| Cerca del **80%** tiene vinculación temporal o independiente. Prestación de servicios: 32% | ENLAPSIC 2022, Figura 55 | Alta | Dato censal |
| La tarifa oficial de psicoterapia individual por psicólogo es de 0,74 SMLDV = **$28.600** por sesión | Tabla 1, tarifas SOAT | Alta | Norma vigente |
| "Lo que no se mete nunca en ese presupuesto inicial es…¡el propio sueldo!" | andainas.es (psicóloga, ES) | Media | 1 |
| "Gestión de citas, el papeleo de antes, la decoración, la limpieza, los arreglos menores, publicidad" | andainas.es | Media | 1 |
| "la dificultad para desconectar de los problemas del negocio" | andainas.es | Media | 1 |
| "Emprender abriendo tu propio gabinete puede llegar a ser muy estresante" | andainas.es | Media | 1 |
| Las mujeres están sobrerrepresentadas en el rango de ingresos más bajo (28% vs 22% de los hombres), y son mayoría del gremio | ENLAPSIC 2022, Figura 68 | Alta | Dato censal |
| A mayor edad, mayor proporción de independientes. Bajo los 30 años, el 39% está desempleado | ENLAPSIC 2022, Figura 65 | Alta | Dato censal |

### Dolores en zona gris (hipótesis de competidor, NO citar como voz del cliente)

Estas frases son de mentalgest.com, un competidor. Sirven para saber qué dolor están
apostando otros, y como guion de pregunta para las entrevistas de §8. No van en un post
como si las hubiera dicho un cliente.

- "Terminas la última sesión del día... y te dices: 'Ahora sí, voy a dejar la nota lista'."
- "'Después lo completo mejor'. 'Solo voy a poner algo rápido'. 'Mañana lo recuerdo'."
- "Las notas clínicas no suelen acumularse por falta de compromiso. Se acumulan porque el flujo de trabajo no ayuda."
- "Mi forma actual de redactar notas de sesión me está quitando más energía de la que debería."

**Por qué importa igual:** el dolor que Chapni ataca de frente (la nota clínica después
de la sesión) ya está siendo nombrado por al menos un competidor. No es territorio
virgen. Lo que sí sigue libre es el ángulo de que el audio no salga del servidor.

---

## 3. Sueños

Sección deliberadamente flaca. No se encontró material público de primera persona sobre
lo que el psicólogo colombiano independiente *quiere* lograr. Lo que hay es inferencia
desde los datos, y va marcado como tal.

| Hallazgo | Fuente | Confianza |
|---|---|---|
| Pasar del rango de hasta $1.500.000 al rango de $1.500.001–$3.500.000. Es el movimiento real que hizo el gremio entre 2019 y 2022 (del 37% al 27% en el rango bajo, del 28% al 40% en el medio) | ENLAPSIC 2022, Tabla 14 | Alta como dato, **inferencia** como deseo |
| Dejar de depender de la prestación de servicios y vivir de consulta propia | Inferencia desde Figura 65 (a mayor edad, más independientes) | Hipótesis a validar |
| "Ser un profesional serio" en el sentido legal: historia clínica que aguante una auditoría | Inferencia desde Ley 1090 / Resolución 1995 | Hipótesis a validar |

**Acción:** las preguntas de sueños del guion de entrevista (§8) son las que más falta
hacen. Los dolores se pueden inferir de los datos; los sueños no.

---

## 4. Objeciones y miedos

| Cita / hallazgo | Fuente | Confianza |
|---|---|---|
| "La competencia es muy alta. Sin pagar por un plan premium, es casi imposible que mi perfil aparezca entre los primeros resultados." | Testimonio sin atribuir sobre Doctoralia | Baja, pero coherente con el modelo de directorios |
| **Objeción de precio, calculada:** $180.000 COP/mes es el 12% del techo del rango de ingresos donde vive el 27% del gremio | Cruce ENLAPSIC 2022 + precio de lista Chapni | Alta |
| Ya existe un competidor colombiano vendiendo "historia clínica encriptada": PSICONAPSIS. Claims textuales: *"Solo tú y tu paciente tienen acceso"*, *"Normativa colombiana"*, exportación RIPS, cobro por paquetes | terapeutas.psiconapsis.com | Alta |
| El gremio ya intentó y falló en fijar tarifas: el Ministerio de Trabajo respondió que una tabla salarial sería "cartelización" | Comunicado Colpsic | Alta |

### Lectura de la objeción de precio

Este es el hallazgo comercial del ejercicio, y no es cómodo.

- Distribución de ingresos mensuales del gremio en 2022: 18% ninguno, 27% hasta $1.5M,
  40% entre $1.5M y $3.5M, 10% entre $3.5M y $5.5M, 5% más de $5.5M.
- Chapni de lista cuesta $180.000/mes por asiento.
- Para el 45% del gremio (los dos rangos de abajo), eso no es una decisión de compra,
  es imposible.
- El mercado real de Chapni individual es el 15% que gana más de $3.5M y ejerce
  independiente, más las clínicas del plan B2B.

Esto no dice que el precio esté mal. Dice que **el ICP es mucho más estrecho de lo que
sugiere "hay 100.000 psicólogos en Colombia"**, y que el ángulo de venta correcto es
por sesión, no por mes: a $120.000 la consulta particular, Chapni cuesta una sesión y
media al mes.

---

## 5. Frases doradas

Honestamente: **una sola**, y no es de un cliente, es del gremio.

> "La psicología en Colombia es una profesión golpeada por los malos salarios."
> — Colegio Colombiano de Psicólogos

Esa frase es un post por sí sola, y viene firmada por la institución que representa a
la audiencia. No hay que reescribirla.

Segunda, no textual pero igual de fuerte, y es un número:

> El Estado colombiano tasa una sesión de psicoterapia individual con psicólogo en
> $28.600. (Tarifas SOAT, código 35104, 0,74 SMLDV.)

**El resto de esta sección está vacía a propósito.** Se llena con las entrevistas.

---

## 6. Datos concretos disponibles (para la regla 2 del framework)

Lista de munición verificable para no escribir posts genéricos:

- n = 8.495 psicólogos encuestados en la ENLAPSIC 2022
- 18% sin ingreso reportado en 2022
- 80% con vinculación temporal o independiente
- 32% trabaja por prestación de servicios
- Psicología Clínica es el campo más reportado: 14,8%
- 95,1% porta tarjeta profesional
- 39% de desempleo entre los menores de 30
- Salario medio reportado por Colpsic: $1.668.112/mes
- Tarifa SOAT psicoterapia individual: $28.600/sesión
- Consulta particular de mercado: $80.000 a $200.000/sesión

---

## 7. El dolor #1, profundizado

**Cómo lo dice el gremio:** "una profesión golpeada por los malos salarios".

**Cómo responde la categoría:** con posts sobre productividad y organización. El propio
competidor SaludTools lo formula así: los psicólogos que no consolidan su práctica
privada tienen "excelente atención clínica, pero gestión deficiente".

Eso es culpar al profesional. Es la respuesta de manual: el cliente habla de un problema
estructural de ingresos, y la marca responde con método y disciplina personal.

**A quién culpa el psicólogo:** a las EPS, al exceso de egresados, al Estado que tasa su
hora en $28.600, y a la contratación por prestación de servicios. No se culpa a sí mismo
por no tener un Excel bonito.

**Dónde queda Chapni:** el argumento honesto no es "organízate mejor". Es que si el
ingreso por sesión está topado por el mercado, lo único que se puede mover es cuántas
horas no facturables se van en papeleo, y qué tan defendible es la historia clínica si
alguien la audita.

**Titulares que salen de aquí:**
1. "Una profesión golpeada por los malos salarios" no lo dijo un paciente resentido. Lo dijo Colpsic.
2. El Estado cree que tu hora de psicoterapia vale $28.600.
3. El 80% del gremio es independiente, y el software clínico colombiano está hecho para instituciones.

---

## 8. Lo que falta, y cómo se llena

Este documento vale poco hasta que tenga verbatims propios. Prioridad, de mayor a menor
retorno:

1. **Las 5 entrevistas IPS de `docs/ai/PLAN_B2B_COMERCIAL.md` §4.** Ya están el guion de
   11 preguntas y los nombres. Grabarlas y guardar el transcript crudo en
   `docs/marketing/raw-data/`. Valen doble: validan precio y llenan este documento.
2. **Una sesión grabada con Marcela Chapues**, preguntando por su práctica y no por el
   software. Es la única psicóloga con uso diario real del producto.
3. **Export del WhatsApp de soporte** (573016530579), sin multimedia.
4. **Consultas reales de Search Console** de chapni.com. Es gente escribiendo su
   problema literal en una caja de búsqueda, y ya está disponible.
5. **Grupos de Facebook y Telegram del gremio colombiano**, entrando como miembro y
   guardando hilos reales. Es donde está la voz que la web abierta no indexa.
6. **Comentarios de TikTok/Instagram** en videos de psicólogos colombianos hablando de
   consulta privada. Verbatim puro, gratis, alto volumen.

### Regla operativa nueva

Toda sesión de feedback con un profesional se graba o se transcribe **cruda** antes de
convertirse en ticket. El archivo `tareas_clinica.md` (retirado el 2026-08-22, vive en git
y en el CHANGELOG) es la prueba de por qué: sus 7 ítems estaban escritos en lenguaje de
ingeniería y el verbatim original se perdió. Lo que la psicóloga dijo de verdad sobre el
borrador quemado a TCC no quedó en ningún archivo del repo.

---

## Fuentes

- Colpsic, *Caracterización Sociodemográfica y Laboral de los Psicólogos en Colombia* (ENLAPSIC 2022, ISBN 978-628-95921-1-5) — https://www.colpsic.org.co/wp-content/uploads/2025/02/libro-Caracterizacion-sociodemografica-psicologos-14-abril.pdf
- Colpsic, *Comunicado a la comunidad psicológica sobre la situación laboral* — https://www.colpsic.org.co/wp-content/uploads/2025/01/Comunicacion-Pubica-Condiciones-Laborales-y-Salariales-Colpsic.pdf
- Andainas, *5 razones para NO abrir una consulta de psicología* — https://andainas.es/razones-para-no-abrir-una-consulta/
- MentalGest, *Cómo redactar una sesión psicológica sin quedarte escribiendo al final del día* — https://mentalgest.com/blog/redactar-sesion-psicologica-notas-clinicas
- SaludTools, *Consultorio de psicología independiente en Colombia* — https://www.saludtools.com/articulo/consultorio-psicologia-independiente-colombia-psicollective
- PSICONAPSIS — https://terapeutas.psiconapsis.com/
- Emprende Psicólogo, *¿Funciona Doctoralia?* — https://emprendepsicologo.com/funciona-doctoralia/
