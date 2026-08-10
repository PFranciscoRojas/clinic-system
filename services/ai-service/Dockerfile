# ─── build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# torch used to be installed here, CPU-only, to keep the default wheel's ~7 GB
# of CUDA libraries off a GPU-less VPS. faster-whisper runs on CTranslate2, so
# the whole dependency is gone rather than merely slimmed.

# Install dependencies from pyproject before copying source so code edits
# don't invalidate the heavy spaCy layer
COPY pyproject.toml .
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# Download spaCy Spanish models — md (~40 MB) is the runtime default (better
# PERSON/ORG/LOC recall than sm); sm stays as the in-code fallback so a
# missing model can never be the reason the worker fails to boot.
RUN python -m spacy download es_core_news_md && python -m spacy download es_core_news_sm

# Pre-download the CTranslate2 weights so they're baked into the image. Without
# this the first job of a fresh container downloads them mid-transcription,
# adding minutes to one unlucky professional's draft.
# Converted sizes (Systran/faster-whisper-*): tiny=75M, base=145M, small=480M
ARG WHISPER_MODEL=tiny
ARG WHISPER_COMPUTE_TYPE=int8
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='${WHISPER_COMPUTE_TYPE}')"

COPY src/ ./src/
RUN pip install --no-cache-dir --no-deps .

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /root/.cache/huggingface /root/.cache/huggingface

EXPOSE 8000
CMD ["uvicorn", "ai_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
