import asyncio
import binascii
import hashlib
import json
import logging
import os
import pathlib
from typing import Any

import asyncpg
import redis.asyncio as aioredis

from ai_service.crypto import open_, seal
from ai_service.transcription.whisper import transcribe_audio
from ai_service.anonymization.ner import anonymize
from ai_service.drafts.claude import generate_clinical_draft
from ai_service.suggestions.claude import (
    generate_recap,
    generate_treatment_plan,
    generate_risk_assessment,
)
from ai_service.suggestions.history import render_history

logger = logging.getLogger(__name__)

STREAM_NAME = "ai_jobs"
CONSUMER_GROUP = "ai-service"
CONSUMER_NAME = "ai-worker-1"
# Must stay under 5s: redis-py 8.x enforces an internal 5s read timeout
# even with socket_timeout=None, so BLOCK >= 5000 raises TimeoutError
BLOCK_MS = 4_000
BATCH_SIZE = 5

# Orphaned-job recovery: entries stuck in the PEL (consumer crashed mid-job or
# a failure path skipped the ack) are reclaimed after this idle time; after
# MAX_DELIVERIES attempts the job is dead-lettered (draft ERROR / suggestion
# FAILED, visible in the UI) and acked.
RECLAIM_IDLE_MS = 300_000
MAX_DELIVERIES = 3

