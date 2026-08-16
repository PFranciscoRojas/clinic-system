import logging
import re
import threading
import unicodedata
from functools import lru_cache
from typing import Iterable

import spacy
from spacy.language import Language

logger = logging.getLogger(__name__)

# _load_model caches one Language object for the whole process, and spaCy makes
# no thread-safety promise about calling a pipeline concurrently. anonymize now
# runs off the event loop in a worker thread, and the worker runs several jobs
# at once, so "one at a time" has to be said out loud. NER on a session's history
# is on the order of a second: serialising it costs nothing worth measuring, and
# the alternative is a corrupted parse of a clinical text.
_MODEL_LOCK = threading.Lock()

# Colombian document number patterns
_DOC_PATTERN = re.compile(r"\b\d{6,10}\b")
# Colombian phone patterns (mobile 3XX-XXX-XXXX, landline with area code)
_PHONE_PATTERN = re.compile(r"\b(?:3\d{2}[\s-]?\d{3}[\s-]?\d{4}|\d{1,2}[\s-]?\d{3}[\s-]?\d{4})\b")
_EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

REPLACEMENT_PERSON = "[PERSONA]"
REPLACEMENT_ORG = "[ORGANIZACIÓN]"
REPLACEMENT_LOC = "[LUGAR]"
REPLACEMENT_DOC = "[DOCUMENTO]"
REPLACEMENT_PHONE = "[TELÉFONO]"
REPLACEMENT_EMAIL = "[CORREO]"

# Accent-tolerant character classes: a transcription may spell "Jose" while the
# record says "José" (and vice versa), so each vowel matches both forms.
_ACCENT_CLASSES = {
    "a": "[aáà]", "e": "[eéè]", "i": "[iíì]", "o": "[oóò]", "u": "[uúùü]", "n": "[nñ]",
}


# md has measurably better PERSON/ORG/LOC recall than sm on Spanish clinical
# text (word vectors); the literal known-names pass and the doc/phone/email
# regexes still run on top of whatever NER misses.
SPACY_MODEL = "es_core_news_md"


@lru_cache(maxsize=1)
def _load_model() -> Language:
    try:
        logger.info("loading spacy model", extra={"model": SPACY_MODEL})
        return spacy.load(SPACY_MODEL)
    except OSError:
        # Image built without md (stale local build) — degrade to sm instead
        # of taking the whole worker down: anonymization must never be the
        # reason a draft job dies.
        logger.warning("spacy model missing, falling back to es_core_news_sm", extra={"wanted": SPACY_MODEL})
        return spacy.load("es_core_news_sm")


def _name_pattern(name: str) -> re.Pattern[str] | None:
    """Word-boundary regex for a known name, case- and accent-insensitive."""
    name = name.strip()
    if len(name) < 3:  # too short to match safely (e.g. initials)
        return None
    parts: list[str] = []
    for ch in name:
        base = unicodedata.normalize("NFD", ch)[0].lower()
        parts.append(_ACCENT_CLASSES.get(base) or re.escape(ch))
    return re.compile(rf"\b{''.join(parts)}\b", re.IGNORECASE)


def anonymize(text: str, known_names: Iterable[str] = ()) -> str:
    """Remove PII from text before sending to Claude API.

    known_names are the patient's real name parts (decrypted by the worker);
    they are replaced literally FIRST — the most reliable anonymizer possible —
    then NER handles other persons/orgs/places, then regex patterns catch
    document numbers, phones and emails.

    The Claude API never receives identifiable patient information.
    """
    if not text:
        return text

    # 0. Literal replacement of the patient's known names (before NER, so the
    #    model's misses can't leak the one name we know for certain).
    for name in known_names:
        pattern = _name_pattern(name)
        if pattern is not None:
            text = pattern.sub(REPLACEMENT_PERSON, text)

    nlp = _load_model()
    with _MODEL_LOCK:
        doc = nlp(text)

    # Build replacements from largest span to smallest to avoid offset issues
    replacements: list[tuple[int, int, str]] = []
    for ent in doc.ents:
        if ent.label_ == "PER":
            replacements.append((ent.start_char, ent.end_char, REPLACEMENT_PERSON))
        elif ent.label_ == "ORG":
            replacements.append((ent.start_char, ent.end_char, REPLACEMENT_ORG))
        elif ent.label_ in ("LOC", "GPE"):
            replacements.append((ent.start_char, ent.end_char, REPLACEMENT_LOC))

    # Apply NER replacements (sorted descending to preserve offsets)
    result = text
    for start, end, repl in sorted(replacements, key=lambda x: x[0], reverse=True):
        result = result[:start] + repl + result[end:]

    # Apply regex patterns on the NER-cleaned text (email first: its local part
    # may contain digit runs the document pattern would otherwise split)
    result = _EMAIL_PATTERN.sub(REPLACEMENT_EMAIL, result)
    result = _DOC_PATTERN.sub(REPLACEMENT_DOC, result)
    result = _PHONE_PATTERN.sub(REPLACEMENT_PHONE, result)

    return result
