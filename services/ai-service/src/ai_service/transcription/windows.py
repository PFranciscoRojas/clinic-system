"""Transcribing a session while it is still being recorded.

Fase 4 of docs/ai/PLAN_LATENCIA_AUDIO.md. core-api enqueues one of these every
five parts; this turns the parts that have landed so far into text so that the
job at "Finalizar sesión" only has the tail left to do.

Every function here returns "nothing to do" rather than raising when the
recording is not in a state it can work with. That is the whole design
constraint: this runs while a professional is in a room with a patient, and the
only thing it may never do is make the ordinary path worse. If a window never
runs, /audio/complete transcribes the whole take exactly as it does today.
"""
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass

from ai_service.transcription.whisper import (
    _FFMPEG_TIMEOUT_S,
    _silence_plan,
    Transcription,
    transcribe_audio,
)

logger = logging.getLogger(__name__)

#: The suffix core-api gives a part of an upload in progress. Shared shape, not
#: a coincidence: see aidrafts/service/parts.go. The invariant test in
#: core-api's internal/invariants keeps the two from drifting.
PART_SUFFIX = ".chunk"

#: A window shorter than this is not worth a job. The overhead is the decode of
#: everything before it, which does not get cheaper for a small window.
MIN_WINDOW_SECONDS = 30.0


@dataclass(frozen=True)
class Window:
    """A stretch of the session that has been transcribed."""

    text: str
    #: Where this window ends, in milliseconds from the start of the recording.
    #: The next window starts here.
    end_ms: int
    transcribe_ms: int


def part_paths(parts_dir: str, upload_id: str, parts: int) -> list[str] | None:
    """The parts of one upload, in order, or None if any of them is missing.

    A hole is not something to work around. Concatenating across one produces a
    shorter recording that transcribes perfectly well, and the note that comes
    out describes a conversation with a piece missing — the same failure
    core-api's assembler refuses outright. A part that has not arrived yet will
    have arrived by the next window, so skipping is free.
    """
    paths = []
    for index in range(parts):
        path = os.path.join(parts_dir, f"{upload_id}.{index}{PART_SUFFIX}")
        if not os.path.isfile(path):
            logger.info(
                "window skipped: a part has not arrived yet",
                extra={"upload_id": upload_id, "missing": index, "parts": parts},
            )
            return None
        paths.append(path)
    return paths


def concat_parts(paths: list[str], dest: str) -> None:
    """Join the parts byte for byte, which is the only way this works.

    A webm chunk that is not the first carries no header: MediaRecorder writes
    the EBML header once, into chunk zero. So a window cannot be taken by
    opening the part it is interested in — the file has to be rebuilt from part
    zero every time, and the interesting stretch seeked to afterwards.

    That sounds expensive and is not: decoding an hour costs ~7.2 s, against
    minutes of transcription. The concatenation itself is a copy.
    """
    with open(dest, "wb") as out:
        for path in paths:
            with open(path, "rb") as part:
                while chunk := part.read(1 << 20):
                    out.write(chunk)


def cut_point(audio_path: str, after_ms: int) -> int | None:
    """Where this window should end: the last silence after what is covered.

    Cutting anywhere else splits a word across two windows, and the two halves
    are transcribed independently by a model that will happily invent a whole
    one out of each. Returns None when there is no silence to cut at, which
    means waiting for the next window rather than cutting mid-sentence.

    The tail after the cut is deliberately left behind. It is the part still
    being spoken.
    """
    midpoints, total_s = _silence_plan(audio_path)
    after_s = after_ms / 1000.0

    usable = [m for m in midpoints if m >= after_s + MIN_WINDOW_SECONDS]
    if total_s is not None:
        usable = [m for m in usable if m <= total_s]
    if not usable:
        logger.info(
            "window skipped: nowhere safe to cut yet",
            extra={"covered_s": after_s, "silences": len(midpoints)},
        )
        return None
    return int(max(usable) * 1000)


def extract(audio_path: str, start_ms: int, end_ms: int, dest: str) -> bool:
    """Decode one stretch of the recording into a file Whisper can read.

    -ss and -to go after -i on purpose: on the input side ffmpeg seeks by
    keyframe, which for a concatenation of webm chunks lands somewhere near the
    right place rather than at it. Output-side seeking decodes and discards,
    which costs the ~7.2 s per hour above and is exact.
    """
    try:
        subprocess.run(  # noqa: S603 — ffmpeg off PATH, fixed argv, no shell
            [  # noqa: S607
                "ffmpeg", "-nostdin", "-loglevel", "error", "-i", audio_path,
                "-ss", f"{start_ms / 1000.0:.3f}", "-to", f"{end_ms / 1000.0:.3f}",
                "-vn", "-ac", "1", "-ar", "16000", "-y", dest,
            ],
            capture_output=True, text=True, timeout=_FFMPEG_TIMEOUT_S, check=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning(
            "could not extract the window",
            extra={"path": audio_path, "start_ms": start_ms, "end_ms": end_ms, "error": str(exc)},
        )
        return False
    return os.path.isfile(dest) and os.path.getsize(dest) > 0


def transcribe_window(
    parts_dir: str, upload_id: str, parts: int, covered_ms: int
) -> Window | None:
    """The session's next stretch of text, or None if there is nothing to take.

    The work happens in a directory next to the parts rather than /tmp: the
    concatenation is the size of the recording so far, and this is the volume
    already sized for audio.
    """
    paths = part_paths(parts_dir, upload_id, parts)
    if paths is None:
        return None

    with tempfile.TemporaryDirectory(prefix=f"window-{os.getpid()}-", dir=parts_dir) as workdir:
        joined = os.path.join(workdir, "joined.webm")
        concat_parts(paths, joined)

        end_ms = cut_point(joined, covered_ms)
        if end_ms is None:
            return None

        window = os.path.join(workdir, "window.wav")
        if not extract(joined, covered_ms, end_ms, window):
            return None

        result: Transcription = transcribe_audio(window)

    text = result.text.strip()
    if not text:
        # Silence, or a hallucination loop the transcriber threw away. The cut
        # still advances: those seconds have been looked at, and re-reading them
        # in the next window would only produce the same nothing at more cost.
        logger.info("window produced no text", extra={"upload_id": upload_id, "end_ms": end_ms})
    logger.info(
        "window transcribed",
        extra={
            "upload_id": upload_id, "parts": parts,
            "from_ms": covered_ms, "to_ms": end_ms,
            "chars": len(text), "ms": result.transcribe_ms,
        },
    )
    return Window(text=text, end_ms=end_ms, transcribe_ms=result.transcribe_ms)
