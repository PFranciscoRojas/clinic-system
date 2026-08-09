"""How long was the recording? The RTF that decides whether a Whisper runtime
change was worth it is transcribe_ms over this number, so a wrong duration is
worse than no duration: it produces a plausible RTF that argues for the wrong
conclusion. Both sources are allowed to fail, and both failures have to end in
None rather than in a guess."""

import subprocess

from ai_service.transcription.whisper import (
    _duration_from_segments,
    _parse_ffprobe_duration,
    probe_audio_seconds,
)


class TestParseFfprobeDuration:
    def test_reads_a_plain_duration(self) -> None:
        assert _parse_ffprobe_duration("3482.160000\n") == 3482.16

    def test_na_is_not_a_duration(self) -> None:
        # The normal case for this pipeline: a WebM assembled from MediaRecorder
        # chunks carries no duration in its header, and ffprobe says so.
        assert _parse_ffprobe_duration("N/A\n") is None

    def test_empty_output_is_not_a_duration(self) -> None:
        assert _parse_ffprobe_duration("") is None
        assert _parse_ffprobe_duration("   \n") is None

    def test_zero_and_negative_are_rejected(self) -> None:
        # Zero would make the generated rtf column divide by NULLIF(0) and come
        # out NULL anyway; rejecting it here keeps the reason visible.
        assert _parse_ffprobe_duration("0") is None
        assert _parse_ffprobe_duration("-1.5") is None

    def test_infinity_and_nan_are_rejected(self) -> None:
        # float() happily parses both, and either one poisons every aggregate
        # computed over the column.
        assert _parse_ffprobe_duration("inf") is None
        assert _parse_ffprobe_duration("nan") is None


class TestDurationFromSegments:
    def test_uses_the_last_end(self) -> None:
        segments = [{"end": 12.0}, {"end": 30.5}, {"end": 58.25}]
        assert _duration_from_segments(segments) == 58.25

    def test_survives_segments_out_of_order(self) -> None:
        # Nothing in the pipeline reorders segments today, but the fallback must
        # not depend on that: taking the maximum costs the same as taking [-1].
        segments = [{"end": 58.25}, {"end": 12.0}]
        assert _duration_from_segments(segments) == 58.25

    def test_skips_malformed_segments(self) -> None:
        segments = [{"end": 10.0}, {}, {"end": None}, {"end": "no"}, {"end": 20.0}]
        assert _duration_from_segments(segments) == 20.0

    def test_no_segments_means_no_duration(self) -> None:
        assert _duration_from_segments([]) is None

    def test_all_segments_at_zero_means_no_duration(self) -> None:
        assert _duration_from_segments([{"end": 0.0}]) is None


class TestProbeAudioSeconds:
    def test_returns_the_probed_duration(self, monkeypatch) -> None:
        monkeypatch.setattr(
            subprocess, "run",
            lambda *a, **k: subprocess.CompletedProcess(a, 0, stdout="3482.16\n", stderr=""),
        )
        assert probe_audio_seconds("/audio/take.webm") == 3482.16

    def test_a_failed_probe_is_not_an_error(self, monkeypatch) -> None:
        monkeypatch.setattr(
            subprocess, "run",
            lambda *a, **k: subprocess.CompletedProcess(a, 1, stdout="", stderr="boom"),
        )
        assert probe_audio_seconds("/audio/take.webm") is None

    def test_a_missing_ffprobe_never_costs_a_draft(self, monkeypatch) -> None:
        def _explode(*a, **k):
            raise FileNotFoundError("ffprobe")

        monkeypatch.setattr(subprocess, "run", _explode)
        assert probe_audio_seconds("/audio/take.webm") is None

    def test_a_wedged_ffprobe_never_costs_a_draft(self, monkeypatch) -> None:
        def _explode(*a, **k):
            raise subprocess.TimeoutExpired(cmd="ffprobe", timeout=20)

        monkeypatch.setattr(subprocess, "run", _explode)
        assert probe_audio_seconds("/audio/take.webm") is None

    def test_probe_does_not_decode_the_stream(self, monkeypatch) -> None:
        # An hour of audio decodes in seconds, and this call sits directly in
        # the latency the whole plan is trying to cut. Reading the header is the
        # entire point, so the flags that keep it a header read are pinned.
        seen: dict[str, list[str]] = {}

        def _capture(cmd, **k):
            seen["cmd"] = cmd
            return subprocess.CompletedProcess(cmd, 0, stdout="1.0\n", stderr="")

        monkeypatch.setattr(subprocess, "run", _capture)
        probe_audio_seconds("/audio/take.webm")

        assert seen["cmd"][0] == "ffprobe"
        assert "format=duration" in seen["cmd"]
        assert "/audio/take.webm" == seen["cmd"][-1]
        # -count_frames / -count_packets would each force a full read.
        assert not any(flag.startswith("-count_") for flag in seen["cmd"])
