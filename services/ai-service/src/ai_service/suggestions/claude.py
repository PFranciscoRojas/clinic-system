import json
import logging

import anthropic

from ai_service.config import settings

logger = logging.getLogger(__name__)

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# ── Recap ─────────────────────────────────────────────────────────────────────
# A short pre-session summary so the professional walks in oriented. The model
# only summarizes what the (anonymized) history already says — it never invents.

_RECAP_SYSTEM = """Eres un asistente clínico especializado en psicología. Tu tarea es
producir un RESUMEN PRE-SESIÓN para que el profesional retome rápidamente el caso
antes de la próxima cita, a partir de la historia clínica que se te entrega.

REGLAS ESTRICTAS:
1. No inventes información. Resume únicamente lo que está en la historia.
2. El texto ya fue anonimizado: nunca incluyas nombres, documentos ni datos de contacto.
3. Lenguaje clínico, formal, en tercera persona y conciso.
4. Si no hay base para un campo, usa null (o lista vacía en focus_points).
5. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional ni marcas de formato.

Formato de respuesta — un objeto JSON con estas claves:
{
  "summary": "string — síntesis del proceso terapéutico hasta ahora (motivo, evolución).",
  "last_session": "string | null — qué se trabajó en la última sesión registrada.",
  "pending_tasks": "string | null — tareas o compromisos asignados aún pendientes.",
  "focus_points": ["string", "..."],  // puntos a retomar u observar en esta sesión
  "risk_flags": "string | null — señales de riesgo a vigilar, si las hay."
}"""

# ── Treatment plan (CBT) ───────────────────────────────────────────────────────
# Proposes a cognitive-behavioral plan: a brief formulation plus measurable goals
# that pre-fill the existing treatment-plan form. The professional edits/approves.

_PLAN_SYSTEM = """Eres un asistente clínico especializado en TERAPIA COGNITIVO-CONDUCTUAL (TCC).
Tu tarea es PROPONER un plan terapéutico de TCC a partir de la historia clínica entregada.
El profesional revisará, editará y aprobará la propuesta antes de usarla.

REGLAS ESTRICTAS:
1. El enfoque es exclusivamente cognitivo-conductual (TCC).
2. Básate solo en la historia entregada; no inventes datos del paciente.
3. El texto ya fue anonimizado: nunca incluyas nombres, documentos ni datos de contacto.
4. Los objetivos deben ser concretos y medibles, formulados en TCC (reestructuración
   cognitiva, exposición, activación conductual, psicoeducación, prevención de recaídas, etc.).
5. Propón entre 3 y 6 objetivos, ordenados por prioridad.
6. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional ni marcas de formato.

Formato de respuesta — un objeto JSON con estas claves:
{
  "title": "string — título breve del plan (p. ej. 'Plan TCC para trastorno de ansiedad').",
  "formulation": "string — formulación cognitivo-conductual breve del caso.",
  "goals": [
    {
      "description": "string — objetivo terapéutico concreto y medible.",
      "target_weeks": 8  // número entero de semanas estimadas para alcanzarlo
    }
  ]
}"""


async def generate_recap(anonymized_history: str) -> str:
    """Return a pre-session recap as a JSON string. Input is already anonymized."""
    if not anonymized_history.strip():
        return json.dumps(
            {"summary": None, "last_session": None, "pending_tasks": None,
             "focus_points": [], "risk_flags": None},
            ensure_ascii=False,
        )

    logger.info("generating recap", extra={"chars": len(anonymized_history)})
    message = await _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=_RECAP_SYSTEM,
        messages=[{"role": "user", "content": f"Historia clínica:\n\n{anonymized_history}"}],
    )
    parsed = _extract_json(message.content[0].text)

    out = {
        "summary": _clean_str(parsed.get("summary")),
        "last_session": _clean_str(parsed.get("last_session")),
        "pending_tasks": _clean_str(parsed.get("pending_tasks")),
        "focus_points": [s.strip() for s in parsed.get("focus_points", []) if isinstance(s, str) and s.strip()],
        "risk_flags": _clean_str(parsed.get("risk_flags")),
    }
    logger.info("recap generated", extra={"input_tokens": message.usage.input_tokens})
    return json.dumps(out, ensure_ascii=False)


async def generate_treatment_plan(anonymized_history: str) -> str:
    """Return a CBT treatment-plan proposal as a JSON string. Input is anonymized."""
    if not anonymized_history.strip():
        return json.dumps({"title": None, "formulation": None, "goals": []}, ensure_ascii=False)

    logger.info("generating treatment plan", extra={"chars": len(anonymized_history)})
    message = await _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=_PLAN_SYSTEM,
        messages=[{"role": "user", "content": f"Historia clínica:\n\n{anonymized_history}"}],
    )
    parsed = _extract_json(message.content[0].text)

    goals = []
    for g in parsed.get("goals", []):
        if not isinstance(g, dict):
            continue
        desc = _clean_str(g.get("description"))
        if not desc:
            continue
        weeks = g.get("target_weeks")
        goals.append({
            "description": desc,
            "target_weeks": weeks if isinstance(weeks, int) and weeks > 0 else None,
        })

    out = {
        "title": _clean_str(parsed.get("title")),
        "formulation": _clean_str(parsed.get("formulation")),
        "goals": goals,
    }
    logger.info("treatment plan generated", extra={"input_tokens": message.usage.input_tokens, "goals": len(goals)})
    return json.dumps(out, ensure_ascii=False)


def _clean_str(v: object) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def _extract_json(raw: str) -> dict:
    """Parse Claude's reply as JSON, tolerating fences/preamble (no prefill in 4.x)."""
    raw = raw.strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        try:
            parsed = json.loads(raw[start : end + 1]) if 0 <= start < end else None
        except json.JSONDecodeError:
            parsed = None
    return parsed if isinstance(parsed, dict) else {}
