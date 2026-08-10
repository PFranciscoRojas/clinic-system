"""What the transcription step reports about itself.

Two things have to hold. The duration has to be right or absent — never guessed
— because the RTF that decides whether a runtime change was worth it is
transcribe_ms over that number, and a plausible-but-wrong RTF argues for the
wrong conclusion more effectively than no RTF at all.

And transcribe_ms has to cover the work. faster-whisper's transcribe() returns a
generator: it hands back an iterator in milliseconds and does the decoding while
that iterator is consumed. Timing the call alone is the obvious way to write
this and it reports ~0 ms for an eight-minute transcription.
"""

import time
from dataclasses import dataclass

import pytest

from ai_service.transcription import whisper as whisper_mod
from ai_service.transcription.whisper import (
    _duration_from_segments,
    _usable_duration,
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


class FakeModel:
    """Stands in for faster-whisper's WhisperModel.

    The generator sleeps per segment so a test can tell the difference between
    timing the call and timing the work — which is the whole point.
    """

    def __init__(self, segments, duration, work_per_segment=0.0):
        self._segments = segments
        self._duration = duration
        self._work = work_per_segment
        self.kwargs: dict = {}

    def transcribe(self, audio_path, **kwargs):
        self.kwargs = kwargs

        def _gen():
            for seg in self._segments:
                if self._work:
                    time.sleep(self._work)
                yield seg

        return _gen(), FakeInfo(self._duration)


@pytest.fixture
def use_model(monkeypatch):
    """Install a fake model in place of the real one."""

    def _install(model: FakeModel) -> FakeModel:
        monkeypatch.setattr(whisper_mod, "_load_model", lambda: model)
        return model

    return _install


class TestUsableDuration:
    def test_accepts_a_real_duration(self) -> None:
        assert _usable_duration(3482.16) == 3482.16
        assert _usable_duration("60.0") == 60.0

    def test_rejects_zero_and_negative(self) -> None:
        # Zero would divide into the generated rtf column as NULL anyway;
        # rejecting it here keeps the reason visible instead of implicit.
        assert _usable_duration(0) is None
        assert _usable_duration(-1.5) is None

    def test_rejects_nan_and_infinity(self) -> None:
        # Both survive float() and both poison every aggregate computed over
        # the column afterwards.
        assert _usable_duration(float("nan")) is None
        assert _usable_duration(float("inf")) is None
        assert _usable_duration(float("-inf")) is None

    def test_rejects_what_is_not_a_number(self) -> None:
        assert _usable_duration(None) is None
        assert _usable_duration("N/A") is None
        assert _usable_duration(object()) is None


class TestDurationFromSegments:
    def test_uses_the_furthest_end(self) -> None:
        segs = [FakeSegment(12.0, "a"), FakeSegment(58.25, "b"), FakeSegment(30.5, "c")]
        assert _duration_from_segments(segs) == 58.25

    def test_skips_segments_without_a_usable_end(self) -> None:
        segs = [FakeSegment(10.0, "a"), FakeSegment(None, "b"), FakeSegment(20.0, "c")]
        assert _duration_from_segments(segs) == 20.0

    def test_no_segments_means_no_duration(self) -> None:
        assert _duration_from_segments([]) is None


class TestTranscribeAudio:
    def test_measures_the_work_not_the_call(self, use_model) -> None:
        # transcribe() returns in microseconds; the decoding happens during
        # iteration. If transcribe_ms only covered the call, this would report
        # roughly zero and the instrumentation would describe a pipeline that
        # costs nothing.
        use_model(FakeModel(
            [FakeSegment(10.0, "uno "), FakeSegment(20.0, "dos "), FakeSegment(30.0, "tres")],
            duration=30.0,
            work_per_segment=0.05,
        ))

        result = transcribe_audio("/audio/take.webm")

        assert result.transcribe_ms >= 100, (
            f"transcribe_ms={result.transcribe_ms} — the generator was not consumed "
            "inside the measured window"
        )

    def test_reports_the_duration_the_runtime_decoded(self, use_model) -> None:
        use_model(FakeModel([FakeSegment(58.0, "hola")], duration=3482.16))
        assert transcribe_audio("/audio/take.webm").audio_seconds == 3482.16

    def test_falls_back_to_segments_when_the_runtime_cannot_say(self, use_model) -> None:
        use_model(FakeModel([FakeSegment(58.0, "hola"), FakeSegment(120.0, " adiós")], duration=None))
        assert transcribe_audio("/audio/take.webm").audio_seconds == 120.0

    def test_leaves_the_duration_unknown_rather_than_guessing(self, use_model) -> None:
        # No duration and no segments: rtf stays NULL, which is the honest
        # answer. Anything else here invents data.
        use_model(FakeModel([], duration=None))
        assert transcribe_audio("/audio/take.webm").audio_seconds is None

    def test_joins_the_segment_text(self, use_model) -> None:
        use_model(FakeModel(
            [FakeSegment(10.0, "Hola, "), FakeSegment(20.0, "¿cómo ha estado?")],
            duration=20.0,
        ))
        assert transcribe_audio("/audio/take.webm").text == "Hola, ¿cómo ha estado?"

    def test_drops_segments_whisper_itself_flagged_as_silence(self, use_model) -> None:
        use_model(FakeModel(
            [
                FakeSegment(10.0, "Hola. ", no_speech_prob=0.1),
                FakeSegment(20.0, "RUIDO. ", no_speech_prob=0.95),
                FakeSegment(30.0, "Adiós.", no_speech_prob=0.2),
            ],
            duration=30.0,
        ))
        assert transcribe_audio("/audio/take.webm").text == "Hola. Adiós."

    def test_keeps_the_measurement_when_the_text_is_discarded(self, use_model) -> None:
        # A looped hallucination is thrown away, but the run still consumed the
        # queue and the CPU. Dropping its timings would flatter the numbers by
        # hiding exactly the runs worth seeing.
        looped = "El paciente refiere ansiedad. " * 4
        use_model(FakeModel(
            [FakeSegment(30.0, looped)], duration=30.0, work_per_segment=0.05,
        ))

        result = transcribe_audio("/audio/take.webm")

        assert result.text == ""
        assert result.audio_seconds == 30.0
        assert result.transcribe_ms >= 50

    def test_the_options_that_fight_the_hallucination_loop_are_on(self, use_model) -> None:
        # vad_filter keeps silence away from the decoder, and
        # condition_on_previous_text=False stops one hallucinated window from
        # becoming the prompt for the next. Both are deliberate; a default flip
        # in a future faster-whisper release must not silently undo them.
        model = use_model(FakeModel([FakeSegment(10.0, "hola")], duration=10.0))

        transcribe_audio("/audio/take.webm")

        assert model.kwargs["vad_filter"] is True
        assert model.kwargs["condition_on_previous_text"] is False
        assert model.kwargs["language"] == "es"
        assert model.kwargs["initial_prompt"] == whisper_mod.CLINICAL_PROMPT_ES
