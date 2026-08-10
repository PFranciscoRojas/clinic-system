import logging
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from faster_whisper import WhisperModel

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
def _load_model() -> WhisperModel:
    """Load the Whisper model once and cache it. Pre-baked into the Docker image.

    This is CTranslate2, not PyTorch: the same OpenAI weights, converted and
    quantised. int8 is the whole reason CPU inference is viable on a 2-vCPU box
    — the reference PyTorch runtime this replaced spent ~8.5 min on an hour of
    audio, which is most of the latency the professional waits through.
    """
    logger.info(
        "loading whisper model",
        extra={
            "model": settings.whisper_model,
            "compute_type": settings.whisper_compute_type,
            "cpu_threads": settings.whisper_cpu_threads,
        },
    )
    return WhisperModel(
        settings.whisper_model,
        device="cpu",
        compute_type=settings.whisper_compute_type,
        cpu_threads=settings.whisper_cpu_threads,
    )


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
    #: Wall-clock length of the recording. None when the runtime could not say,
    #: which leaves rtf NULL rather than wrong.
    audio_seconds: float | None
    model: str


def _usable_duration(seconds: Any) -> float | None:
    """Accept a duration only if it can carry the weight of an RTF."""
    try:
        value = float(seconds)
    except (TypeError, ValueError):
        return None
    # NaN and inf both survive float() and both poison every aggregate computed
    # over the column afterwards.
    if value != value or value in (float("inf"), float("-inf")) or value <= 0:
        return None
    return value


def _duration_from_segments(segments: list[Any]) -> float | None:
    """Fallback duration: where the last segment ends.

    A lower bound — trailing silence produces no segment, so a recording left
    running after the session ends reads as shorter than it was, which makes the
    RTF look worse than it is. Only used when the runtime does not report a
    duration of its own.
    """
    end = 0.0
    for seg in segments:
        candidate = _usable_duration(getattr(seg, "end", None))
        if candidate is not None:
            end = max(end, candidate)
    return end or None


def transcribe_audio(audio_path: str) -> Transcription:
    """Transcribe a local audio file to text using Whisper.

    Audio file is read from the local filesystem — it never leaves the server.
    Raises FileNotFoundError if audio_path doesn't exist.
    """
    model = _load_model()
    logger.info("transcribing audio", extra={"path": audio_path})

    started = time.monotonic()
    segment_iter, info = model.transcribe(
        audio_path,
        language="es",                    # Colombian Spanish
        initial_prompt=CLINICAL_PROMPT_ES,
        # The VAD attacks the silence-hallucination loop at its source instead
        # of cleaning it up afterwards: silence never reaches the decoder, so
        # there is nothing for it to "continue" from. _looks_hallucinated below
        # stays as a safety net, demoted from primary defence.
        vad_filter=True,
        # Each window decodes on its own. With this on, one hallucinated window
        # becomes the prompt for the next and the loop feeds itself — the exact
        # failure this pipeline has already been bitten by.
        condition_on_previous_text=False,
    )

    # transcribe() is lazy: it returns a generator in milliseconds and does the
    # actual work while it is consumed. Timing the call alone would record ~0 ms
    # for an eight-minute transcription and quietly make the instrumentation
    # report a pipeline that costs nothing.
    segments = list(segment_iter)
    elapsed_ms = int((time.monotonic() - started) * 1000)

    # Drop segments Whisper itself flagged as likely silence/no-speech —
    # defense in depth alongside the repetition check below.
    text = "".join(
        seg.text for seg in segments if (seg.no_speech_prob or 0) <= 0.6
    ).strip()

    # The runtime decoded the audio to transcribe it, so it knows the true
    # length — better than asking the container, which for a WebM assembled from
    # MediaRecorder chunks usually declares no duration at all.
    audio_seconds = _usable_duration(getattr(info, "duration", None))
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
