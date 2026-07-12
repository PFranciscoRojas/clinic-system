"""Whisper hallucinates on silent/near-silent audio by looping — repeating
the same sentence verbatim (often echoing initial_prompt) instead of
returning empty text. _looks_hallucinated() is the guard that catches this
before a fabricated transcript reaches Claude."""

from ai_service.transcription.whisper import _looks_hallucinated


def test_detects_verbatim_repeated_sentence() -> None:
    text = (
        "El estado de ánimo se afirca el estado de ánimo y los síntomas de depresión. "
        "El estado de ánimo se afirca el estado de ánimo y los síntomas de depresión."
    )
    assert _looks_hallucinated(text)


def test_detects_repeat_regardless_of_case() -> None:
    text = "Hola buenas tardes. HOLA BUENAS TARDES."
    assert _looks_hallucinated(text)


def test_real_transcription_is_not_flagged() -> None:
    text = (
        "Hola, ¿cómo ha estado esta semana? He notado que el insomnio ha mejorado un poco. "
        "Trabajamos la reestructuración cognitiva sobre los pensamientos automáticos."
    )
    assert not _looks_hallucinated(text)


def test_single_sentence_is_not_flagged() -> None:
    assert not _looks_hallucinated("Buenas tardes, ¿cómo se ha sentido?")


def test_empty_text_is_not_flagged() -> None:
    assert not _looks_hallucinated("")


def test_long_session_with_scattered_repeats_is_not_flagged() -> None:
    # A real hour-long session legitimately repeats the odd sentence verbatim
    # ("okey", closing formulas). That must NOT discard the whole transcript.
    unique = [f"En la semana número {i} trabajamos la exposición gradual al miedo {i}." for i in range(100)]
    scattered = unique[:50] + ["Okey."] + unique[50:] + ["Okey.", "No sé qué decir.", "No sé qué decir."]
    assert not _looks_hallucinated(" ".join(scattered))


def test_consecutive_loop_is_flagged() -> None:
    text = (
        "El paciente refiere ansiedad y dificultad para concentrarse. " * 3
        + "Hola, ¿cómo ha estado esta semana? Trabajamos la reestructuración cognitiva."
    )
    assert _looks_hallucinated(text)


def test_dominant_repetition_is_flagged() -> None:
    filler = "Se revisan las tareas asignadas y el estado de ánimo. " * 8
    real = "Hola, ¿cómo se ha sentido? Bien, gracias por preguntar, doctora García."
    assert _looks_hallucinated(filler + real)
