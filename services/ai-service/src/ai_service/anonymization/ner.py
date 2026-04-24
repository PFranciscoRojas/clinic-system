import logging
import re
from functools import lru_cache

import spacy
from spacy.language import Language

logger = logging.getLogger(__name__)

# Colombian document number patterns
_DOC_PATTERN = re.compile(r"\b\d{6,10}\b")
# Colombian phone patterns (mobile 3XX-XXX-XXXX, landline with area code)
_PHONE_PATTERN = re.compile(r"\b(?:3\d{2}[\s-]?\d{3}[\s-]?\d{4}|\d{1,2}[\s-]?\d{3}[\s-]?\d{4})\b")

REPLACEMENT_PERSON = "[PERSONA]"
REPLACEMENT_ORG = "[ORGANIZACIÓN]"
REPLACEMENT_LOC = "[LUGAR]"
REPLACEMENT_DOC = "[DOCUMENTO]"
REPLACEMENT_PHONE = "[TELÉFONO]"


@lru_cache(maxsize=1)
def _load_model() -> Language:
    logger.info("loading spacy model es_core_news_lg")
    return spacy.load("es_core_news_lg")


def anonymize(text: str) -> str:
    """Remove PII from transcription text before sending to Claude API.

    Replaces named entities (persons, organizations, locations) and patterns
    (document numbers, phone numbers) with safe placeholders.

    The Claude API never receives identifiable patient information.
    """
    if not text:
        return text

    nlp = _load_model()
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

    # Apply regex patterns on the NER-cleaned text
    result = _DOC_PATTERN.sub(REPLACEMENT_DOC, result)
    result = _PHONE_PATTERN.sub(REPLACEMENT_PHONE, result)

    return result
