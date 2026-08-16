"""The two lanes, and what they are supposed to buy.

Fase 5 of docs/ai/PLAN_LATENCIA_AUDIO.md. What the split buys is not throughput
— §6 of that plan is explicit that a second transcription on two cores makes
both take twice as long — it is fairness: a three-second recap must not wait for
an hour of audio to finish transcribing.

These are the end-to-end queue-semantics tests that PR #260 deferred to this
phase, and they are why AIWorker now takes a redis client instead of building
one from a URL inside start().
"""
import asyncio

import pytest
from fake_streams import FakeStreams

from ai_service import worker as worker_mod
from ai_service.worker import AIWorker

DRAFT_STREAM = worker_mod.STREAM_NAME
DRAFT_GROUP = worker_mod.CONSUMER_GROUP
FAST_STREAM = worker_mod.FAST_STREAM_NAME
FAST_GROUP = worker_mod.FAST_CONSUMER_GROUP


def make_worker(redis: FakeStreams) -> AIWorker:
    return AIWorker("redis://unused", "postgres://unused", "00" * 32, redis_client=redis)


async def open_groups(w: AIWorker, redis: FakeStreams) -> None:
    for lane in w._lanes:
        await redis.xgroup_create(lane.stream, lane.group, id="0", mkstream=True)


def lane_named(w: AIWorker, name: str) -> worker_mod._Lane:
    return next(lane for lane in w._lanes if lane.name == name)


async def run_readers(w: AIWorker, until: asyncio.Event, timeout: float = 2.0) -> None:
    """Run both lane readers until the test says it has seen enough."""
    readers = [asyncio.create_task(w._read_lane(lane)) for lane in w._lanes]
    try:
        await asyncio.wait_for(until.wait(), timeout=timeout)
    finally:
        for task in readers:
            task.cancel()
        await asyncio.gather(*readers, return_exceptions=True)
        for lane in w._lanes:
            for task in list(lane.tasks):
                task.cancel()
            if lane.tasks:
                await asyncio.gather(*lane.tasks, return_exceptions=True)


async def test_a_recap_does_not_wait_for_an_hour_of_audio():
    """The whole point of the phase.

    On one stream the consumer group hands out whatever entry is next, so a
    recap requested mid-session sat behind the previous session's transcription.
    """
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    transcribing = asyncio.Event()
    release_draft = asyncio.Event()
    recap_done = asyncio.Event()
    order: list[str] = []

    async def handle(lane, message_id, fields):
        if fields["kind"] == "recap":
            order.append("recap")
            recap_done.set()
        else:
            order.append("draft-start")
            transcribing.set()
            await release_draft.wait()
            order.append("draft-end")
        await w._ack(lane, message_id)

    w._handle = handle  # type: ignore[method-assign]

    redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": "d1"})
    redis.xadd_sync(FAST_STREAM, {"kind": "recap", "suggestion_id": "s1"})

    readers = [asyncio.create_task(w._read_lane(lane)) for lane in w._lanes]
    try:
        await asyncio.wait_for(transcribing.wait(), timeout=2)
        await asyncio.wait_for(recap_done.wait(), timeout=2)
    finally:
        release_draft.set()
        for task in readers:
            task.cancel()
        await asyncio.gather(*readers, return_exceptions=True)

    assert order[:2] == ["draft-start", "recap"], order


async def test_the_transcription_lane_runs_one_job_at_a_time():
    """Two transcriptions on two cores take twice as long each and peak at two
    ~530 MB decodes against 1.37 GB free. The lane is one slot on purpose."""
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    running = 0
    peak = 0
    finished = asyncio.Event()
    done = 0

    async def handle(lane, message_id, fields):
        nonlocal running, peak, done
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        await w._ack(lane, message_id)
        done += 1
        if done == 3:
            finished.set()

    w._handle = handle  # type: ignore[method-assign]
    for i in range(3):
        redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": f"d{i}"})

    await run_readers(w, finished)

    assert peak == worker_mod.TRANSCRIPTION_SLOTS == 1, peak
    assert done == 3


