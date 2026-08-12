"""Decoded audio pieces must not outlive the process that made them.

Transcription cuts the recording into 16 kHz mono WAV pieces in a temporary
directory next to the audio. `tempfile.TemporaryDirectory` removes it on the way
out of the `with` — but not when the process is SIGKILLed.

What would survive is unencrypted PCM of a clinical session sitting on the
volume: the same speech that the rest of this system encrypts per patient, in
the clear, for as long as nobody looks. `worker.py` deletes the original
recording once the text is stored; these pieces had nothing doing the same.

No such directory has ever been found on the volume, and that proves nothing:
the chunking that creates them shipped hours after the kernel OOM-killed this
service on 2026-08-11, so the one SIGKILL it is known to have taken came before
there was anything to leave behind. The kill is what makes the scenario real.
The empty volume is only the order the two changes landed in.

So the worker sweeps at startup, before it takes a single job.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from ai_service.transcription.whisper import PIECE_DIR_PREFIX, sweep_orphaned_pieces


@pytest.fixture
def dead_pid() -> int:
    """A pid that is definitely not running any more."""
    proc = subprocess.Popen([sys.executable, "-c", "pass"])
    proc.wait()
    return proc.pid


class TestSweepOrphanedPieces:
    def test_removes_the_pieces_of_a_process_that_is_gone(
        self, tmp_path: Path, dead_pid: int
    ) -> None:
        orphan = tmp_path / "org" / "appt" / f"{PIECE_DIR_PREFIX}{dead_pid}-abcd"
        orphan.mkdir(parents=True)
        (orphan / "piece0000.wav").write_bytes(b"RIFF....")

        assert sweep_orphaned_pieces(str(tmp_path)) == 1
        assert not orphan.exists()

    def test_leaves_the_pieces_of_a_process_that_is_still_running(
        self, tmp_path: Path
    ) -> None:
        # A second worker mid-transcription. Deleting its pieces would break a
        # job that is doing nothing wrong.
        live = tmp_path / "org" / "appt" / f"{PIECE_DIR_PREFIX}{os.getpid()}-efgh"
        live.mkdir(parents=True)

        assert sweep_orphaned_pieces(str(tmp_path)) == 0
        assert live.exists()

    def test_removes_a_directory_left_by_the_version_that_had_no_pid(
        self, tmp_path: Path
    ) -> None:
        # PR #265 shipped these named `whisper-XXXX`, with nothing to say who
        # owned them. Anything already on the volume at deploy time is an
        # orphan by definition — the process that made it is long gone.
        old = tmp_path / "org" / "appt" / f"{PIECE_DIR_PREFIX}xyz123"
        old.mkdir(parents=True)

        assert sweep_orphaned_pieces(str(tmp_path)) == 1
        assert not old.exists()

    def test_never_touches_the_recordings_themselves(self, tmp_path: Path) -> None:
        # The blast radius question. This runs over the volume that holds every
        # recording waiting to be transcribed; deleting one of those loses a
        # session that the professional cannot record again.
        appt = tmp_path / "org" / "appt"
        appt.mkdir(parents=True)
        recording = appt / "a1b2c3.webm"
        recording.write_bytes(b"webm")
        other = appt / "some-other-dir"
        other.mkdir()

        assert sweep_orphaned_pieces(str(tmp_path)) == 0
        assert recording.exists()
        assert other.exists()

    def test_a_missing_volume_is_not_an_error(self, tmp_path: Path) -> None:
        # First boot, or a volume that has not been mounted yet. The worker must
        # start either way — this sweep is hygiene, not a precondition.
        assert sweep_orphaned_pieces(str(tmp_path / "nope")) == 0

    def test_one_unremovable_directory_does_not_stop_the_rest(
        self, tmp_path: Path, dead_pid: int, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        first = tmp_path / f"{PIECE_DIR_PREFIX}{dead_pid}-aaaa"
        second = tmp_path / f"{PIECE_DIR_PREFIX}{dead_pid}-bbbb"
        first.mkdir()
        second.mkdir()

        import ai_service.transcription.whisper as whisper_mod

        real_rmtree = whisper_mod.shutil.rmtree

        def explode_on_first(path: str, *args: object, **kwargs: object) -> None:
            if str(path) == str(first):
                raise PermissionError("read-only")
            real_rmtree(path, *args, **kwargs)

        monkeypatch.setattr(whisper_mod.shutil, "rmtree", explode_on_first)

        assert sweep_orphaned_pieces(str(tmp_path)) == 1
        assert first.exists()
        assert not second.exists()


class TestPieceDirNaming:
    def test_the_prefix_carries_this_process_id(self, tmp_path: Path) -> None:
        # The sweep can only tell an orphan from a live job if the name says who
        # owns it. If these two ever drift apart, a running transcription gets
        # its pieces deleted underneath it.
        import ai_service.transcription.whisper as whisper_mod

        made: list[str] = []
        monkey = pytest.MonkeyPatch()
        monkey.setattr(whisper_mod, "_cut_into_pieces", lambda path, dest: made.append(dest) or [])
        try:
            with whisper_mod._split_audio(str(tmp_path / "take.webm")):
                pass
        finally:
            monkey.undo()

        assert made, "the split never created a working directory"
        assert Path(made[0]).name.startswith(f"{PIECE_DIR_PREFIX}{os.getpid()}-")
