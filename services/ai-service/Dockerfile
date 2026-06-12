# ─── build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch first: the default wheel bundles ~7GB of CUDA libraries
# that are dead weight on a GPU-less VPS
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install dependencies from pyproject before copying source so code edits
# don't invalidate the heavy torch/spaCy layers
COPY pyproject.toml .
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# Download spaCy Spanish model
RUN python -m spacy download es_core_news_lg

# Pre-download Whisper model so it's baked into the image (avoids slow first-run download)
# Model size: tiny=39M, base=74M, small=244M, medium=769M
ARG WHISPER_MODEL=base
RUN python -c "import whisper; whisper.load_model('${WHISPER_MODEL}')"

COPY src/ ./src/
RUN pip install --no-cache-dir --no-deps .

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /root/.cache/whisper /root/.cache/whisper

EXPOSE 8000
CMD ["uvicorn", "ai_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-config", "/dev/null"]
