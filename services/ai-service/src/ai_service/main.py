import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from ai_service.config import settings
from ai_service.worker import OutboxWorker

logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    worker = OutboxWorker(redis_url=settings.redis_url, database_url=settings.database_url)
    await worker.start()
    logger.info("ai-service started")
    yield
    await worker.stop()
    logger.info("ai-service stopped")


app = FastAPI(
    title="SGHCP AI Service",
    version="0.1.0",
    # Disable docs in production — clinical system, internal use only
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})
