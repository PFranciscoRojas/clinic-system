"""Shape validation for widget values the AI returns on custom templates.

The frontend widgets each expect a specific JSON shape (mirrored in
_WIDGET_AI_SCHEMAS in drafts/claude.py and services/shared/field-widgets.json).
Claude usually complies, but a malformed value ("3" instead of 3, a string
where an object belongs) would be sealed into the draft as-is and either
render broken or silently empty in the review UI. A dropped section instead
renders as fill-it-yourself — strictly better than corrupt prefill.

validate_widget_value() returns the (possibly lightly coerced) value when it
matches the widget's contract, or None when it must be dropped.
"""

from typing import Any

_RISK_VALUES = {"NONE", "IDEATION", "PLAN", "ATTEMPT"}
_MENTAL_EXAM_STATUS = {"NORMAL", "ALTERED"}

# dict widgets whose values are free-text-or-null per fixed key
_STRING_DICT_KEYS: dict[str, tuple[str, ...]] = {
    "formulation_5f": ("presenting", "predisposing", "precipitating", "perpetuating", "protective"),
    "functional_analysis": ("antecedents", "behavior", "consequences"),
    "functionality": ("work", "social", "personal", "global_level"),
    "spa_history": ("substances", "frequency", "last_use", "impact"),
    "session_evaluation": ("axis", "quality", "notes"),
}


def _number(val: Any, lo: float, hi: float) -> float | None:
    """A real number within [lo, hi]; bool is not a number here."""
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        return None
    return val if lo <= val <= hi else None


def _opt_str(val: Any) -> str | None:
    return val if isinstance(val, str) and val.strip() else None


def _string_dict(val: Any, keys: tuple[str, ...]) -> dict[str, str | None] | None:
    if not isinstance(val, dict):
        return None
    out = {k: _opt_str(val.get(k)) for k in keys}
    return out if any(v is not None for v in out.values()) else None


def validate_widget_value(widget: str, val: Any) -> Any | None:
    """Return a clean value matching the widget's contract, else None (drop)."""
    if val is None:
        return None

    if widget == "distress_scale":
        return _number(val, 0, 10)

    if widget == "risk":
        return val if val in _RISK_VALUES else None

    if widget == "task_checklist":
        if isinstance(val, list):
            items = [x for x in val if isinstance(x, str) and x.strip()]
            return items or None
        return None

    if widget == "task_adherence":
        if not isinstance(val, dict):
            return None
        adherence = _number(val.get("adherence"), 0, 4)
        if adherence is None:
            return None
        return {"adherence": adherence, "notes": _opt_str(val.get("notes"))}

    if widget in _STRING_DICT_KEYS:
        return _string_dict(val, _STRING_DICT_KEYS[widget])

    if widget == "mental_exam":
        if not isinstance(val, dict):
            return None
        out: dict[str, Any] = {}
        for domain, entry in val.items():
            if not isinstance(entry, dict) or entry.get("status") not in _MENTAL_EXAM_STATUS:
                continue
            out[domain] = {"status": entry["status"], "note": _opt_str(entry.get("note"))}
        return out or None

    if widget == "treatment_plan":
        if not isinstance(val, dict):
            return None
        goals = []
        for g in val.get("goals") or []:
            if not isinstance(g, dict):
                continue
            desc = _opt_str(g.get("description"))
            if desc is None:
                continue
            goal: dict[str, Any] = {"description": desc}
            weeks = _number(g.get("target_weeks"), 0, 520)
            if weeks is not None:
                goal["target_weeks"] = weeks
            goals.append(goal)
        techniques = [t for t in (val.get("techniques") or []) if isinstance(t, str) and t.strip()]
        if not goals and not techniques:
            return None
        return {"goals": goals, "techniques": techniques}

    if widget == "diagnoses":
        if not isinstance(val, list):
            return None
        items = []
        for d in val:
            if isinstance(d, dict) and _opt_str(d.get("code")):
                items.append({"code": d["code"].strip(), "description": _opt_str(d.get("description")) or ""})
        return items or None

    # Unknown widget: pass through untouched — dropping it would silently
    # lose content for widgets added to the frontend before this list.
    return val
