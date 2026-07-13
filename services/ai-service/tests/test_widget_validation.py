"""Widget values from Claude must match the frontend widget contracts —
malformed ones are dropped (rendered as fill-it-yourself) instead of sealed
into the draft where they'd break or blank the review UI."""

from ai_service.drafts.claude import _filter_sections
from ai_service.drafts.widgets import validate_widget_value


def test_distress_scale_accepts_number_in_range() -> None:
    assert validate_widget_value("distress_scale", 6) == 6
    assert validate_widget_value("distress_scale", 0.5) == 0.5


def test_distress_scale_rejects_strings_bools_and_out_of_range() -> None:
    assert validate_widget_value("distress_scale", "6") is None
    assert validate_widget_value("distress_scale", True) is None
    assert validate_widget_value("distress_scale", 11) is None


def test_risk_enum() -> None:
    assert validate_widget_value("risk", "NONE") == "NONE"
    assert validate_widget_value("risk", "SEVERE") is None
    assert validate_widget_value("risk", 3) is None


def test_task_adherence_shape() -> None:
    ok = validate_widget_value("task_adherence", {"adherence": 3, "notes": "buena semana"})
    assert ok == {"adherence": 3, "notes": "buena semana"}
    assert validate_widget_value("task_adherence", {"adherence": "3"}) is None
    assert validate_widget_value("task_adherence", {"adherence": 9}) is None
    assert validate_widget_value("task_adherence", "3 de 4") is None


def test_task_checklist_filters_non_strings() -> None:
    assert validate_widget_value("task_checklist", ["a", 2, "b", "  "]) == ["a", "b"]
    assert validate_widget_value("task_checklist", []) is None
    assert validate_widget_value("task_checklist", "una tarea") is None


def test_string_dict_widgets_keep_known_keys_only() -> None:
    val = {"axis": "ansiedad", "quality": None, "notes": "", "extra": "x"}
    assert validate_widget_value("session_evaluation", val) == {
        "axis": "ansiedad", "quality": None, "notes": None,
    }
    assert validate_widget_value("session_evaluation", {"axis": ""}) is None


def test_mental_exam_drops_invalid_domains() -> None:
    val = {
        "appearance": {"status": "NORMAL", "note": None},
        "memory": {"status": "WEIRD", "note": "x"},
        "attention": "normal",
    }
    assert validate_widget_value("mental_exam", val) == {
        "appearance": {"status": "NORMAL", "note": None},
    }


def test_treatment_plan_keeps_valid_goals() -> None:
    val = {
        "goals": [
            {"description": "reducir rumiación", "target_weeks": 6},
            {"description": "", "target_weeks": 2},
            "no soy un objeto",
        ],
        "techniques": ["TCC", 42],
    }
    assert validate_widget_value("treatment_plan", val) == {
        "goals": [{"description": "reducir rumiación", "target_weeks": 6}],
        "techniques": ["TCC"],
    }


def test_unknown_widget_passes_through() -> None:
    assert validate_widget_value("mi_widget_nuevo", {"anything": 1}) == {"anything": 1}


def test_filter_sections_drops_malformed_and_keeps_valid() -> None:
    template = [
        {"key": "malestar", "type": "widget", "widget": "distress_scale"},
        {"key": "estado", "type": "text"},
        {"key": "riesgo", "type": "widget", "widget": "risk"},
        {"key": "animo", "type": "scale", "scale_min": 1, "scale_max": 5},
        {"key": "modalidad", "type": "select", "options": ["presencial", "virtual"]},
    ]
    parsed = {
        "malestar": "seis",          # malformed → dropped
        "estado": "Llega tranquila",  # valid text
        "riesgo": "NONE",             # valid enum
        "animo": 7,                   # out of template range → dropped
        "modalidad": "telefónica",    # not an option → dropped
        "fuera_de_schema": "x",       # unknown key → dropped
    }
    out = _filter_sections(parsed, {}, template)
    assert out == {"estado": "Llega tranquila", "riesgo": "NONE"}
