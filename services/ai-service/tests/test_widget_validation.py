"""Widget values from Claude must match the frontend widget contracts —
malformed ones are dropped (rendered as fill-it-yourself) instead of sealed
into the draft where they'd break or blank the review UI. Empty answers
(null, "", []) are not malformed: they mean the transcription had no content
for that field and are skipped without a warning."""

from ai_service.drafts.claude import _filter_sections, _validate_typed_value
from ai_service.drafts.widgets import validate_widget_value


def test_manual_only_widgets_never_prefill() -> None:
    # Widgets are retired (migration 000067) — none is AI-fillable. risk now
    # travels via the draft's top-level risk_level key, never as a section.
    assert validate_widget_value("risk", "NONE") is None
    assert validate_widget_value("mental_exam", {"porte": ["adecuado"]}) is None
    assert validate_widget_value("treatment_plan", {"goals": []}) is None
    assert validate_widget_value("diagnoses", [{"code": "F41.1"}]) is None


def test_unknown_widget_passes_through() -> None:
    # Includes the retired bespoke widgets still referenced by archived
    # template versions (task_checklist, session_evaluation, …).
    assert validate_widget_value("mi_widget_nuevo", {"anything": 1}) == {"anything": 1}
    assert validate_widget_value("task_checklist", ["tarea libre"]) == ["tarea libre"]


def test_multiselect_matches_options_ignoring_case_and_accents() -> None:
    sec = {
        "type": "multiselect",
        "options": ["Exposición gradual", "Autorregistro ABC"],
        "allow_other": False,
    }
    assert _validate_typed_value(sec, ["exposicion gradual", "AUTORREGISTRO abc"]) == [
        "Exposición gradual", "Autorregistro ABC",
    ]
    # Unmatched values without allow_other are filtered out.
    assert _validate_typed_value(sec, ["otra cosa"]) is None


def test_multiselect_allow_other_keeps_free_text_and_dedupes() -> None:
    sec = {"type": "multiselect", "options": ["Tardanza"], "allow_other": True}
    assert _validate_typed_value(sec, ["tardanza", "Tardanza", "Llanto al cierre"]) == [
        "Tardanza", "Llanto al cierre",
    ]


def test_multiselect_coerces_bare_string() -> None:
    sec = {"type": "multiselect", "options": ["Tardanza", "Silencios"], "allow_other": False}
    assert _validate_typed_value(sec, "silencios") == ["Silencios"]


def test_select_matches_option_ignoring_case_and_accents() -> None:
    sec = {"type": "select", "options": ["Sí", "No"]}
    assert _validate_typed_value(sec, "si") == "Sí"
    assert _validate_typed_value(sec, "tal vez") is None


def test_filter_sections_skips_empty_answers_without_dropping() -> None:
    template = [
        {"key": "barreras", "type": "multiselect", "options": ["Tardanza", "Silencios"], "allow_other": True},
        {"key": "notas", "type": "text"},
        {"key": "eje", "type": "multiselect", "options": ["A", "B"]},
    ]
    parsed = {
        "barreras": [],     # AI found nothing — empty, not malformed
        "notas": "",        # same for text
        "eje": None,        # same for null
    }
    out = _filter_sections(parsed, {}, template)
    assert out == {}


def test_filter_sections_drops_malformed_and_keeps_valid() -> None:
    template = [
        {"key": "estado", "type": "text"},
        {"key": "riesgo", "type": "widget", "widget": "risk"},
        {"key": "animo", "type": "scale", "scale_min": 1, "scale_max": 5},
        {"key": "modalidad", "type": "select", "options": ["presencial", "virtual"]},
        {"key": "barreras", "type": "multiselect", "options": ["Tardanza"], "allow_other": False},
    ]
    parsed = {
        "estado": "Llega tranquila",  # valid text
        "riesgo": "NONE",             # volunteered widget value → dropped (risk is top-level now)
        "animo": 7,                   # out of template range → dropped
        "modalidad": "telefónica",    # not an option → dropped
        "barreras": {"si": True},     # wrong shape → dropped
        "fuera_de_schema": "x",       # unknown key → dropped
    }
    out = _filter_sections(parsed, {}, template)
    assert out == {"estado": "Llega tranquila"}
