"""A Redis Streams double, enough of one to drive the worker's two lanes.

The queue tests need to observe delivery, not storage: how many entries a lane
has taken and not yet acked is the whole subject, and that is invisible from
outside a real Redis unless the test also runs one. fakeredis would work and was
what the plan assumed, but it is a dependency every dev and the CI image would
have to install to run the suite, and it would not give the deterministic
control over interleaving that these tests are made of.

Only the calls worker.py makes are implemented, and they are implemented
strictly: an unsupported argument raises rather than being quietly ignored.
"""
import asyncio
from collections import defaultdict
from typing import Any


class FakeStreams:
    def __init__(self) -> None:
        # stream -> [(id, fields)]
        self.entries: dict[str, list[tuple[str, dict[str, Any]]]] = defaultdict(list)
        # (stream, group) -> next index into entries[stream] to hand out
        self._cursor: dict[tuple[str, str], int] = {}
        # (stream, group) -> {id: {"consumer":, "delivered":, "idle_ms":}}
        self.pel: dict[tuple[str, str], dict[str, dict[str, Any]]] = defaultdict(dict)
        self.acked: dict[tuple[str, str], list[str]] = defaultdict(list)
        self.closed = False
        self._seq = 0

    # ── production side ─────────────────────────────────────────────────────
    def xadd_sync(self, stream: str, fields: dict[str, Any]) -> str:
        self._seq += 1
        message_id = f"{self._seq}-0"
        self.entries[stream].append((message_id, fields))
        return message_id

    def unacked(self, stream: str, group: str) -> list[str]:
        return list(self.pel[(stream, group)])

    # ── the calls worker.py makes ───────────────────────────────────────────
    async def xgroup_create(
        self, stream: str, group: str, id: str = "0", mkstream: bool = False  # noqa: A002
    ) -> None:
        key = (stream, group)
        if key in self._cursor:
            raise RuntimeError("BUSYGROUP consumer group already exists")
        # id="0" means "from the start of the stream"; nothing else is used.
        assert id == "0", id
        self._cursor[key] = 0

    async def xreadgroup(
        self,
        groupname: str,
        consumername: str,
        streams: dict[str, str],
        count: int,
        block: int,
    ) -> list[tuple[str, list[tuple[str, dict[str, Any]]]]]:
        assert count > 0, "a lane must never ask for more than it can run"
        (stream, cursor), = streams.items()
        assert cursor == ">", cursor
        key = (stream, groupname)
        start = self._cursor[key]
        batch = self.entries[stream][start : start + count]
        if not batch:
            # Stand in for BLOCK without spending the wall clock on it.
            await asyncio.sleep(0.001)
            return []
        self._cursor[key] = start + len(batch)
        for message_id, _fields in batch:
            self.pel[key][message_id] = {
                "consumer": consumername,
                "delivered": 1,
                "idle_ms": 0,
            }
        return [(stream, batch)]

    async def xack(self, stream: str, group: str, message_id: str) -> None:
        self.pel[(stream, group)].pop(message_id, None)
        self.acked[(stream, group)].append(message_id)

    async def xpending_range(
        self, stream: str, group: str, min: str, max: str, count: int, idle: int  # noqa: A002
    ) -> list[dict[str, Any]]:
        out = []
        for message_id, meta in self.pel[(stream, group)].items():
            if meta["idle_ms"] >= idle:
                out.append(
                    {"message_id": message_id, "times_delivered": meta["delivered"]}
                )
            if len(out) >= count:
                break
        return out

    async def xclaim(
        self,
        stream: str,
        group: str,
        consumer: str,
        min_idle_time: int,
        message_ids: list[str],
    ) -> list[tuple[str, dict[str, Any] | None]]:
        key = (stream, group)
        claimed = []
        for message_id in message_ids:
            meta = self.pel[key].get(message_id)
            if meta is None or meta["idle_ms"] < min_idle_time:
                continue
            meta["consumer"] = consumer
            meta["delivered"] += 1
            meta["idle_ms"] = 0
            fields = next(
                (f for mid, f in self.entries[stream] if mid == message_id), None
            )
            claimed.append((message_id, fields))
        return claimed

    async def aclose(self) -> None:
        self.closed = True
