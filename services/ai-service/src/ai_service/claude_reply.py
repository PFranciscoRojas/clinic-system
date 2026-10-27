"""Reading Claude's answer out of a Messages API response."""

from typing import Any


def reply_text(message: Any) -> str:
    """Return the concatenated text blocks of a response.

    Blocks are read by type, not position: with thinking on, a response can
    open with a thinking block. A declined request carries no text and must
    fail loudly — an empty answer would otherwise parse as "nothing found"
    (for a risk assessment, as "no risk").
    """
    if message.stop_reason == "refusal":
        details = getattr(message, "stop_details", None)
        category = getattr(details, "category", None) if details else None
        raise RuntimeError(f"claude refused the request (category={category})")
    return "".join(b.text for b in message.content if b.type == "text")
