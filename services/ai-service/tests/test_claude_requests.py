"""Every Claude call must be a request the installed SDK accepts.

Production regression (2026-10-07 → 2026-10-27): the ai-service image was
rebuilt with anthropic 1.x, whose create() no longer takes `temperature`, and
every draft and suggestion call failed with a TypeError before reaching the
API. These tests bind each outgoing request against the real SDK signature, so
a parameter the SDK dropped fails here instead of in production.
"""

import inspect
import json
from types import SimpleNamespace

import pytest
from anthropic.resources.beta.messages import AsyncMessages as BetaAsyncMessages
from anthropic.resources.messages import AsyncMessages

from ai_service.drafts.claude import generate_clinical_draft
from ai_service.suggestions.claude import (
    generate_recap,
    generate_risk_assessment,
    generate_treatment_plan,
)

SAMPLING_PARAMS = {"temperature", "top_p", "top_k"}


def _reply(text: str, stop_reason: str = "end_turn") -> SimpleNamespace:
    # Adaptive thinking can put an (empty) thinking block before the text.
    content = [SimpleNamespace(type="thinking", thinking="")]
    if text:
        content.append(SimpleNamespace(type="text", text=text))
    return SimpleNamespace(
        content=content,
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(category="general_harms") if stop_reason == "refusal" else None,
        usage=SimpleNamespace(input_tokens=10, output_tokens=10),
        model="claude-sonnet-4-6",
    )


class _Sent(list):
    """Requests captured by the fake SDK, plus the reply it hands back."""

    next_reply = _reply("{}")

    def reply(self, r: SimpleNamespace) -> None:
        self.next_reply = r


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> _Sent:
    """Capture every request; reject any the real SDK signature would reject."""
    calls = _Sent()

    def make_fake(original):
        sig = inspect.signature(original)

        async def fake(self, **kwargs):
            sig.bind(self, **kwargs)  # TypeError on an unknown parameter, like the SDK
            calls.append(kwargs)
            return calls.next_reply

        return fake

    monkeypatch.setattr(AsyncMessages, "create", make_fake(AsyncMessages.create))
    monkeypatch.setattr(BetaAsyncMessages, "create", make_fake(BetaAsyncMessages.create))
    return calls


async def test_clinical_draft_request_is_accepted_by_sdk(sent):
    sent.reply(_reply(json.dumps({"session_development": "Sesión de seguimiento."})))
    out = json.loads(await generate_clinical_draft("Texto anonimizado de la sesión."))
    assert "Sesión de seguimiento." in json.dumps(out["sections"], ensure_ascii=False)
    assert len(sent) == 1
    assert not SAMPLING_PARAMS & sent[0].keys()


@pytest.mark.parametrize(
    "fn, reply",
    [
        (generate_risk_assessment, {"level": "low", "signals": [], "rationale": None, "recommendation": None}),
        (generate_recap, {"summary": "Resumen", "focus_points": []}),
        (generate_treatment_plan, {"title": "Plan", "formulation": None, "goals": []}),
    ],
)
async def test_suggestion_requests_are_accepted_by_sdk(sent, fn, reply):
    sent.reply(_reply(json.dumps(reply)))
    await fn("Historia anonimizada.")
    assert len(sent) == 1
    assert not SAMPLING_PARAMS & sent[0].keys()


async def test_refusal_fails_instead_of_storing_an_empty_result(sent):
    # A declined request has no text block; it must surface as an error so the
    # worker retries/marks it, never as an empty "no risk" assessment.
    sent.reply(_reply("", stop_reason="refusal"))
    with pytest.raises(RuntimeError, match="refus"):
        await generate_risk_assessment("Historia anonimizada.")
