"""Transcribing the session while it is still being recorded (Fase 4).

Every test here is about the same worry from a different side: this code runs
while a professional is in a room with a patient, and the only thing it may
never do is make the ordinary path worse. So it skips rather than guesses, and
it refuses rather than overwrites.
"""
import os

import pytest

from ai_service.transcription import windows
from ai_service.transcription.windows import (
    MIN_WINDOW_SECONDS,
    PART_SUFFIX,
    concat_parts,
    cut_point,
    part_paths,
)


def write_parts(tmp_path, upload_id: str, bodies: list[bytes], skip: set[int] | None = None):
    skip = skip or set()
    for index, body in enumerate(bodies):
        if index in skip:
            continue
        (tmp_path / f"{upload_id}.{index}{PART_SUFFIX}").write_bytes(body)
    return str(tmp_path)


def test_a_missing_part_stops_the_window_rather_than_being_skipped_over(tmp_path):
    # Concatenating across a hole produces a shorter recording that transcribes
    # perfectly well, and a note describing a conversation with a piece missing.
    # Nothing downstream is in a position to notice, so this has to.
    parts_dir = write_parts(tmp_path, "up", [b"a", b"b", b"c", b"d"], skip={2})
    assert part_paths(parts_dir, "up", 4) is None


def test_parts_are_ordered_by_number_not_by_name(tmp_path):
    # The tenth part sorts before the second as a string. A session longer than
    # ten minutes would be transcribed in the wrong order, which reads as a
    # confused patient rather than as a bug.
    parts_dir = write_parts(tmp_path, "up", [bytes([i]) for i in range(12)])
    paths = part_paths(parts_dir, "up", 12)
    assert paths is not None
    assert [os.path.basename(p) for p in paths[:3]] == [
        f"up.0{PART_SUFFIX}", f"up.1{PART_SUFFIX}", f"up.2{PART_SUFFIX}"
    ]
    assert os.path.basename(paths[10]) == f"up.10{PART_SUFFIX}"


def test_the_parts_are_joined_byte_for_byte_in_order(tmp_path):
    parts_dir = write_parts(tmp_path, "up", [b"header-", b"middle-", b"tail"])
    paths = part_paths(parts_dir, "up", 3)
    dest = tmp_path / "joined.webm"
    concat_parts(paths, str(dest))
    assert dest.read_bytes() == b"header-middle-tail"


def test_the_cut_goes_at_the_last_silence_past_what_is_covered(monkeypatch):
    # 600 s of audio, silences every couple of minutes. Covered up to 120 s.
    monkeypatch.setattr(
        windows, "_silence_plan", lambda path: ([30.0, 118.0, 240.0, 470.0, 590.0], 600.0)
    )
    # 470 and 590 both qualify; the later one wins, because the tail after the
    # cut is what gets left for the next window and should be as short as the
    # silences allow.
    assert cut_point("ignored", after_ms=120_000) == 590_000


def test_a_silence_too_close_to_what_is_covered_is_not_a_cut(monkeypatch):
    monkeypatch.setattr(windows, "_silence_plan", lambda path: ([121.0, 122.0], 600.0))
    # Both are past 120 s and neither leaves a window worth the decode that
    # producing it costs.
    assert cut_point("ignored", after_ms=120_000) is None
    assert MIN_WINDOW_SECONDS > 2


def test_no_silence_at_all_means_waiting_rather_than_cutting_mid_sentence(monkeypatch):
    # Cutting anywhere else splits a word across two windows, and the two halves
    # are transcribed independently by a model that will happily invent a whole
    # one out of each.
    monkeypatch.setattr(windows, "_silence_plan", lambda path: ([], 600.0))
    assert cut_point("ignored", after_ms=0) is None


def test_a_silence_past_the_end_of_the_recording_is_not_a_cut(monkeypatch):
    # ffmpeg reports silences from the decode; a concatenation whose duration it
    # could measure must not be cut past it.
    monkeypatch.setattr(windows, "_silence_plan", lambda path: ([700.0], 600.0))
    assert cut_point("ignored", after_ms=0) is None


