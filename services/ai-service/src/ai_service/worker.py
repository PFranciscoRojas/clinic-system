import asyncio
import json
import logging
from typing import Any

import asyncpg
import redis.asyncio as aioredis

from ai_service.transcription.whisper import transcribe_audio
from ai_service.anonymization.ner import anonymize
from ai_service.drafts.claude import generate_soap_draft

logger = logging.getLogger(__name__)

STREAM_NAME = "domain-events"
CONSUMER_GROUP = "ai-service"
CONSUMER_NAME = "ai-worker-1"
BLOCK_MS = 5_000  # wait up to 5s for new messages before polling again
BATCH_SIZE = 5    # process up to 5 audio jobs concurrently


class OutboxWorker:
    """Consumes AI job requests from Redis Streams and processes audio files."""

    def __init__(self, redis_url: str, database_url: str) -> None:
        self._redis_url = redis_url
        self._database_url = database_url
        self._redis: aioredis.Redis | None = None
        self._db: asyncpg.Pool | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        self._db = await asyncpg.create_pool(self._database_url, min_size=1, max_size=5)

        # Create consumer group if it doesn't exist (idempotent)
        try:
            await self._redis.xgroup_create(STREAM_NAME, CONSUMER_GROUP, id="0", mkstream=True)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.aclose()
        if self._db:
            await self._db.close()

    async def _run(self) -> None:
        logger.info("ai worker started", extra={"stream": STREAM_NAME, "group": CONSUMER_GROUP})
        while True:
            try:
                messages = await self._redis.xreadgroup(  # type: ignore[union-attr]
                    groupname=CONSUMER_GROUP,
                    consumername=CONSUMER_NAME,
                    streams={STREAM_NAME: ">"},
                    count=BATCH_SIZE,
                    block=BLOCK_MS,
                )
                if not messages:
                    continue
                for _stream, entries in messages:
                    for message_id, fields in entries:
                        await self._handle(message_id, fields)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.exception("worker error", exc_info=exc)
                await asyncio.sleep(5)

    async def _handle(self, message_id: str, fields: dict[str, Any]) -> None:
        event_type = fields.get("event_type", "")

        # Only process AI job requests — other domain events are for analytics consumers
        if event_type != "AIDraftRequested":
            await self._ack(message_id)
            return

        payload: dict[str, Any] = json.loads(fields.get("payload", "{}"))
        draft_id = payload.get("draft_id")
        audio_path = payload.get("audio_path")

        if not draft_id or not audio_path:
            logger.warning("AIDraftRequested missing required fields", extra={"message_id": message_id})
            await self._ack(message_id)
            return

        logger.info("processing ai draft", extra={"draft_id": draft_id})
        try:
            await self._process_draft(draft_id, audio_path)
            await self._ack(message_id)
        except Exception as exc:
            logger.error("draft processing failed", extra={"draft_id": draft_id, "err": str(exc)})
            # Do NOT ack — message stays in PEL for retry or manual inspection

    async def _process_draft(self, draft_id: str, audio_path: str) -> None:
        # 1. Transcribe audio locally with Whisper (audio never leaves the server)
        transcription = await asyncio.to_thread(transcribe_audio, audio_path)

        # 2. Anonymize: remove names, document numbers, phone numbers with spaCy NER
        anonymized = anonymize(transcription)

        # 3. Send anonymized text to Claude API for SOAP extraction
        soap_draft = await generate_soap_draft(anonymized)

        # 4. Write results back to DB (core-api will read them via polling)
        assert self._db is not None
        await self._db.execute(
            """
            UPDATE ai_drafts
            SET
                transcription_enc = $2,
                draft_content_enc = $3,
                status = 'DRAFT_READY',
                processed_at = NOW()
            WHERE id = $1
            """,
            draft_id,
            transcription.encode(),    # core-api will AEA-encrypt before storing; placeholder
            soap_draft.encode(),
        )

    async def _ack(self, message_id: str) -> None:
        await self._redis.xack(STREAM_NAME, CONSUMER_GROUP, message_id)  # type: ignore[union-attr]
