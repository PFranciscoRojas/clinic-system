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
    )

    text: str = result["text"]
    logger.info("transcription complete", extra={"chars": len(text)})
    return text.strip()