def test_an_unmeasurable_duration_still_allows_a_cut(monkeypatch):
    # `Duration: N/A` is the normal answer for a concatenation of webm chunks.
    # Refusing to cut without it would mean never running a window at all.
    monkeypatch.setattr(windows, "_silence_plan", lambda path: ([200.0], None))
    assert cut_point("ignored", after_ms=0) == 200_000


def test_the_window_does_nothing_when_a_part_is_still_missing(tmp_path, monkeypatch):
    parts_dir = write_parts(tmp_path, "up", [b"a", b"b", b"c"], skip={1})

    def explode(*args, **kwargs):
        raise AssertionError("the transcriber must not be reached")

    monkeypatch.setattr(windows, "transcribe_audio", explode)
    assert windows.transcribe_window(parts_dir, "up", 3, 0) is None


# ── What the worker refuses to do ────────────────────────────────────────────


class FakeDB:
    """Enough asyncpg to drive _process_window's decisions.

    `rows` is what the next fetchrow returns, popped in order, so a test can say
    what the database looked like before the transcription and what it looked
    like after.
    """

    def __init__(self, rows: list[dict | None]) -> None:
        self.rows = list(rows)
        self.executed: list[tuple] = []

    async def fetchrow(self, _query: str, *args):
        return self.rows.pop(0) if self.rows else None

    async def execute(self, query: str, *args):
        self.executed.append((query, args))


def make_worker(db) -> "worker_mod.AIWorker":
    from ai_service.worker import AIWorker

    w = AIWorker("redis://unused", "postgres://unused", "00" * 32, redis_client=object())
    w._db = db
    return w


def never_transcribes(*args, **kwargs):
    raise AssertionError("the transcriber must not be reached")


@pytest.mark.asyncio
async def test_a_redelivered_window_does_not_redo_work_the_session_already_has(monkeypatch):
    # A retried part re-enqueues its window and a reclaimed PEL entry
    # re-delivers one. Both land here, during a live session, on two cores.
    from ai_service import worker as worker_mod

    monkeypatch.setattr(worker_mod, "transcribe_window", never_transcribes)
    db = FakeDB([{"covered_parts": 10, "covered_ms": 500_000,
                  "encrypted_dek": b"x", "key_source": "env:MASTER_KEY"}])
    await make_worker(db)._process_window("org", "appt", "up", "/tmp", 5)
    assert db.executed == []


@pytest.mark.asyncio
async def test_a_window_for_a_session_that_is_over_does_nothing(monkeypatch):
    # The draft absorbed the partial, or the sweep took it. Either way there is
    # nothing left to transcribe into, and the audio is very likely gone too.
    from ai_service import worker as worker_mod

    monkeypatch.setattr(worker_mod, "transcribe_window", never_transcribes)
    db = FakeDB([None])
    await make_worker(db)._process_window("org", "appt", "up", "/tmp", 5)
    assert db.executed == []


@pytest.mark.asyncio
async def test_a_window_is_discarded_when_the_session_moved_on_while_it_ran(monkeypatch):
    # Transcription takes minutes. Appending to the text as it looked before
    # those minutes would drop whatever landed in between — and the UPDATE's own
    # guard would then reject the write, so the work is lost either way. This is
    # about noticing rather than silently discarding.
    from ai_service import worker as worker_mod
    from ai_service.transcription.windows import Window

    monkeypatch.setattr(
        worker_mod, "transcribe_window",
        lambda *a, **k: Window(text="hola", end_ms=300_000, transcribe_ms=10),
    )
    db = FakeDB([
        {"covered_parts": 0, "covered_ms": 0,
         "encrypted_dek": b"x", "key_source": "env:MASTER_KEY"},
        # Someone else advanced the session while this window was running.
        {"transcript_enc": None, "covered_ms": 120_000},
    ])
    w = make_worker(db)
    monkeypatch.setattr(w, "_decrypt_dek", lambda source, blob: b"k" * 32)
    await w._process_window("org", "appt", "up", "/tmp", 5)
    assert db.executed == []


