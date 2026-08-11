"""Why an hour of audio is transcribed in pieces and never in one go.

faster-whisper computes the log-Mel spectrogram of the *whole* file before it
decodes anything (feature_extractor.py: one np.fft.rfft over every frame). The
strided float32 frames, the complex128 FFT and its complex64 copy are all alive
at once, which costs roughly 0.9 MB per second of audio — a 56-minute session
peaks at ~3.4 GB.

The production VPS has 1.9 GB. On 2026-08-11 the first real session-length
recording OOM-killed the ai-service mid-transcription
("Out of memory: Killed process ... (uvicorn) ... anon-rss:1671844kB"), and the
retry loop killed it twice more. Measured on that same 3369 s recording:

    whole file, vad_filter=True    3459 MB   211 s
    whole file, vad_filter=False   3187 MB   201 s   (so the VAD is not the cause)
    ffmpeg, cuts every 180 s        606 MB   217 s
    ffmpeg, cuts inside silence     528 MB   216 s

Cutting bounds the peak at the size of one piece and costs ~2% of wall time.
Cutting *inside silence* rather than blindly costs nothing extra and keeps the
words a blind cut splits in half (58 545 characters against 57 968).
"""

import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest

from ai_service.transcription import whisper as whisper_mod
from ai_service.transcription.whisper import (
    _cut_points,
    _parse_decoded_seconds,
    _parse_silences,
    _silence_plan,
    transcribe_audio,
)


@dataclass
class FakeSegment:
    end: float
    text: str
    no_speech_prob: float = 0.0


@dataclass
class FakeInfo:
    duration: float | None


class RecordingModel:
    """Remembers every piece of audio it was asked to transcribe."""

    def __init__(self, per_piece: dict[str, tuple[list[FakeSegment], float | None]]):
        self._per_piece = per_piece
        self.seen: list[str] = []

    def transcribe(self, audio: str, **kwargs: Any) -> tuple[Any, FakeInfo]:
        self.seen.append(audio)
        segments, duration = self._per_piece[audio]
        return iter(segments), FakeInfo(duration)


class TestParseSilences:
    """ffmpeg reports silence on stderr, as a start line and an end line."""

    STDERR = (
        "[silencedetect @ 0x55] silence_start: 12.5\n"
        "[silencedetect @ 0x55] silence_end: 13.7 | silence_duration: 1.2\n"
        "[silencedetect @ 0x55] silence_start: 180.0\n"
        "[silencedetect @ 0x55] silence_end: 181.0 | silence_duration: 1.0\n"
    )

    def test_returns_the_middle_of_each_silence(self) -> None:
        # The middle is the safest place to cut: furthest from the speech on
        # either side.
        assert _parse_silences(self.STDERR) == [13.1, 180.5]

    def test_ignores_a_silence_that_never_ends(self) -> None:
        # ffmpeg emits silence_start with no silence_end when the recording
        # ends in silence. There is nothing after it to cut away from.
        assert _parse_silences("silence_start: 42.0\n") == []

    def test_no_silence_at_all_is_not_an_error(self) -> None:
        # Continuous speech, or an ffmpeg that died before printing anything.
        assert _parse_silences("") == []


class TestParseDecodedSeconds:
    """How long the recording really is, taken from ffmpeg's own progress line.

    Not from the container header: a WebM assembled out of MediaRecorder chunks
    normally declares `Duration: N/A`, which is the reason this pipeline could
    not report an RTF in the first place. The progress line is written after
    the decoder has been through every frame, so it cannot be wrong about it.
    """

    def test_reads_the_last_progress_line(self) -> None:
        stderr = (
            "size=N/A time=00:04:00.00 bitrate=N/A speed= 240x\n"
            "size=N/A time=00:56:09.12 bitrate=N/A speed= 238x\n"
        )
        assert _parse_decoded_seconds(stderr) == pytest.approx(3369.12)

    def test_no_progress_line_means_unknown(self) -> None:
        # Unknown, never guessed: the tail of the recording is then cut on a
        # fixed schedule rather than on a made-up length.
        assert _parse_decoded_seconds("") is None
        assert _parse_decoded_seconds("time=N/A\n") is None


class TestCutPoints:
    def test_cuts_at_the_first_silence_past_the_window(self) -> None:
        # Nominal boundary at 180 s; 176.0 is the first silence inside the
        # search window, so that is where the piece ends.
        cuts = _cut_points([20.0, 176.0, 200.0, 355.0], total_s=400.0, window_s=180, search_s=25)
        assert cuts == [176.0, 355.0]

    def test_measures_the_next_window_from_the_actual_cut(self) -> None:
        # The first cut lands early, at 160. The second window is measured from
        # there (340), so 330 wins. Measured from the nominal 180 the target
        # would be 360 and 345 would win instead — and a run of early cuts
        # would compound, drifting the pieces further from the window each time.
        cuts = _cut_points([160.0, 330.0, 345.0], total_s=400.0, window_s=180, search_s=25)
        assert cuts == [160.0, 330.0]

    def test_cuts_hard_when_nobody_stops_talking(self) -> None:
        # A silence-free stretch must not produce a piece bigger than the
        # window: the memory bound is the point, and it does not negotiate.
        cuts = _cut_points([500.0], total_s=600.0, window_s=180, search_s=25)
        assert cuts == [180.0, 360.0, 500.0]

    def test_keeps_cutting_past_the_last_silence(self) -> None:
        # Everything after the last silence is still audio, and a 20-minute
        # tail costs as much memory as a 20-minute recording.
        cuts = _cut_points([170.0], total_s=800.0, window_s=180, search_s=25)
        assert cuts == [170.0, 350.0, 530.0, 710.0]

    def test_audio_shorter_than_one_window_is_not_cut(self) -> None:
        assert _cut_points([30.0], total_s=90.0, window_s=180, search_s=25) == []

    def test_an_unknown_length_still_cuts_on_the_silences_it_knows(self) -> None:
        # ffmpeg could not say how long the file is, so the tail cannot be
        # planned. The cuts that were observed still apply, and _split_audio
        # falls back to fixed segmentation when there are none at all.
        assert _cut_points([176.0], total_s=None, window_s=180, search_s=25) == [176.0]
        assert _cut_points([], total_s=None, window_s=180, search_s=25) == []


