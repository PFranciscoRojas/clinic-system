import logging
from functools import lru_cache

import whisper

from ai_service.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_model() -> whisper.Whisper:
    """Load Whisper model once and cache. Model is pre-baked into the Docker image."""
    logger.info("loading whisper model", extra={"model": settings.whisper_model})
    return whisper.load_model(settings.whisper_model)


# Whisper's initial_prompt doesn't work like an LLM instruction — it biases
# token probabilities toward whatever style/vocabulary this example text
# already contains, since it's treated as "prior context" the model is
# continuing from. A natural clinical-session example, in the same register
# and with the terminology a therapy session actually uses, measurably
# improves domain accuracy over an unprompted call (which is what this file
# did before — the plain vocabulary bias here is the fix for consistently
# "off" transcriptions of clinical/psychology terms).
CLINICAL_PROMPT_ES = (
    "Sesión de psicología en Colombia. El paciente refiere ansiedad, "
    "insomnio y dificultad para concentrarse. La psicóloga aplica "
    "reestructuración cognitiva y técnicas de terapia cognitivo-conductual "
    "(TCC) para trabajar los pensamientos automáticos, la rumiación y la "
    "evitación. Se revisan las tareas asignadas, el estado de ánimo y los "
    "síntomas de depresión, y se ajusta el plan terapéutico."
)


def transcribe_audio(audio_path: str) -> str:
    """Transcribe a local audio file to text using Whisper.

    Audio file is read from the local filesystem — it never leaves the server.
    Returns the transcription as a plain string.
    Raises FileNotFoundError if audio_path doesn't exist.
    """
    model = _load_model()
    logger.info("transcribing audio", extra={"path": audio_path})

    result = model.transcribe(
        audio_path,
        language="es",        # Colombian Spanish
        fp16=False,           # CPU inference; set True if GPU is available
        verbose=False,
        initial_prompt=CLINICAL_PROMPT_ES,
    )

    text: str = result["text"]
    logger.info("transcription complete", extra={"chars": len(text)})
    return text.strip()
