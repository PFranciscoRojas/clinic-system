"""Contract tests: the therapeutic approach may change prompt instructions,
never the response-format contract the frontend consumes."""

from ai_service.approaches import (
    APPROACH_LABELS,
    PLAN_INSTRUCTIONS,
    plan_instruction,
    wording_instruction,
)
from ai_service.drafts import claude as drafts_claude
from ai_service.suggestions import claude as suggestions_claude

ALL_APPROACHES = [*APPROACH_LABELS.keys(), "", "not-a-real-approach"]

# The exact JSON keys each consumer reads (api/aiSuggestions.ts and the
# treatment-plan/recap panels). If a prompt stops mentioning one of these,
# the model will stop producing it.
PLAN_CONTRACT_KEYS = ['"title"', '"formulation"', '"goals"', '"description"', '"target_weeks"']
RECAP_CONTRACT_KEYS = ['"summary"', '"last_session"', '"pending_tasks"', '"focus_points"', '"risk_flags"']


def test_catalogs_are_in_sync() -> None:
    assert set(PLAN_INSTRUCTIONS) == set(APPROACH_LABELS)


def test_plan_prompt_keeps_contract_for_every_approach() -> None:
    for approach in ALL_APPROACHES:
        system = suggestions_claude._PLAN_SYSTEM.format(
            approach_instruction=plan_instruction(approach)
        )
        for key in PLAN_CONTRACT_KEYS:
            assert key in system, f"{approach}: plan prompt lost contract key {key}"
        # The formatted prompt must contain real JSON braces, not format artifacts.
        assert "{{" not in system and "}}" not in system


def test_plan_unknown_or_empty_approach_falls_back_to_cbt() -> None:
    assert plan_instruction("") == PLAN_INSTRUCTIONS["cbt"]
    assert plan_instruction("not-a-real-approach") == PLAN_INSTRUCTIONS["cbt"]


def test_wording_instruction_empty_when_unset() -> None:
    # Drafts/recaps must stay byte-identical to the previous prompts when the
    # professional has not chosen an approach.
    assert wording_instruction("") == ""
    assert wording_instruction("not-a-real-approach") == ""
    for approach in APPROACH_LABELS:
        assert APPROACH_LABELS[approach] in wording_instruction(approach)


def test_recap_prompt_keeps_contract() -> None:
    for key in RECAP_CONTRACT_KEYS:
        assert key in suggestions_claude._RECAP_SYSTEM


def test_risk_prompt_has_no_approach_parameter() -> None:
    # Risk detection is deliberately approach-agnostic.
    assert "{approach" not in suggestions_claude._RISK_SYSTEM


def test_draft_prompt_schema_unchanged_by_approach() -> None:
    # The draft system prompt is built from schema + tone/style instructions;
    # the approach only appends to the style instruction. The integrated
    # section schemas must not reference the approach at all.
    for sections in drafts_claude._SECTION_SCHEMAS.values():
        for hint in sections.values():
            assert "{approach" not in hint
