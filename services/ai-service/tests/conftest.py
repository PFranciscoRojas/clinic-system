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


# spaCy and its Spanish model are ~500 MB and only the NER layer of the
# anonymizer needs them. Stub it when absent, same reasoning as whisper above,
# with entities the tests control: that keeps the assertions deterministic
# (real NER is probabilistic) while still exercising the offset arithmetic that
# turns entity spans back into redacted text.
try:
    import spacy  # noqa: F401
except ModuleNotFoundError:
    class _Ent:
        def __init__(self, start_char: int, end_char: int, label: str) -> None:
            self.start_char = start_char
            self.end_char = end_char
            self.label_ = label

    class _Doc:
        def __init__(self, ents: list) -> None:
            self.ents = ents

    class Language:  # matches `from spacy.language import Language`
        # Entities the next call should report, as (start, end, label) tuples.
        # Tests set this via the stub_entities fixture; default is none, so the
        # regex and known-name layers can be asserted in isolation.
        queued_entities: list = []

        def __call__(self, text: str) -> _Doc:
            return _Doc([_Ent(s, e, label) for s, e, label in Language.queued_entities])

    _spacy = types.ModuleType("spacy")
    _language_mod = types.ModuleType("spacy.language")
    _language_mod.Language = Language  # type: ignore[attr-defined]

    def _load(name: str) -> Language:
        return Language()

    _spacy.load = _load  # type: ignore[attr-defined]
    _spacy.language = _language_mod  # type: ignore[attr-defined]
    sys.modules["spacy"] = _spacy
    sys.modules["spacy.language"] = _language_mod
