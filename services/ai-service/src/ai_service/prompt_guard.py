"""Structural prompt-injection guard for untrusted clinical content.

The system prompts already declare that transcripts/history are data, never
instructions. This module adds the structural half of that defense: untrusted
text travels inside an explicit XML-style envelope the system prompt can point
at, and any attempt to close the envelope from inside the content is
neutralized so embedded text can never escape into "instruction position".
"""

import re

# Tag names used across the AI pipeline. Keep them in sync with the system
# prompts that reference them.
TRANSCRIPT_TAG = "transcripcion"
HISTORY_TAG = "historia_clinica"


def wrap_untrusted(tag: str, content: str) -> str:
    """Envelope untrusted content in <tag>…</tag>, defusing embedded closers.

    A transcript that contains a literal "</transcripcion>" (or a spaced/cased
    variant) could otherwise terminate the envelope early and leave the rest of
    the text outside the data region. The "<" of any embedded open/close of the
    same tag is replaced with a fullwidth "＜" so the sequence stays readable
    but can no longer parse as markup.
    """
    defused = re.sub(rf"<(\s*/?\s*{re.escape(tag)})", r"＜\1", content, flags=re.IGNORECASE)
    return f"<{tag}>\n{defused}\n</{tag}>"
