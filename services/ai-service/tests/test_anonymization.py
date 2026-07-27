"""Executable form of CLAUDE.md rule 5: the LLM only ever sees anonymized text.

The anonymizer runs three layers. Two are deterministic and fully asserted
here: the literal replacement of the patient's known names, and the regexes for
document numbers, phones and emails. The third is spaCy NER, which is
probabilistic — these tests pin the code that turns its spans back into
redacted text, not the model's recall, which no unit test can promise.
"""

import pytest

from ai_service.anonymization.ner import (
    REPLACEMENT_DOC,
    REPLACEMENT_EMAIL,
    REPLACEMENT_LOC,
    REPLACEMENT_ORG,
    REPLACEMENT_PERSON,
    REPLACEMENT_PHONE,
    anonymize,
)


@pytest.fixture(autouse=True)
def _no_entities():
    """Default every test to a NER model that finds nothing.

    Anything still redacted is therefore the work of the deterministic layers,
    which is exactly what we want to hold to account.
    """
    from spacy.language import Language

    if hasattr(Language, "queued_entities"):
        Language.queued_entities = []
        yield
        Language.queued_entities = []
    else:  # real spaCy installed locally — these tests target the stub
        pytest.skip("real spaCy installed; entity-controlled tests need the stub")


@pytest.fixture
def stub_entities():
    from spacy.language import Language

    def _set(entities):
        Language.queued_entities = list(entities)

    return _set


# ── Layer 0: the patient's known names ────────────────────────────────────────


@pytest.mark.parametrize(
    "text, names",
    [
        ("El paciente María refiere ansiedad.", ["María"]),
        ("El paciente maria refiere ansiedad.", ["María"]),  # case
        ("El paciente Maria refiere ansiedad.", ["María"]),  # missing accent
        ("El paciente MARÍA refiere ansiedad.", ["María"]),
        ("Consulta con Chapués hoy.", ["Chapués"]),
        ("Consulta con Chapues hoy.", ["Chapués"]),  # transcription drops accent
    ],
)
def test_known_names_are_replaced_regardless_of_case_or_accents(text, names):
    result = anonymize(text, names)

    assert REPLACEMENT_PERSON in result
    for name in names:
        assert name.lower() not in result.lower()


def test_known_names_are_replaced_before_ner_can_miss_them(stub_entities):
    """The one name we know for certain must not depend on the model."""
    stub_entities([])  # NER finds nothing at all

    result = anonymize("María Chapués asistió a la sesión.", ["María", "Chapués"])

    assert "María" not in result
    assert "Chapués" not in result
    assert result.count(REPLACEMENT_PERSON) == 2


def test_every_occurrence_of_a_name_is_replaced():
    result = anonymize("Ana llegó tarde. Ana estaba nerviosa. Hablamos con Ana.", ["Ana"])

    assert "Ana" not in result
    assert result.count(REPLACEMENT_PERSON) == 3


def test_short_names_are_not_replaced():
    """Initials would over-redact: 'Jo' would blank out every 'Jo' substring."""
    result = anonymize("El paciente JO refiere mejoría.", ["JO"])

    assert "JO" in result


def test_name_matching_respects_word_boundaries():
    """Redacting 'Ana' must not damage 'Anamnesis' or 'Susana'."""
    result = anonymize("Anamnesis completa. Ana asistió con Susana.", ["Ana"])

    assert "Anamnesis" in result
    assert "Susana" in result
    assert result.count(REPLACEMENT_PERSON) == 1


def test_regex_special_characters_in_a_name_are_escaped():
    """A name is untrusted input: it must not be able to act as a regex."""
    result = anonymize("Consulta con O'Brien (padre).", ["O'Brien"])

    assert "O'Brien" not in result
    assert REPLACEMENT_PERSON in result


def test_name_that_is_pure_regex_metacharacters_does_not_crash():
    anonymize("Texto normal sin PII.", [".*", "[a-z]+", "((("])


# ── Layer 2: document numbers, phones, emails ─────────────────────────────────


@pytest.mark.parametrize(
    "document",
    ["1098765", "12345678", "1098765432"],  # 7, 8 and 10 digits
)
def test_document_numbers_are_redacted(document):
    result = anonymize(f"Identificado con cédula {document} de Pasto.")

    assert document not in result
    assert REPLACEMENT_DOC in result


