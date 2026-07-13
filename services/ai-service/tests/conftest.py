import os
import sys
import types

# Settings() requires these at import time in the modules under test; the
# tests never call the network or the DB.
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("MASTER_KEY", "00" * 32)
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

# The real whisper package drags in torch (~2 GB) and no test ever loads a
# model — transcription tests only exercise pure helpers. Stub it when absent
# so the suite runs on CI and dev machines without the inference stack.
try:
    import whisper  # noqa: F401
except ModuleNotFoundError:
    _stub = types.ModuleType("whisper")

    class _Whisper:  # matches the type annotation in transcription/whisper.py
        pass

    def _load_model(name: str) -> None:
        raise RuntimeError("whisper is stubbed in tests — no model loading")

    _stub.Whisper = _Whisper  # type: ignore[attr-defined]
    _stub.load_model = _load_model  # type: ignore[attr-defined]
    sys.modules["whisper"] = _stub
