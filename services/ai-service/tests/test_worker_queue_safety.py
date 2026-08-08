"""First tests over worker.py.

They pin the two queue invariants that used to hold only by accident: the
reclaim window has to outlast the longest job, and two worker processes must
never share a consumer identity. Both were fine while the worker was strictly
sequential and single-replica, and both break the moment either of those
changes — which is exactly what the latency plan proposes doing next
(docs/ai/PLAN_LATENCIA_AUDIO.md, fase 5).
"""
import re

from ai_service import worker


def test_reclaim_window_outlasts_the_longest_legitimate_job():
    """A job still running must never be reclaimed and processed twice.

    RECLAIM_IDLE_MS was a flat 5 min while an hour of audio takes ~8.5 min to
    transcribe on the VPS. Nothing crashed only because _handle is awaited
    inline in the read loop, so _reclaim_stale never ran alongside a live job.
    Concurrency ends that, and a reclaimed live job means two transcriptions,
    two drafts and two Claude calls for one session.
    """
    assert worker.RECLAIM_IDLE_MS > worker.WORST_CASE_JOB_MS, (
        f"reclaim window {worker.RECLAIM_IDLE_MS} ms does not outlast the worst-case "
        f"job of {worker.WORST_CASE_JOB_MS} ms"
    )


def test_worst_case_job_covers_the_measured_vps_throughput():
    """The derivation has to stay anchored to something real.

    Measured on the VPS (2 vCPU, whisper `base`): 58 min of audio transcribed in
    ~8.5 min, RTF 0.15. The constants must leave headroom over that, or the
    reclaim window silently becomes a guess again.
    """
    measured_rtf = 0.15
    assert measured_rtf < worker.WORST_CASE_RTF

    one_hour_ms = 60 * 60 * measured_rtf * 1_000
    assert one_hour_ms < worker.WORST_CASE_JOB_MS


def test_sweep_threshold_is_not_shorter_than_the_reclaim_window():
    """_sweep_stuck marks PROCESSING rows as ERROR at startup.

    It only runs at boot, when no job of this process can be alive, so a fixed
    threshold is correct today. It stops being correct with a second replica:
    one booting instance would mark another's live long job as failed. Pin the
    relationship so that change cannot land unnoticed.
    """
    assert worker.SWEEP_STUCK_AFTER_MS >= worker.RECLAIM_IDLE_MS


def test_consumer_name_distinguishes_processes_on_the_same_host(monkeypatch):
    """Two replicas must not share a PEL identity.

    With a shared name, one instance's _reclaim_stale can XCLAIM a message the
    other is actively working on. Two containers of the same image on one host
    is the case the old constant "ai-worker-1" got wrong.
    """
    monkeypatch.setattr(worker.socket, "gethostname", lambda: "same-host")

    monkeypatch.setattr(worker.os, "getpid", lambda: 101)
    first = worker._consumer_name()
    monkeypatch.setattr(worker.os, "getpid", lambda: 202)
    second = worker._consumer_name()

    assert first != second, f"both processes got the same consumer name: {first}"


def test_consumer_name_distinguishes_hosts(monkeypatch):
    """Same PID on two hosts is ordinary — containers restart at pid 1."""
    monkeypatch.setattr(worker.os, "getpid", lambda: 1)

    monkeypatch.setattr(worker.socket, "gethostname", lambda: "worker-a")
    first = worker._consumer_name()
    monkeypatch.setattr(worker.socket, "gethostname", lambda: "worker-b")
    second = worker._consumer_name()

    assert first != second, f"both hosts got the same consumer name: {first}"


def test_consumer_name_is_a_valid_redis_consumer_token():
    """Redis takes any binary-safe string, but whitespace and newlines turn the
    name into an operational headache in XINFO/XPENDING output."""
    assert re.fullmatch(r"ai-worker-[\w.\-]+", worker.CONSUMER_NAME), worker.CONSUMER_NAME