class TestSilencePlanFailure:
    def test_ffmpeg_missing_or_broken_is_not_fatal(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Knowing where the silences are is an optimisation. Cutting at all is
        # the safety property, and it has to survive on its own — an empty plan
        # sends _split_audio to evenly spaced cuts, which still bounds memory.
        def explode(*args: Any, **kwargs: Any) -> None:
            raise FileNotFoundError("ffmpeg")

        monkeypatch.setattr(whisper_mod.subprocess, "run", explode)
        assert _silence_plan("/audio/take.webm") == ([], None)

    def test_a_timeout_is_not_fatal_either(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def timeout(*args: Any, **kwargs: Any) -> None:
            raise subprocess.TimeoutExpired(cmd="ffmpeg", timeout=1)

        monkeypatch.setattr(whisper_mod.subprocess, "run", timeout)
        assert _silence_plan("/audio/take.webm") == ([], None)


class TestTranscribeAudioInPieces:
    @pytest.fixture
    def pieces(self, split_audio_into: Callable[[list[str]], list[str]]) -> list[str]:
        return split_audio_into(["/w/p0000.wav", "/w/p0001.wav", "/w/p0002.wav"])

    def _use(self, monkeypatch: pytest.MonkeyPatch, model: RecordingModel) -> RecordingModel:
        monkeypatch.setattr(whisper_mod, "_load_model", lambda: model)
        return model

    def test_never_hands_whisper_the_whole_recording(
        self, monkeypatch: pytest.MonkeyPatch, pieces: list[str]
    ) -> None:
        # The regression this file exists for. Transcribing the original file
        # in one call is what OOM-killed production.
        model = self._use(monkeypatch, RecordingModel(
            {p: ([FakeSegment(10.0, "x")], 180.0) for p in pieces}
        ))

        transcribe_audio("/audio/take.webm")

        assert "/audio/take.webm" not in model.seen
        assert model.seen == pieces

    def test_joins_the_text_of_every_piece_in_order(
        self, monkeypatch: pytest.MonkeyPatch, pieces: list[str]
    ) -> None:
        self._use(monkeypatch, RecordingModel({
            pieces[0]: ([FakeSegment(90.0, "Buenos días. ")], 180.0),
            pieces[1]: ([FakeSegment(90.0, "¿Cómo ha dormido? ")], 180.0),
            pieces[2]: ([FakeSegment(30.0, "Nos vemos el jueves.")], 60.0),
        }))

        result = transcribe_audio("/audio/take.webm")

        assert result.text == "Buenos días. ¿Cómo ha dormido? Nos vemos el jueves."

    def test_the_duration_is_the_sum_of_the_pieces(
        self, monkeypatch: pytest.MonkeyPatch, pieces: list[str]
    ) -> None:
        self._use(monkeypatch, RecordingModel({
            pieces[0]: ([FakeSegment(90.0, "a")], 180.0),
            pieces[1]: ([FakeSegment(90.0, "b")], 180.0),
            pieces[2]: ([FakeSegment(30.0, "c")], 61.5),
        }))

        assert transcribe_audio("/audio/take.webm").audio_seconds == 421.5

    def test_a_piece_of_unknown_length_falls_back_to_its_segments(
        self, monkeypatch: pytest.MonkeyPatch, pieces: list[str]
    ) -> None:
        # One unreadable piece must not take the whole RTF down with it: the
        # rest of the recording still has a length.
        self._use(monkeypatch, RecordingModel({
            pieces[0]: ([FakeSegment(90.0, "a")], 180.0),
            pieces[1]: ([FakeSegment(150.0, "b")], None),
            pieces[2]: ([FakeSegment(30.0, "c")], 60.0),
        }))

        assert transcribe_audio("/audio/take.webm").audio_seconds == 390.0

    def test_drops_the_segments_whisper_flagged_as_silence_in_every_piece(
        self, monkeypatch: pytest.MonkeyPatch, pieces: list[str]
    ) -> None:
        self._use(monkeypatch, RecordingModel({
            pieces[0]: ([FakeSegment(90.0, "Hola. ", no_speech_prob=0.1)], 180.0),
            pieces[1]: ([FakeSegment(90.0, "RUIDO. ", no_speech_prob=0.95)], 180.0),
            pieces[2]: ([FakeSegment(30.0, "Adiós.", no_speech_prob=0.2)], 60.0),
        }))

        assert transcribe_audio("/audio/take.webm").text == "Hola. Adiós."

    def test_the_hallucination_guard_sees_the_whole_transcript(
        self, monkeypatch: pytest.MonkeyPatch, pieces: list[str]
    ) -> None:
        # A silence loop now spreads across pieces. Checking each piece on its
        # own would let through a transcript that is one sentence repeated
        # forever, because no single piece repeats it often enough.
        looped = "El paciente refiere ansiedad. "
        self._use(monkeypatch, RecordingModel(
            {p: ([FakeSegment(90.0, looped * 2)], 180.0) for p in pieces}
        ))

        result = transcribe_audio("/audio/take.webm")

        assert result.text == ""
        # Thrown away, but still measured: a run that burned the CPU and
        # produced nothing is exactly what the instrumentation is for.
        assert result.audio_seconds == 540.0
