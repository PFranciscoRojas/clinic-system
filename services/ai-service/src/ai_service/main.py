import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from ai_service.config import settings
from ai_service.worker import AIWorker

# Standard LogRecord attributes — anything beyond these came in via `extra=`.
_STD_LOGRECORD_KEYS = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime", "taskName"}


class ExtraFormatter(logging.Formatter):
    """Append `extra={...}` fields as key=value pairs.

    The default formatter silently drops them, which left prod logs without
    the chars/timings/ids every log call in this service actually carries.
    """

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = {k: v for k, v in record.__dict__.items() if k not in _STD_LOGRECORD_KEYS}
        if extras:
            base += " | " + " ".join(f"{k}={v}" for k, v in sorted(extras.items()))
        return base


logging.basicConfig(level=settings.log_level.upper())
for _handler in logging.getLogger().handlers:
    _handler.setFormatter(ExtraFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    worker = AIWorker(
        redis_url=settings.redis_url,
        database_url=settings.database_url,
        master_key_hex=settings.master_key,
    )
    await worker.start()
    logger.info("ai-service started")
    yield
    await worker.stop()
    logger.info("ai-service stopped")


app = FastAPI(
    title="Chapni AI Service",
    version="0.1.0",
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})
