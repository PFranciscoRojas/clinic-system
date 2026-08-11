import glob
import logging
import os
import re
import subprocess
import tempfile
import time
from collections.abc import Iterator
from contextlib import contextmanager
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


# ── Cutting the recording up ────────────────────────────────────────────────
#
# faster-whisper builds the log-Mel spectrogram of whatever it is handed in a
# single pass (feature_extractor.py), keeping the strided float32 frames, the
# complex128 FFT and its complex64 copy alive at the same time. That costs
# ~0.9 MB per second of audio: an hour needs ~3.4 GB, and this box has 1.9 GB.
# It OOM-killed the service on the first real session-length recording.
#
# So ffmpeg cuts the file into pieces first and Whisper only ever sees one at a
# time. Peak memory becomes a function of whisper_chunk_seconds instead of the
# length of the session — 528 MB at 180 s, against 3459 MB for the whole hour,
# for 2% more wall time.

_SILENCE_RE = re.compile(r"silence_(start|end):\s*(-?[\d.]+)")
# ffmpeg's progress line, written once the decoder has been through every frame.
_PROGRESS_TIME_RE = re.compile(r"time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)")

# Generous: this is a whole decode pass over the file, and being wrong about it
# costs a worse cut plan, never a failed transcription.
#
# Both ffmpeg calls below are resolved off PATH and take no shell: the only
# non-constant argument is a path this service wrote itself, under
# settings.audio_base_path, from an appointment id core-api validated as a UUID.
_FFMPEG_TIMEOUT_S = 30 * 60


def _parse_silences(stderr: str) -> list[float]:
    """The midpoint of every silence ffmpeg reported.

    The midpoint, not either edge: it is the point furthest from the speech on
    both sides, so a cut there takes nothing off either piece.
    """
    midpoints: list[float] = []
    start: float | None = None
    for kind, value in _SILENCE_RE.findall(stderr):
        if kind == "start":
            start = float(value)
        elif start is not None:
            midpoints.append((start + float(value)) / 2)
            start = None
    return midpoints


