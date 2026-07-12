"""Generate a ~60-minute simulated psychology session transcript (Spanish).

Every sentence is made unique by weaving distinct topic/context words, so the
Whisper hallucination check (exact duplicate sentences) never triggers. Content
deliberately covers each field of the "Nota de Evolución" template: estado
actual, malestar subjetivo (0-10), seguimiento de tareas, técnicas aplicadas,
evaluación de cierre, nuevas tareas y riesgo.
"""

import sys

TOPICS = [
    ("el insomnio", "quedarme dormido antes de medianoche", "la higiene del sueño"),
    ("la ansiedad en el trabajo", "hablar en la reunión del lunes", "la respiración diafragmática"),
    ("la discusión con mi hermano", "poner un límite sin gritar", "la comunicación asertiva"),
    ("los pensamientos repetitivos", "dejar de rumiar por la noche", "la reestructuración cognitiva"),
    ("el miedo a conducir", "manejar hasta el centro comercial", "la exposición gradual"),
    ("la tristeza de los domingos", "planear una actividad agradable", "la activación conductual"),
    ("la relación con mi jefe", "pedir una reunión de retroalimentación", "el ensayo conductual"),
    ("la preocupación por el dinero", "revisar el presupuesto sin angustiarme", "la solución de problemas"),
    ("el perfeccionismo", "entregar el informe sin revisarlo diez veces", "el experimento conductual"),
    ("la soledad", "escribirle a un amigo de la universidad", "la construcción de red de apoyo"),
    ("las palpitaciones", "notar el cuerpo sin asustarme", "la atención plena"),
    ("la culpa con mis padres", "decir que no a la visita del sábado", "el trabajo con creencias intermedias"),
    ("la procrastinación", "empezar la tesis quince minutos al día", "la fragmentación de tareas"),
    ("el apetito irregular", "volver a desayunar con calma", "el registro de hábitos"),
    ("la irritabilidad", "pausar antes de responder un mensaje", "la técnica del tiempo fuera"),
    ("las pesadillas", "escribir el sueño al despertar", "el reprocesamiento en imaginación"),
    ("la autocrítica", "hablarme como le hablaría a una amiga", "la autocompasión"),
    ("el aislamiento", "aceptar la invitación al almuerzo", "la programación de actividades sociales"),
    ("la tensión muscular", "soltar los hombros frente al computador", "la relajación muscular progresiva"),
    ("el miedo al futuro", "distinguir lo que depende de mí", "la clarificación de valores"),
]

WEEKDAYS = ["el lunes", "el martes", "el miércoles", "el jueves", "el viernes",
            "el sábado pasado", "el domingo por la tarde"]

EMOTIONS = ["nervios", "cansancio", "frustración", "alivio", "vergüenza",
            "esperanza", "impaciencia", "calma inesperada", "desgano", "orgullo"]


def paciente_block(i: int, topic, day, emo) -> list[str]:
    t, goal, _tech = topic
    return [
        f"Paciente: Esta semana {t} volvió a aparecer, sobre todo {day}.",
        f"Sentí bastante {emo} cuando intenté {goal}, aunque no salió tan mal como la vez número {i + 1}.",
        f"Me di cuenta de que cuando pienso en {t} el cuerpo se me tensa y empiezo a anticipar lo peor del escenario {i + 2}.",
        f"Aun así probé lo que acordamos y logré {goal} durante unos {5 + (i * 3) % 20} minutos.",
        f"Después me escribí una nota en el cuaderno de registro, la número {i + 10}, describiendo qué pensé y qué hice distinto.",
    ]


def terapeuta_block(i: int, topic, prev_topic) -> list[str]:
    t, goal, tech = topic
    pt = prev_topic[0]
    return [
        f"Terapeuta: Gracias por contarme cómo evolucionó {t} esta semana, es distinto a lo que vimos con {pt}.",
        f"Vamos a trabajarlo ahora con {tech}, paso a paso, como ejercicio número {i + 1} de la sesión.",
        f"Primero identifica el pensamiento automático que aparece justo antes de intentar {goal}.",
        f"Ahora evalúa la evidencia a favor y en contra de ese pensamiento sobre {t}, y anota una respuesta alternativa en la fila {i + 1} del registro.",
        f"Fíjate cómo cambió la intensidad de la emoción al aplicar {tech}, del {7 - (i % 3)} bajó aproximadamente al {3 + (i % 2)}.",
    ]


