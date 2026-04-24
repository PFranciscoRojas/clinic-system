# ─── build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS build

WORKDIR /app

# System dependencies for Whisper (ffmpeg) and spaCy
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[runtime]" 2>/dev/null || pip install --no-cache-dir -e .

# Download spaCy Spanish model
RUN python -m spacy download es_core_news_lg

# Pre-download Whisper model so it's baked into the image (avoids slow first-run download)
# Model size: tiny=39M, base=74M, small=244M, medium=769M
ARG WHISPER_MODEL=base
RUN python -c "import whisper; whisper.load_model('${WHISPER_MODEL}')"

COPY src/ ./src/

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app /app
COPY --from=build /root/.cache /root/.cache

EXPOSE 8000
CMD ["uvicorn", "ai_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-config", "/dev/null"]
