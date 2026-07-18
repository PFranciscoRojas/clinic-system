"""Shape validation for widget values the AI returns on custom templates.

Only `risk` is an AI-fillable widget (see _WIDGET_AI_SCHEMAS in
drafts/claude.py). The other registered widgets are manual-only and any value
the model volunteers for them is dropped fail-closed:

  - mental_exam: the system prompt forbids the AI from marking exam options
    (la IA sugiere, el humano decide) — and its old ai_schema never matched
    the real component anyway.
  - treatment_plan / diagnoses: self-contained panels backed by their own
    tables; their renderers ignore section values.

The retired bespoke widgets (task_checklist, session_evaluation,
task_adherence, functionality, formulation_5f, spa_history,
functional_analysis, distress_scale) are template-level select/multiselect/
scale fields now; archived template versions that still reference them fall
through the unknown-widget branch untouched.

validate_widget_value() returns the (possibly lightly coerced) value when it
matches the widget's contract, or None when it must be dropped.
"""

from typing import Any

_RISK_VALUES = {"NONE", "IDEATION", "PLAN", "ATTEMPT"}

# Registered widgets the AI must never prefill — the value is dropped even if
# the model volunteers one (it is never asked to).
_MANUAL_ONLY_WIDGETS = {"mental_exam", "treatment_plan", "diagnoses"}


def validate_widget_value(widget: str, val: Any) -> Any | None:
    """Return a clean value matching the widget's contract, else None (drop)."""
    if val is None:
        return None

    if widget == "risk":
        return val if val in _RISK_VALUES else None

    if widget in _MANUAL_ONLY_WIDGETS:
        return None

    # Unknown widget (including the retired bespoke ones still referenced by
    # archived template versions): pass through untouched — dropping it would
    # silently lose content.
    return val