def build() -> str:
    parts: list[str] = []

    # ── Apertura: estado actual y malestar subjetivo ──
    parts += [
        "Terapeuta: Buenas tardes, bienvenida a la sesión de hoy, siéntate y acomódate con calma.",
        "Terapeuta: Antes de empezar quiero preguntarte cómo llegas hoy y qué tal estuvo la semana en general.",
        "Paciente: Llego un poco cansada pero más tranquila que la sesión anterior, fue una semana movida en la oficina.",
        "Paciente: Hubo un evento importante, mi empresa anunció una reestructuración y eso me disparó la preocupación varios días.",
        "Terapeuta: En una escala de cero a diez, donde diez es el peor malestar, ¿en cuánto ubicas tu malestar de esta semana?",
        "Paciente: Yo diría que en un seis, porque hubo días difíciles pero también momentos en que me sentí capaz de manejarlo.",
        "Terapeuta: Un seis sobre diez, lo anoto, y me alegra que reconozcas también los momentos de manejo.",
        # ── Seguimiento de tareas ──
        "Terapeuta: Revisemos las tareas que acordamos la sesión pasada, el registro de pensamientos y la caminata diaria.",
        "Paciente: El registro de pensamientos lo hice casi todos los días, me faltaron solo dos días del fin de semana.",
        "Paciente: La caminata diaria la cumplí cuatro de siete días, los otros tres llovió muy fuerte y lo dejé pasar.",
        "Terapeuta: Eso es una adherencia bastante buena, diría que cumpliste la mayoría de los compromisos, un tres sobre cuatro.",
        "Terapeuta: Lo importante no es la perfección sino que notaste el efecto de hacerlas, ¿qué efecto notaste?",
        "Paciente: Los días que caminé dormí mejor y el registro me ayudó a darme cuenta de lo rápido que me juzgo.",
    ]

    # ── Desarrollo: bloques de temas y técnicas ──
    for i, topic in enumerate(TOPICS):
        day = WEEKDAYS[i % len(WEEKDAYS)]
        emo = EMOTIONS[i % len(EMOTIONS)]
        prev = TOPICS[i - 1]
        parts += paciente_block(i, topic, day, emo)
        parts += terapeuta_block(i, topic, prev)

    # ── Riesgo (explícitamente sin ideación) ──
    parts += [
        "Terapeuta: Como hacemos siempre, quiero preguntarte directamente, ¿ha habido pensamientos de hacerte daño o de muerte esta semana?",
        "Paciente: No, nada de eso, ni se me ha pasado por la cabeza, la angustia es por el trabajo pero nunca he pensado en lastimarme.",
        "Terapeuta: Perfecto, lo registro, no hay ideación ni señales de riesgo en este momento.",
        # ── Cierre: evaluación de sesión y nuevas tareas ──
        "Terapeuta: Vamos cerrando, ¿cómo evalúas la sesión de hoy y qué te llevas?",
        "Paciente: Me llevo la idea de que puedo cuestionar los pensamientos catastróficos antes de creérmelos, la sesión me pareció muy útil.",
        "Terapeuta: A mí también me pareció una sesión productiva, trabajamos el eje de la ansiedad laboral con buena disposición tuya.",
        "Terapeuta: Para la próxima semana te propongo tres tareas nuevas y quiero que me digas si las ves viables.",
        "Terapeuta: La primera es continuar el registro de pensamientos añadiendo la columna de respuesta alternativa todos los días.",
        "Terapeuta: La segunda es practicar la respiración diafragmática cinco minutos cada mañana antes de revisar el correo.",
        "Terapeuta: La tercera es programar una actividad agradable para el domingo por la tarde, que es tu momento más difícil.",
        "Paciente: Las tres me parecen viables, la del domingo me da un poco de pereza pero entiendo por qué es importante.",
        "Terapeuta: Muy bien, nos vemos entonces la próxima semana a la misma hora, cuídate mucho.",
        "Paciente: Gracias, hasta la próxima semana.",
    ]

    return "\n".join(parts)


if __name__ == "__main__":
    text = build()
    words = len(text.split())
    # Repeat the middle development with a second pass of variations until we
    # reach the target word count for ~60 min of speech (~9200 words at the
    # voice's pace). Second pass reuses topics with different framing so no
    # sentence repeats verbatim.
    passes = 1
    while words < 9200:
        passes += 1
        extra: list[str] = []
        for i, (t, goal, tech) in enumerate(TOPICS):
            day = WEEKDAYS[(i + passes) % len(WEEKDAYS)]
            emo = EMOTIONS[(i + passes) % len(EMOTIONS)]
            extra += [
                f"Paciente: Retomando lo de {t}, hay algo más que no había contado de la ronda {passes}.",
                f"Resulta que {day} también intenté {goal} en un contexto diferente, la ocasión número {i + passes * 20}.",
                f"Esa vez sentí {emo} con menos intensidad frente a {t}, quizás un {2 + (i + passes) % 5} sobre diez, y duró menos que en el intento {i + passes * 7}.",
                f"Terapeuta: Ese matiz de la ronda {passes} es valioso, muestra que {tech} se está generalizando a otros contextos.",
                f"Terapeuta: Registremos ese avance número {i + passes * 20} en tu plan, y observa qué condiciones lo hicieron posible.",
            ]
        text = text + "\n" + "\n".join(extra)
        words = len(text.split())

    sys.stdout.write(text)
    print(f"\n\n[{words} palabras, {passes} pasadas]", file=sys.stderr)
