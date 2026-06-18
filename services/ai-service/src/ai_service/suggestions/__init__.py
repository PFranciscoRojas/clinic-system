"""AI suggestions over a patient's encrypted history.

Two read-only assists the professional reviews before anything becomes a
clinical artifact:
  - recap          → pre-session summary of the process so far
  - treatment_plan → a CBT (terapia cognitivo-conductual) plan proposal

Mirrors the draft pipeline: history is decrypted, anonymized, sent to Claude,
and the JSON result is sealed with the suggestion's own DEK.
"""