def test_short_digit_runs_are_left_alone():
    """Ages, doses and scores must survive: they are clinically meaningful."""
    result = anonymize("Paciente de 34 años, dosis 50 mg, PHQ-9 de 12.")

    assert "34" in result
    assert "50" in result
    assert "12" in result


@pytest.mark.parametrize(
    "phone",
    ["300 123 4567", "300-123-4567", "3001234567"],
)
def test_phone_numbers_are_redacted(phone):
    result = anonymize(f"Su teléfono es {phone} para confirmar.")

    assert phone not in result
    # A 10-digit unspaced mobile matches the document pattern first, so it is
    # labelled [DOCUMENTO] rather than [TELÉFONO]. Both redact the digits —
    # this asserts the leak is closed, and documents the mislabelling so a
    # future fix is a deliberate change and not a surprise.
    assert REPLACEMENT_PHONE in result or REPLACEMENT_DOC in result


@pytest.mark.parametrize(
    "email",
    ["maria@example.com", "maria.chapues+cita@clinica.co", "m123456@correo.com.co"],
)
def test_emails_are_redacted(email):
    result = anonymize(f"Escribir a {email} para agendar.")

    assert email not in result
    assert REPLACEMENT_EMAIL in result


def test_email_is_redacted_before_its_digits_are_split():
    """The ordering comment in ner.py: email runs first so a digit run inside
    the local part does not get chopped into a [DOCUMENTO] mid-address."""
    result = anonymize("Correo: paciente1098765@example.com")

    assert "paciente1098765@example.com" not in result
    assert REPLACEMENT_EMAIL in result
    assert "@example.com" not in result


def test_multiple_pii_kinds_in_one_note():
    result = anonymize(
        "María, cédula 1098765432, tel 300 123 4567, correo maria@example.com.",
        ["María"],
    )

    for leaked in ["María", "1098765432", "300 123 4567", "maria@example.com"]:
        assert leaked not in result


# ── Layer 1: turning NER spans back into text ─────────────────────────────────


def test_ner_labels_map_to_their_replacements(stub_entities):
    text = "Pedro trabaja en Acme desde Bogotá."
    stub_entities([
        (0, 5, "PER"),    # Pedro
        (17, 21, "ORG"),  # Acme
        (28, 34, "LOC"),  # Bogotá
    ])

    result = anonymize(text)

    assert REPLACEMENT_PERSON in result
    assert REPLACEMENT_ORG in result
    assert REPLACEMENT_LOC in result
    for leaked in ["Pedro", "Acme", "Bogotá"]:
        assert leaked not in result


def test_gpe_is_treated_as_a_location(stub_entities):
    stub_entities([(12, 20, "GPE")])

    result = anonymize("Vive cerca Colombia hoy.")

    assert REPLACEMENT_LOC in result


def test_unknown_entity_labels_are_left_untouched(stub_entities):
    """MISC, DATE and friends are not PII — redacting them would gut the note."""
    stub_entities([(0, 5, "MISC")])

    result = anonymize("Lunes por la mañana.")

    assert "Lunes" in result


def test_multiple_entity_spans_keep_their_offsets(stub_entities):
    """Replacements are applied back-to-front so earlier offsets stay valid.
    Substitutions of a different length than the original are what break a
    naive front-to-back loop."""
    text = "Ana y Bernardo y Cristina."
    stub_entities([
        (0, 3, "PER"),    # Ana
        (6, 14, "PER"),   # Bernardo
        (17, 25, "PER"),  # Cristina
    ])

    result = anonymize(text)

    assert result == f"{REPLACEMENT_PERSON} y {REPLACEMENT_PERSON} y {REPLACEMENT_PERSON}."


# ── Boundaries ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("text", ["", None])
def test_falsy_input_is_returned_unchanged(text):
    assert anonymize(text) == text


def test_text_without_pii_is_untouched():
    text = "El paciente refiere mejoría en el sueño y menor rumiación."

    assert anonymize(text) == text


def test_no_known_names_still_applies_the_other_layers():
    result = anonymize("Cédula 1098765432 y correo x@y.com")

    assert "1098765432" not in result
    assert "x@y.com" not in result