async def test_a_lane_never_takes_more_entries_than_it_can_run():
    """Backpressure is not politeness here.

    A job read and then parked waiting for a slot keeps its PEL entry's idle
    clock running, and that clock is the only thing deciding whether the job is
    reclaimed and processed a second time. Reading three drafts to run one means
    the third one's clock has been running for two whole transcriptions before
    it starts.
    """
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    peak_unacked = 0
    finished = asyncio.Event()
    done = 0

    async def handle(lane, message_id, fields):
        nonlocal peak_unacked, done
        peak_unacked = max(peak_unacked, len(redis.unacked(lane.stream, lane.group)))
        await asyncio.sleep(0.005)
        await w._ack(lane, message_id)
        done += 1
        if done == 4:
            finished.set()

    w._handle = handle  # type: ignore[method-assign]
    for i in range(4):
        redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": f"d{i}"})

    await run_readers(w, finished)

    assert peak_unacked <= worker_mod.TRANSCRIPTION_SLOTS, peak_unacked


async def test_the_suggestion_lane_runs_several_at_once():
    """Recap, plan and risk wait on the Claude API. Serialising them would make
    the split pointless in the direction it is supposed to help."""
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    running = 0
    peak = 0
    finished = asyncio.Event()
    done = 0
    total = worker_mod.SUGGESTION_SLOTS + 1

    async def handle(lane, message_id, fields):
        nonlocal running, peak, done
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        await w._ack(lane, message_id)
        done += 1
        if done == total:
            finished.set()

    w._handle = handle  # type: ignore[method-assign]
    for i in range(total):
        redis.xadd_sync(FAST_STREAM, {"kind": "recap", "suggestion_id": f"s{i}"})

    await run_readers(w, finished)

    assert peak == worker_mod.SUGGESTION_SLOTS, peak
    assert done == total


async def test_each_lane_acks_on_its_own_stream():
    """Two streams and two groups mean an ack sent to the wrong pair leaves the
    entry in the PEL forever and reclaims it as a stale job later."""
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    finished = asyncio.Event()
    done = 0

    async def handle(lane, message_id, fields):
        nonlocal done
        await w._ack(lane, message_id)
        done += 1
        if done == 2:
            finished.set()

    w._handle = handle  # type: ignore[method-assign]
    redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": "d1"})
    redis.xadd_sync(FAST_STREAM, {"kind": "recap", "suggestion_id": "s1"})

    await run_readers(w, finished)

    assert redis.unacked(DRAFT_STREAM, DRAFT_GROUP) == []
    assert redis.unacked(FAST_STREAM, FAST_GROUP) == []
    assert len(redis.acked[(DRAFT_STREAM, DRAFT_GROUP)]) == 1
    assert len(redis.acked[(FAST_STREAM, FAST_GROUP)]) == 1


async def test_a_suggestion_left_on_the_old_stream_still_runs():
    """During the rollout the previous core-api is still enqueueing recaps on
    ai_jobs, and whatever it enqueued before the deploy is sitting there. Those
    entries have to be processed and acked on the stream they arrived on."""
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    seen: list[tuple[str, str]] = []
    finished = asyncio.Event()

    async def handle_suggestion(lane, message_id, kind, fields):
        seen.append((lane.name, kind))
        await w._ack(lane, message_id)
        finished.set()

    w._handle_suggestion = handle_suggestion  # type: ignore[method-assign]
    redis.xadd_sync(DRAFT_STREAM, {"kind": "recap", "suggestion_id": "s-old"})

    await run_readers(w, finished)

    assert seen == [("transcription", "recap")]
    assert redis.acked[(DRAFT_STREAM, DRAFT_GROUP)] == ["1-0"]
    assert redis.acked[(FAST_STREAM, FAST_GROUP)] == []


