import logging
import math
import re
import subprocess
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import whisper

from ai_service.config import settings

logger = logging.getLogger(__name__)

# Whisper's classic failure mode on silent/near-silent audio: instead of
# returning empty text, it "continues" from initial_prompt and loops,
# repeating the same (fabricated) sentence verbatim, usually consecutively
# and usually until it fills the window. Treat that pattern as a
# hallucination rather than feed it to Claude as a clinical draft
# (worker.py already renders an empty transcription as an empty,
# fill-it-yourself draft — this makes a hallucinated one behave the same way).
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _looks_hallucinated(text: str) -> bool:
    sentences = [s.strip().lower() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]
    if len(sentences) < 2:
        return False
    # A silence loop repeats one sentence over and over. But real speech in a
    # session-length recording also repeats the odd sentence verbatim ("okey",
    # "no sé", closing formulas), so any-duplicate-anywhere would throw away a
    # whole hour of legitimate transcription. Flag only when repetition
    # dominates the transcript, or the same sentence loops back to back.
    if len(set(sentences)) <= len(sentences) / 2:
        return True
    run = 1
    for prev, cur in zip(sentences, sentences[1:]):
        run = run + 1 if cur == prev else 1
        if run >= 3:
            return True
    return False


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


@dataclass(frozen=True)
class Transcription:
    """The transcript plus what it cost to produce it.

    The timings travel with the text instead of being measured by the caller so
    that `model` is the model that actually ran. core-api writes its own
    `whisper_model` guess into the row at upload time from a constant that knows
    nothing about this service's settings — see worker._process_draft, which
    overwrites it with this value.
    """

    text: str
    transcribe_ms: int
    #: Wall-clock length of the recording. None when neither ffprobe nor the
    #: segment list could tell us, which leaves rtf NULL rather than wrong.
    audio_seconds: float | None
    model: str


# ffprobe reads the container header; it does not decode the stream, so this is
# a millisecond-scale call even on an hour of audio. The timeout only exists so
# a corrupt file cannot wedge the worker.
_FFPROBE_TIMEOUT_S = 20


def _parse_ffprobe_duration(stdout: str) -> float | None:
    """Read a duration in seconds out of ffprobe's single-value output.

    ffprobe prints `N/A` when the container carries no duration — the normal
    case for a WebM assembled from MediaRecorder chunks, which is exactly what
    this pipeline receives — so an unparseable value is expected, not an error.
    """
    value = stdout.strip()
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None
    if not math.isfinite(seconds) or seconds <= 0:
        return None
    return seconds


def _duration_from_segments(segments: list[dict[str, Any]]) -> float | None:
    """Fallback duration: where Whisper's last segment ends.

    Cheap (the segments are already in hand) but a lower bound: trailing silence
    produces no segment, so a recording left running after the session ends
    reads as shorter than it was, which makes the RTF look worse than it is.
    Preferring ffprobe keeps that bias out of the numbers whenever the container
    is honest about its own length.
    """
    end = 0.0
    for seg in segments:
        try:
            end = max(end, float(seg["end"]))
        except (KeyError, TypeError, ValueError):
            continue
    return end or None


def probe_audio_seconds(audio_path: str) -> float | None:
    """Duration of the recording per ffprobe, or None if it cannot say.

    Best-effort by design: this is telemetry, and no failure here may cost a
    clinical draft.
    """
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True,
            text=True,
            timeout=_FFPROBE_TIMEOUT_S,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("ffprobe failed", extra={"path": audio_path, "err": str(exc)})
        return None
    if proc.returncode != 0:
        return None
    return _parse_ffprobe_duration(proc.stdout)


def transcribe_audio(audio_path: str) -> Transcription:
    """Transcribe a local audio file to text using Whisper.

    Audio file is read from the local filesystem — it never leaves the server.
    Raises FileNotFoundError if audio_path doesn't exist.
    """
    model = _load_model()
    logger.info("transcribing audio", extra={"path": audio_path})

    started = time.monotonic()
    result = model.transcribe(
        audio_path,
        language="es",        # Colombian Spanish
        fp16=False,           # CPU inference; set True if GPU is available
        verbose=False,
        initial_prompt=CLINICAL_PROMPT_ES,
    )
    elapsed_ms = int((time.monotonic() - started) * 1000)

    # Drop segments Whisper itself flagged as likely silence/no-speech —
    # defense in depth alongside the repetition check below.
    segments = result.get("segments", [])
    text = "".join(
        seg["text"] for seg in segments if seg.get("no_speech_prob", 0) <= 0.6
    ).strip() if segments else str(result["text"]).strip()

    audio_seconds = probe_audio_seconds(audio_path)
    if audio_seconds is None:
        audio_seconds = _duration_from_segments(segments)

    def _result(final_text: str) -> Transcription:
        return Transcription(
            text=final_text,
            transcribe_ms=elapsed_ms,
            audio_seconds=audio_seconds,
            model=settings.whisper_model,
        )

    if _looks_hallucinated(text):
        logger.warning(
            "discarding transcription — looks like a silence hallucination loop",
            extra={"path": audio_path, "chars": len(text)},
        )
        # The text is thrown away, the measurement is not: a job that burned
        # nine minutes of CPU and produced nothing is precisely the kind of run
        # the instrumentation exists to make visible.
        return _result("")

    logger.info(
        "transcription complete",
        extra={"chars": len(text), "ms": elapsed_ms, "audio_seconds": audio_seconds},
    )
    return _result(text)
