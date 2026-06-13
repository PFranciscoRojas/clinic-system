import asyncio
import binascii
import logging
import os
from typing import Any

import asyncpg
import redis.asyncio as aioredis

from ai_service.crypto import open_, seal
from ai_service.transcription.whisper import transcribe_audio
from ai_service.anonymization.ner import anonymize
from ai_service.drafts.claude import generate_soap_draft

logger = logging.getLogger(__name__)

STREAM_NAME = "ai_jobs"
CONSUMER_GROUP = "ai-service"
CONSUMER_NAME = "ai-worker-1"
# Must stay under 5s: redis-py 8.x enforces an internal 5s read timeout
# even with socket_timeout=None, so BLOCK >= 5000 raises TimeoutError
BLOCK_MS = 4_000
BATCH_SIZE = 5


class AIWorker:
    """Consumes ai_jobs from Redis Streams and processes audio through the AI pipeline."""

    def __init__(self, redis_url: str, database_url: str, master_key_hex: str) -> None:
        self._redis_url = redis_url
        self._database_url = database_url
        self._master_key = binascii.unhexlify(master_key_hex)
        self._redis: aioredis.Redis | None = None
        self._db: asyncpg.Pool | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        self._db = await asyncpg.create_pool(self._database_url, min_size=1, max_size=5)

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
        draft_id = fields.get("draft_id")
        audio_path = fields.get("audio_path")
        record_type = fields.get("record_type") or "EVOLUTION"

        if not draft_id or not audio_path:
            logger.warning("ai_job missing fields", extra={"message_id": message_id, "fields": list(fields.keys())})
            await self._ack(message_id)
            return

        logger.info("processing ai draft", extra={"draft_id": draft_id})
        try:
            await self._set_status(draft_id, "PROCESSING")
            await self._process_draft(draft_id, audio_path, record_type)
            await self._ack(message_id)
        except Exception as exc:
            logger.error("draft processing failed", extra={"draft_id": draft_id, "err": str(exc)})
            await self._set_error(draft_id, str(exc))
            # Do NOT ack — message stays in PEL for retry or manual inspection

    async def _process_draft(self, draft_id: str, audio_path: str, record_type: str) -> None:
        # 1. Transcribe locally — audio never leaves the server
        transcription = await asyncio.to_thread(transcribe_audio, audio_path)

        # 2. Anonymize — strip names, document numbers, phones before Claude sees anything
        anonymized = anonymize(transcription)

        # 3. Generate the clinical-record sections via Claude API with anonymized text only
        soap_draft = await generate_soap_draft(anonymized, record_type)

        # 4. Encrypt both outputs with the draft's DEK before storing
        assert self._db is not None
        row = await self._db.fetchrow(
            """
            SELECT d.dek_id, k.encrypted_dek, k.key_source
            FROM ai_drafts d
            JOIN encryption_keys k ON k.id = d.dek_id
            WHERE d.id = $1
            """,
            draft_id,
        )
        if row is None:
            raise RuntimeError(f"ai_draft {draft_id} not found")

        dek = self._decrypt_dek(row["key_source"], bytes(row["encrypted_dek"]))
        transcription_enc = seal(dek, transcription.encode())
        draft_content_enc = seal(dek, soap_draft.encode())

        await self._db.execute(
            """
            UPDATE ai_drafts
            SET transcription_enc = $2,
                draft_content_enc = $3,
                status = 'DRAFT_READY',
                processed_at = NOW()
            WHERE id = $1
            """,
            draft_id,
            transcription_enc,
            draft_content_enc,
        )

    def _decrypt_dek(self, key_source: str, encrypted_dek: bytes) -> bytes:
        if key_source.startswith("env:"):
            return open_(self._master_key, encrypted_dek)
        raise ValueError(f"unsupported key_source: {key_source}")

    async def _set_status(self, draft_id: str, status: str) -> None:
        assert self._db is not None
        await self._db.execute(
            "UPDATE ai_drafts SET status = $2 WHERE id = $1",
            draft_id, status,
        )

    async def _set_error(self, draft_id: str, message: str) -> None:
        assert self._db is not None
        await self._db.execute(
            "UPDATE ai_drafts SET status = 'ERROR', error_message = $2 WHERE id = $1",
            draft_id, message,
        )

    async def _ack(self, message_id: str) -> None:
        await self._redis.xack(STREAM_NAME, CONSUMER_GROUP, message_id)  # type: ignore[union-attr]
