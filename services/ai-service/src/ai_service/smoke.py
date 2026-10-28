"""Post-deploy smoke check: one real, minimal Claude call.

Run inside the freshly deployed container (`python -m ai_service.smoke`) by the
deploy workflow. Unit tests fake the SDK, so they cannot see a revoked key, a
retired model or an SDK that rejects our request shape at runtime; this can.
From 2026-10-07 every Claude call failed for 20 days behind a green deploy.

The prompt is a fixed string: no clinical or personal data ever goes through
here. Cost is a handful of tokens per deploy.
"""

import asyncio
import sys

import anthropic

from ai_service.claude_reply import reply_text
from ai_service.config import settings


async def check() -> int:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        message = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=5,
            messages=[{"role": "user", "content": "Responde solo: ok"}],
        )
        text = reply_text(message)
    except Exception as exc:  # any failure is the answer: report it, exit non-zero
        print(f"smoke FAILED: model={settings.anthropic_model} {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(f"smoke ok: model={settings.anthropic_model} stop={message.stop_reason} reply={text.strip()!r}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(check()))