def _parse_decoded_seconds(stderr: str) -> float | None:
    """How long the recording actually is, per ffmpeg's last progress line.

    Deliberately not the container header: a WebM assembled from MediaRecorder
    chunks declares `Duration: N/A`, which is why this pipeline could not report
    an RTF at all before. The progress line is written after the decoder has
    walked every frame, so it cannot be wrong about it.
    """
    matches = _PROGRESS_TIME_RE.findall(stderr)
    if not matches:
        return None
    hours, minutes, seconds = matches[-1]
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def _silence_plan(audio_path: str) -> tuple[list[float], float | None]:
    """One ffmpeg pass: where the silences are, and how long the file is.

    Returns an empty plan rather than raising. Knowing where the silences are is
    an optimisation; cutting at all is the safety property, and _split_audio
    still falls back to evenly spaced cuts without this.
    """
    try:
        completed = subprocess.run(  # noqa: S603 — see _FFMPEG_TIMEOUT_S
            [  # noqa: S607 — ffmpeg off PATH, see _FFMPEG_TIMEOUT_S
                "ffmpeg", "-nostdin", "-i", audio_path, "-vn",
                "-af", "silencedetect=noise=-30dB:d=0.35",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=_FFMPEG_TIMEOUT_S, check=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning(
            "could not look for silences; falling back to evenly spaced cuts",
            extra={"path": audio_path, "error": str(exc)},
        )
        return [], None
    return _parse_silences(completed.stderr), _parse_decoded_seconds(completed.stderr)


def _cut_points(
    midpoints: list[float], total_s: float | None, window_s: int, search_s: int
) -> list[float]:
    """Where to cut: the silence nearest each nominal boundary, or the boundary.

    Each window is measured from the cut that was actually made, not from the
    nominal boundary — otherwise a run of early cuts compounds and the pieces
    drift shorter and shorter.
    """
    cuts: list[float] = []
    target = float(window_s)
    for mid in midpoints:
        if mid < target - search_s:
            continue
        # Nobody stopped talking anywhere near this boundary. Cut anyway: the
        # memory bound is the point of the exercise and it does not negotiate.
        while mid > target + search_s:
            cuts.append(target)
            target += window_s
        cuts.append(mid)
        target = mid + window_s
    # Everything after the last silence is still audio, and a 20-minute tail
    # costs as much memory as a 20-minute recording. Skipped when ffmpeg could
    # not say how long the file is — a guessed length is worse than a fixed
    # schedule.
    if total_s is not None:
        while target < total_s:
            cuts.append(target)
            target += window_s
    return cuts


@contextmanager
def _split_audio(audio_path: str) -> Iterator[list[str]]:
    """The recording as an ordered list of pieces, deleted on the way out.

    The pieces land next to the recording rather than in /tmp: they are the same
    order of magnitude as the audio (an hour of 16 kHz mono PCM is ~108 MB) and
    this is the volume already sized for that.
    """
    with tempfile.TemporaryDirectory(
        prefix="whisper-", dir=os.path.dirname(audio_path) or None
    ) as workdir:
        yield _cut_into_pieces(audio_path, workdir)


def _cut_into_pieces(audio_path: str, dest_dir: str) -> list[str]:
    """Cut the recording into 16 kHz mono WAV pieces. Returns them in order."""
    window = settings.whisper_chunk_seconds
    midpoints, total_s = _silence_plan(audio_path)
    cuts = _cut_points(midpoints, total_s, window, settings.whisper_chunk_search_seconds)

    # No usable cut plan (silence detection failed, or a recording of solid
    # speech shorter than one window): let ffmpeg space them evenly. Same bound,
    # just blind about where words fall.
    where = (
        ["-segment_times", ",".join(f"{c:.3f}" for c in cuts)] if cuts
        else ["-segment_time", str(window)]
    )
    subprocess.run(  # noqa: S603 — see _FFMPEG_TIMEOUT_S
        [  # noqa: S607 — ffmpeg off PATH, see _FFMPEG_TIMEOUT_S
            "ffmpeg", "-nostdin", "-loglevel", "error", "-i", audio_path,
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            "-f", "segment", *where,
            os.path.join(dest_dir, "piece%04d.wav"),
        ],
        capture_output=True, text=True, timeout=_FFMPEG_TIMEOUT_S, check=True,
    )
    pieces = sorted(glob.glob(os.path.join(dest_dir, "piece*.wav")))
    logger.info(
        "recording split for transcription",
        extra={"path": audio_path, "pieces": len(pieces), "seconds": total_s},
    )
    return pieces


def _transcribe_piece(model: WhisperModel, piece: str) -> tuple[str, float | None]:
    """One piece, start to finish: its text and how long it was."""
    segment_iter, info = model.transcribe(
        piece,
        language="es",                    # Colombian Spanish
        initial_prompt=CLINICAL_PROMPT_ES,
        # The VAD attacks the silence-hallucination loop at its source instead
        # of cleaning it up afterwards: silence never reaches the decoder, so
        # there is nothing for it to "continue" from. _looks_hallucinated below
        # stays as a safety net, demoted from primary defence. (It is not what
        # drives peak memory — measured at 3459 MB with it and 3187 MB without,
        # on the same hour of audio. Cutting the file is what fixed that.)
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

    # Drop segments Whisper itself flagged as likely silence/no-speech —
    # defense in depth alongside the repetition check in _looks_hallucinated.
    text = "".join(seg.text for seg in segments if (seg.no_speech_prob or 0) <= 0.6)

    # The runtime decoded this piece, so it knows exactly how long it was.
    seconds = _usable_duration(getattr(info, "duration", None))
    if seconds is None:
        seconds = _duration_from_segments(segments)
    return text, seconds


def transcribe_audio(audio_path: str) -> Transcription:
    """Transcribe a local audio file to text using Whisper.

    Audio file is read from the local filesystem — it never leaves the server.
    Raises FileNotFoundError if audio_path doesn't exist.
    """
    model = _load_model()
    logger.info("transcribing audio", extra={"path": audio_path})

    started = time.monotonic()
    parts: list[str] = []
    total_seconds = 0.0
    with _split_audio(audio_path) as pieces:
        for piece in pieces:
            piece_text, piece_seconds = _transcribe_piece(model, piece)
            parts.append(piece_text)
            if piece_seconds is not None:
                total_seconds += piece_seconds

    elapsed_ms = int((time.monotonic() - started) * 1000)
    text = "".join(parts).strip()
    # Summed from the pieces, so one piece the runtime could not measure leaves
    # the total a little short instead of leaving it unknown.
    audio_seconds = total_seconds if total_seconds > 0 else None

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
