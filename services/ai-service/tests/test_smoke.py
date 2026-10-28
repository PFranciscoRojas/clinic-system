"""The post-deploy smoke check must fail the deploy when Claude can't be called."""

import inspect
from types import SimpleNamespace

import pytest
from anthropic.resources.messages import AsyncMessages

from ai_service import smoke

_original = AsyncMessages.create


def _ok_reply() -> SimpleNamespace:
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text="ok")],
        stop_reason="end_turn",
        stop_details=None,
    )


async def test_smoke_passes_on_a_valid_request(monkeypatch: pytest.MonkeyPatch):
    async def fake(self, **kwargs):
        inspect.signature(_original).bind(self, **kwargs)  # same shape check as the SDK
        return _ok_reply()

    monkeypatch.setattr(AsyncMessages, "create", fake)
    assert await smoke.check() == 0


async def test_smoke_fails_when_the_call_fails(monkeypatch: pytest.MonkeyPatch):
    async def fake(self, **kwargs):
        raise TypeError("got an unexpected keyword argument 'temperature'")

    monkeypatch.setattr(AsyncMessages, "create", fake)
    assert await smoke.check() == 1


async def test_smoke_fails_on_a_refusal(monkeypatch: pytest.MonkeyPatch):
    async def fake(self, **kwargs):
        return SimpleNamespace(content=[], stop_reason="refusal", stop_details=None)

    monkeypatch.setattr(AsyncMessages, "create", fake)
    assert await smoke.check() == 1