async def test_a_job_this_process_is_running_is_not_reclaimed():
    """RECLAIM_IDLE_MS counts from delivery, not from the last sign of life.

    While _handle was awaited inline in the read loop, _reclaim_stale could not
    run next to a live job at all. Now it can, and a reclaimed live job is two
    transcriptions, two drafts and two Claude bills for one session.
    """
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)
    lane = lane_named(w, "transcription")

    message_id = redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": "d1"})
    redis.pel[(DRAFT_STREAM, DRAFT_GROUP)][message_id] = {
        "consumer": worker_mod.CONSUMER_NAME,
        "delivered": 1,
        "idle_ms": worker_mod.RECLAIM_IDLE_MS + 1,
    }
    lane.in_flight.add(message_id)

    handled: list[str] = []

    async def handle(lane_, mid, fields):
        handled.append(mid)

    w._handle = handle  # type: ignore[method-assign]

    await w._reclaim_stale(lane)

    assert handled == []
    assert redis.pel[(DRAFT_STREAM, DRAFT_GROUP)][message_id]["delivered"] == 1


async def test_a_genuinely_stale_job_is_still_reclaimed():
    """The guard above must not turn the reclaim path off. A crash mid-job
    leaves an entry nobody is working on, and that is what it is for."""
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)
    lane = lane_named(w, "transcription")

    message_id = redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": "d1"})
    redis.pel[(DRAFT_STREAM, DRAFT_GROUP)][message_id] = {
        "consumer": "ai-worker-that-died",
        "delivered": 1,
        "idle_ms": worker_mod.RECLAIM_IDLE_MS + 1,
    }

    handled = asyncio.Event()
    seen: list[str] = []

    async def handle(lane_, mid, fields):
        seen.append(mid)
        await w._ack(lane_, mid)
        handled.set()

    w._handle = handle  # type: ignore[method-assign]

    await w._reclaim_stale(lane)
    await asyncio.wait_for(handled.wait(), timeout=2)
    for task in list(lane.tasks):
        await task

    assert seen == [message_id]


async def test_a_stuck_lane_does_not_stall_the_other():
    """One lane wedged on a job must not stop the other from reading. This is
    the same guarantee as the first test, stated where it fails loudest: an
    ai-service whose transcription hangs still has to answer recaps."""
    redis = FakeStreams()
    w = make_worker(redis)
    await open_groups(w, redis)

    hang = asyncio.Event()
    recaps = 0
    finished = asyncio.Event()

    async def handle(lane, message_id, fields):
        nonlocal recaps
        if fields["kind"] == "recap":
            recaps += 1
            await w._ack(lane, message_id)
            if recaps == 3:
                finished.set()
        else:
            await hang.wait()

    w._handle = handle  # type: ignore[method-assign]
    redis.xadd_sync(DRAFT_STREAM, {"kind": "draft", "draft_id": "d1"})
    for i in range(3):
        redis.xadd_sync(FAST_STREAM, {"kind": "recap", "suggestion_id": f"s{i}"})

    try:
        await run_readers(w, finished)
    finally:
        hang.set()

    assert recaps == 3
    assert redis.unacked(DRAFT_STREAM, DRAFT_GROUP) == ["1-0"]


def test_the_two_lanes_do_not_share_a_stream_or_a_group():
    """Sharing either would put the jobs back in one queue, which is the thing
    being undone."""
    assert worker_mod.STREAM_NAME != worker_mod.FAST_STREAM_NAME
    assert worker_mod.CONSUMER_GROUP != worker_mod.FAST_CONSUMER_GROUP


@pytest.mark.parametrize("kind", sorted(worker_mod.SUGGESTION_KINDS))
async def test_every_suggestion_kind_is_handled_as_a_suggestion(kind):
    """The kinds are listed here and again in core-api's validKinds. One added
    on one side only ends up in the draft path, where it has no draft_id and is
    acked away as a malformed job."""
    redis = FakeStreams()
    w = make_worker(redis)
    lane = lane_named(w, "suggestion")

    routed: list[str] = []

    async def handle_suggestion(lane_, message_id, kind_, fields):
        routed.append(kind_)

    async def handle_draft(lane_, message_id, fields):
        routed.append("draft")

    w._handle_suggestion = handle_suggestion  # type: ignore[method-assign]
    w._handle_draft = handle_draft  # type: ignore[method-assign]

    await w._handle(lane, "1-0", {"kind": kind, "suggestion_id": "s1"})

    assert routed == [kind]