# History budget for treatment_plan / risk_detection: newest sessions win.
HISTORY_MAX_RECORDS = 20
HISTORY_MAX_CHARS = 30_000


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
        try:
            await self._sweep_stuck()
        except Exception as exc:
            logger.exception("startup sweep failed", exc_info=exc)
        while True:
            try:
                await self._reclaim_stale()
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
        kind = fields.get("kind")
        if kind in ("recap", "treatment_plan", "risk_detection"):
            await self._handle_suggestion(message_id, kind, fields)
            return
        await self._handle_draft(message_id, fields)

    async def _handle_draft(self, message_id: str, fields: dict[str, Any]) -> None:
        draft_id = fields.get("draft_id")
        audio_path = fields.get("audio_path")
        record_type = fields.get("record_type") or "EVOLUTION"
        note_style = fields.get("note_style") or "structured"
        tone = fields.get("tone") or "formal"
        template_id = fields.get("template_id")  # optional — custom record template
        # Integrated-format section schema shipped by core-api (JSON array of
        # {key,type,hint}) — the single source of truth for what to generate.
        sections_schema = fields.get("sections_schema")
        approach = fields.get("approach") or ""  # professional's therapeutic approach

        if not draft_id or not audio_path:
            logger.warning("ai_job missing fields", extra={"message_id": message_id, "fields": list(fields.keys())})
            await self._ack(message_id)
            return

        logger.info("processing ai draft", extra={"draft_id": draft_id, "template_id": template_id})
        try:
            await self._set_status(draft_id, "PROCESSING")
            await self._process_draft(draft_id, audio_path, record_type, note_style, tone, template_id, sections_schema, approach)
            await self._ack(message_id)
        except Exception as exc:
            logger.error("draft processing failed", extra={"draft_id": draft_id, "err": str(exc)})
            await self._set_error(draft_id, str(exc))
            # Do NOT ack — message stays in PEL for retry or manual inspection

    async def _handle_suggestion(self, message_id: str, kind: str, fields: dict[str, Any]) -> None:
        suggestion_id = fields.get("suggestion_id")
        patient_id = fields.get("patient_id")
        org_id = fields.get("org_id")
        approach = fields.get("approach") or ""  # never set for risk_detection

        if not suggestion_id or not patient_id or not org_id:
            logger.warning("ai_suggestion job missing fields", extra={"message_id": message_id, "fields": list(fields.keys())})
            await self._ack(message_id)
            return

        logger.info("processing ai suggestion", extra={"suggestion_id": suggestion_id, "kind": kind})
        try:
            await self._set_suggestion_status(suggestion_id, "PROCESSING")
            await self._process_suggestion(suggestion_id, org_id, patient_id, kind, approach)
            await self._ack(message_id)
        except Exception as exc:
            logger.error("suggestion processing failed", extra={"suggestion_id": suggestion_id, "err": str(exc)})
            await self._set_suggestion_error(suggestion_id, str(exc))
            # Do NOT ack — message stays in PEL for retry or manual inspection

    async def _load_template_sections(self, template_id: str) -> list[dict[str, Any]] | None:
        """Load the JSONB schema for a custom record template. Returns None if not found."""
        if not template_id:
            return None
        assert self._db is not None
        row = await self._db.fetchrow(
            "SELECT schema FROM clinical_record_templates WHERE id = $1 AND status = 'ACTIVE'",
            template_id,
        )
        if row is None:
            logger.warning("custom template not found or archived", extra={"template_id": template_id})
            return None
        try:
            return json.loads(row["schema"])
        except (json.JSONDecodeError, TypeError):
            logger.warning("invalid template schema JSON", extra={"template_id": template_id})
            return None

    async def _process_draft(
        self,
        draft_id: str,
        audio_path: str,
        record_type: str,
        note_style: str = "structured",
        tone: str = "formal",
        template_id: str | None = None,
        sections_schema: str | None = None,
        approach: str = "",
    ) -> None:
        # 1. Resolve the draft's DEK and patient up front — fail fast before
        #    spending Whisper/Claude work on a draft that no longer exists.
        assert self._db is not None
        row = await self._db.fetchrow(
            """
            SELECT d.patient_id, d.dek_id, d.organization_id, d.requested_by,
                   k.encrypted_dek, k.key_source
            FROM ai_drafts d
            JOIN encryption_keys k ON k.id = d.dek_id
            WHERE d.id = $1
            """,
            draft_id,
        )
        if row is None:
            raise RuntimeError(f"ai_draft {draft_id} not found")

        # 2. Transcribe locally — audio never leaves the server
        transcription = await asyncio.to_thread(transcribe_audio, audio_path)

        # 3. Anonymize — the patient's real name parts (decrypted here) are
        #    replaced literally, then NER/regex strip everything else
        known_names = await self._patient_known_names(row["patient_id"])
        anonymized = anonymize(transcription, known_names)

        # 4. Resolve the section schema that drives the AI prompt: a custom
        #    template (from DB) or the integrated-format schema shipped in the
        #    job by core-api. Only legacy jobs carry neither and fall back to
        #    the hardcoded schemas in drafts/claude.py.
        template_sections = await self._load_template_sections(template_id) if template_id else None
        if template_sections is None and sections_schema:
            try:
                parsed_schema = json.loads(sections_schema)
                if isinstance(parsed_schema, list) and parsed_schema:
                    template_sections = parsed_schema
            except json.JSONDecodeError:
                logger.warning("invalid sections_schema in job; using hardcoded fallback", extra={"draft_id": draft_id})

        # 5. Generate the clinical-record sections via Claude API with anonymized text only
        clinical_draft = await generate_clinical_draft(
            anonymized, record_type, note_style, tone, template_sections, approach
        )
        clinical_draft = await self._validate_suggested_icd10(clinical_draft)

        # 6. Encrypt both outputs with the draft's DEK before storing
        dek = self._decrypt_dek(row["key_source"], bytes(row["encrypted_dek"]))
        transcription_enc = seal(dek, transcription.encode())
        draft_content_enc = seal(dek, clinical_draft.encode())

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

        # Notify the professional who requested the draft that it's ready to
        # review (the topbar bell). The notifications table is not encrypted, so
        # the copy stays generic — the clinical detail loads under RLS via the
        # link. Wrapped so a notification failure never fails the draft job.
        try:
            await self._notify_draft_ready(
                str(row["organization_id"]),
                str(row["requested_by"]),
                draft_id,
            )
        except Exception as exc:  # noqa: BLE001 — best-effort, never break the job
            logger.warning("draft-ready notification failed", extra={"draft_id": draft_id, "err": str(exc)})

        # Delete audio file — it has been transcribed and the text is now
        # stored encrypted. Keeping the raw audio indefinitely is both a
        # privacy risk (PHI) and a disk space problem.
        try:
            pathlib.Path(audio_path).unlink(missing_ok=True)
            logger.info("audio deleted after transcription", extra={"audio_path": audio_path})
        except OSError as exc:
            logger.warning("could not delete audio file", extra={"audio_path": audio_path, "err": str(exc)})

    async def _notify_draft_ready(self, org_id: str, recipient_user_id: str, draft_id: str) -> None:
        """Insert an in-app notification (topbar bell) telling the requesting
        professional their AI draft is ready to review. Runs in a transaction
        that pins the org's RLS scope, so the INSERT satisfies the
        notifications tenant_isolation policy regardless of the DB role."""
        assert self._db is not None
        async with self._db.acquire() as conn:
            async with conn.transaction():
                # `true` = local: the GUC is scoped to this transaction only.
                await conn.execute(
                    "SELECT set_config('app.current_org', $1, true)", org_id
                )
                await conn.execute(
                    """
                    INSERT INTO notifications
                        (organization_id, recipient_user_id, kind, title, body, link)
                    VALUES ($1, $2, 'AI_DRAFT_READY',
                            'Borrador de IA listo',
                            'El sistema generó un borrador clínico. Revísalo y apruébalo.',
                            $3)
                    """,
                    org_id,
                    recipient_user_id,
                    f"/ai-drafts/{draft_id}",
                )

    async def _process_suggestion(self, suggestion_id: str, org_id: str, patient_id: str, kind: str, approach: str = "") -> None:
        assert self._db is not None

        # 1. Resolve the suggestion's own DEK (used to seal the result).
        sug = await self._db.fetchrow(
            """
            SELECT k.encrypted_dek, k.key_source
            FROM ai_suggestions s
            JOIN encryption_keys k ON k.id = s.dek_id
            WHERE s.id = $1
            """,
            suggestion_id,
        )
        if sug is None:
            raise RuntimeError(f"ai_suggestion {suggestion_id} not found")
        out_dek = self._decrypt_dek(sug["key_source"], bytes(sug["encrypted_dek"]))

        # 2. Read and decrypt the patient's approved clinical records (oldest → newest).
        #    The worker connects as the admin role (bypasses RLS), so it filters by
        #    org + patient explicitly.
        rec_rows = await self._db.fetch(
            """
            SELECT r.record_type, r.session_date, r.sections_enc,
                   k.encrypted_dek, k.key_source
            FROM clinical_records r
            JOIN encryption_keys k ON k.id = r.dek_id
            WHERE r.organization_id = $1 AND r.patient_id = $2 AND r.status = 'APPROVED'
            ORDER BY r.session_date ASC, r.created_at ASC
            """,
            org_id, patient_id,
        )
        records: list[dict[str, Any]] = []
        for row in rec_rows:
            sections: dict[str, Any] = {}
            if row["sections_enc"] is not None:
                rec_dek = self._decrypt_dek(row["key_source"], bytes(row["encrypted_dek"]))
                try:
                    sections = json.loads(open_(rec_dek, bytes(row["sections_enc"])).decode())
                except (ValueError, json.JSONDecodeError) as exc:
                    logger.warning("skipping unreadable record sections", extra={"err": str(exc)})
                    sections = {}
            records.append({
                "record_type": row["record_type"],
                "session_date": row["session_date"],
                "sections": sections,
            })

        # 3. Diagnoses (ICD-10 codes are catalog references, not PII).
        diag_rows = await self._db.fetch(
            """
            SELECT d.icd10_code AS code, c.description, d.status::text AS status
            FROM patient_diagnoses d
            JOIN icd10_codes c ON c.code = d.icd10_code
            WHERE d.organization_id = $1 AND d.patient_id = $2
            ORDER BY d.diagnosed_at ASC
            """,
            org_id, patient_id,
        )
        diagnoses = [dict(r) for r in diag_rows]

        # 4. Assemble → anonymize (strip any residual PII) → Claude.
        # For the pre-session recap, only the most recent 5 sessions are relevant;
        # risk/plan get the full history under a budget (newest sessions win).
        if kind == "recap":
            history = render_history(records[-5:], diagnoses)
        else:
            history = render_history(
                records, diagnoses,
                max_records=HISTORY_MAX_RECORDS, max_chars=HISTORY_MAX_CHARS,
            )
        source_hash = hashlib.sha256(history.encode()).hexdigest()
        known_names = await self._patient_known_names(patient_id)
        anonymized = anonymize(history, known_names)

        if kind == "recap":
            content = await generate_recap(anonymized, approach)
        elif kind == "risk_detection":
            # Deliberately approach-agnostic: risk reading must stay conservative
            # and never bend to a theoretical framework.
            content = await generate_risk_assessment(anonymized)
        else:
            content = await generate_treatment_plan(anonymized, approach)

        # 5. Seal the result with the suggestion's DEK and mark it READY.
        content_enc = seal(out_dek, content.encode())
        await self._db.execute(
            """
            UPDATE ai_suggestions
            SET content_enc = $2, source_hash = $3, status = 'READY', updated_at = NOW()
            WHERE id = $1
            """,
            suggestion_id, content_enc, source_hash,
        )

    async def _patient_known_names(self, patient_id: str) -> list[str]:
        """Decrypt the patient's name parts for literal anonymization.

        Best-effort: a missing patient or an undecryptable field must not block
        the pipeline (NER still runs), so failures return what we have.
        """
        assert self._db is not None
        row = await self._db.fetchrow(
            """
            SELECT p.first_name_enc, p.middle_name_enc,
                   p.paternal_last_name_enc, p.maternal_last_name_enc,
                   k.encrypted_dek, k.key_source
            FROM patients p
            JOIN encryption_keys k ON k.id = p.dek_id
            WHERE p.id = $1
            """,
            patient_id,
        )
        if row is None:
            return []
        try:
            dek = self._decrypt_dek(row["key_source"], bytes(row["encrypted_dek"]))
        except ValueError as exc:
            logger.warning("cannot decrypt patient DEK for anonymization", extra={"err": str(exc)})
            return []
        names: list[str] = []
        for col in ("first_name_enc", "middle_name_enc", "paternal_last_name_enc", "maternal_last_name_enc"):
            if row[col] is None:
                continue
            try:
                names.append(open_(dek, bytes(row[col])).decode())
            except ValueError as exc:
                logger.warning("cannot decrypt patient name field", extra={"field": col, "err": str(exc)})
        return [n for n in (name.strip() for name in names) if n]

    async def _validate_suggested_icd10(self, clinical_draft: str) -> str:
        """Null out suggested_icd10 when the code is not in the ICD-10 catalog
        (the model can hallucinate plausible-looking codes)."""
        assert self._db is not None
        try:
            draft = json.loads(clinical_draft)
        except json.JSONDecodeError:
            return clinical_draft
        suggested = draft.get("suggested_icd10")
        if not isinstance(suggested, dict) or not suggested.get("code"):
            return clinical_draft
        code = str(suggested["code"]).strip().upper()
        exists = await self._db.fetchval("SELECT 1 FROM icd10_codes WHERE code = $1", code)
        if exists:
            return clinical_draft
        logger.warning("suggested ICD-10 not in catalog, dropping", extra={"code": code})
        draft["suggested_icd10"] = None
        return json.dumps(draft, ensure_ascii=False)

    async def _reclaim_stale(self) -> None:
        """Recover PEL entries whose consumer died mid-job or whose failure path
        skipped the ack; dead-letter after MAX_DELIVERIES attempts."""
        assert self._redis is not None
        pending = await self._redis.xpending_range(
            STREAM_NAME, CONSUMER_GROUP,
            min="-", max="+", count=BATCH_SIZE, idle=RECLAIM_IDLE_MS,
        )
        for entry in pending:
            message_id = entry["message_id"]
            claimed = await self._redis.xclaim(
                STREAM_NAME, CONSUMER_GROUP, CONSUMER_NAME,
                min_idle_time=RECLAIM_IDLE_MS, message_ids=[message_id],
            )
            if not claimed:
                continue  # another consumer got it first
            mid, fields = claimed[0]
            if fields is None:
                # Entry was trimmed from the stream; nothing left to process.
                await self._ack(mid)
                continue
            if entry["times_delivered"] >= MAX_DELIVERIES:
                await self._dead_letter(mid, fields, entry["times_delivered"])
            else:
                logger.info(
                    "reclaiming stale job",
                    extra={"message_id": mid, "deliveries": entry["times_delivered"]},
                )
                await self._handle(mid, fields)

    async def _dead_letter(self, message_id: str, fields: dict[str, Any], deliveries: int) -> None:
        """Mark the job's row as failed (visible in the UI) and ack the entry
        so it stops cycling through the PEL."""
        reason = f"processing failed after {deliveries} attempts"
        kind = fields.get("kind")
        if kind in ("recap", "treatment_plan", "risk_detection"):
            suggestion_id = fields.get("suggestion_id")
            if suggestion_id:
                await self._set_suggestion_error(suggestion_id, reason)
        else:
            draft_id = fields.get("draft_id")
            if draft_id:
                await self._set_error(draft_id, reason)
        logger.error(
            "job dead-lettered",
            extra={"message_id": message_id, "kind": kind or "draft", "deliveries": deliveries},
        )
        await self._ack(message_id)

    async def _sweep_stuck(self) -> None:
        """Startup sweep: rows left in PROCESSING with no live job (e.g. the
        stream entry was acked or trimmed before the crash) become recoverable
        errors instead of spinning forever in the UI."""
        assert self._db is not None
        res_d = await self._db.execute(
            """
            UPDATE ai_drafts
            SET status = 'ERROR', error_message = 'processing interrupted (worker restart)'
            WHERE status = 'PROCESSING' AND created_at < NOW() - INTERVAL '30 minutes'
            """
        )
        res_s = await self._db.execute(
            """
            UPDATE ai_suggestions
            SET status = 'FAILED', error = 'processing interrupted (worker restart)', updated_at = NOW()
            WHERE status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '30 minutes'
            """
        )
        logger.info("startup sweep done", extra={"drafts": res_d, "suggestions": res_s})

    async def _set_suggestion_status(self, suggestion_id: str, status: str) -> None:
        assert self._db is not None
        await self._db.execute(
            "UPDATE ai_suggestions SET status = $2, updated_at = NOW() WHERE id = $1",
            suggestion_id, status,
        )

    async def _set_suggestion_error(self, suggestion_id: str, message: str) -> None:
        assert self._db is not None
        await self._db.execute(
            "UPDATE ai_suggestions SET status = 'FAILED', error = $2, updated_at = NOW() WHERE id = $1",
            suggestion_id, message,
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