@pytest.mark.asyncio
async def test_the_stored_update_refuses_to_move_the_cut_backwards(monkeypatch):
    from ai_service import worker as worker_mod
    from ai_service.transcription.windows import Window

    monkeypatch.setattr(
        worker_mod, "transcribe_window",
        lambda *a, **k: Window(text="hola", end_ms=300_000, transcribe_ms=10),
    )
    db = FakeDB([
        {"covered_parts": 0, "covered_ms": 0,
         "encrypted_dek": b"x", "key_source": "env:MASTER_KEY"},
        {"transcript_enc": None, "covered_ms": 0},
    ])
    w = make_worker(db)
    monkeypatch.setattr(w, "_decrypt_dek", lambda source, blob: b"k" * 32)
    await w._process_window("org", "appt", "up", "/tmp", 5)

    assert len(db.executed) == 1
    query, args = db.executed[0]
    # Without this the late redelivery of an earlier window replaces twenty
    # minutes of session with five and moves the cut back to match. See
    # migration 000078 for the trigger that catches a writer who drops it.
    assert "covered_ms < $6" in query
    assert args[-1] == 300_000


# ── Absorbing what the windows already did (rebanada 4) ──────────────────────


def a_partial(covered_ms: int, blob: bytes | None = b"cipher"):
    return {"covered_ms": covered_ms, "transcript_enc": blob,
            "encrypted_dek": b"x", "key_source": "env:MASTER_KEY"}


def a_draft(upload_id: str | None = "up", appointment_id: str | None = "appt"):
    return {"upload_id": upload_id, "appointment_id": appointment_id,
            "organization_id": "org"}


@pytest.mark.asyncio
async def test_a_recording_picked_by_hand_has_nothing_to_absorb():
    # No upload id means no parts and no windows: a whole file the professional
    # chose, which really does need transcribing end to end.
    w = make_worker(FakeDB([]))
    assert await w._absorbed_partial(a_draft(upload_id=None)) == (0, "")


@pytest.mark.asyncio
async def test_a_session_with_no_windows_yet_is_transcribed_whole():
    w = make_worker(FakeDB([a_partial(covered_ms=0, blob=None)]))
    assert await w._absorbed_partial(a_draft()) == (0, "")


@pytest.mark.asyncio
async def test_covered_audio_with_no_text_is_never_skipped_over():
    # The CHECK in migration 000077 forbids this, so reaching it means the
    # constraint is gone. Trusting covered_ms here would start the tail after
    # minutes there are no words for, and the note would read perfectly.
    w = make_worker(FakeDB([a_partial(covered_ms=300_000, blob=None)]))
    assert await w._absorbed_partial(a_draft()) == (0, "")


@pytest.mark.asyncio
async def test_a_key_that_will_not_open_falls_back_to_the_whole_take(monkeypatch):
    w = make_worker(FakeDB([a_partial(covered_ms=300_000)]))
    monkeypatch.setattr(w, "_decrypt_dek", lambda *a: (_ for _ in ()).throw(ValueError("nope")))
    assert await w._absorbed_partial(a_draft()) == (0, "")


@pytest.mark.asyncio
async def test_what_the_windows_transcribed_is_handed_back_with_its_cut(monkeypatch):
    from ai_service import worker as worker_mod

    w = make_worker(FakeDB([a_partial(covered_ms=300_000)]))
    monkeypatch.setattr(w, "_decrypt_dek", lambda *a: b"k" * 32)
    monkeypatch.setattr(worker_mod, "open_", lambda dek, blob: b"la sesion hasta aqui")
    assert await w._absorbed_partial(a_draft()) == (300_000, "la sesion hasta aqui")
