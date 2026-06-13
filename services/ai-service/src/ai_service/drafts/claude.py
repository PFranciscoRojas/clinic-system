import json
import logging

import anthropic

from ai_service.config import settings

logger = logging.getLogger(__name__)

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# Section schemas mirror the clinical record form (frontend
# components/clinical/constants.ts) so the approved draft maps 1:1
# into the record the professional would have written by hand.
_SECTION_SCHEMAS: dict[str, dict[str, str]] = {
    "INITIAL": {
        "consultation_reason": "Motivo de consulta, en palabras del paciente.",
        "current_problem": "Problema actual: inicio, evolución, intentos previos de solución, tratamientos anteriores.",
        "personal_history": "Antecedentes personales: médicos, psicológicos o psiquiátricos previos, medicación actual.",
        "family_history": "Antecedentes familiares de salud mental.",
        "psychosocial_context": "Contexto psicosocial: familia, trabajo o estudio, red de apoyo.",
        "diagnostic_impression": "Impresión diagnóstica con justificación clínica.",
        "initial_plan": "Plan inicial: enfoque terapéutico, frecuencia propuesta, objetivos preliminares.",
    },
    "EVOLUTION": {
        "session_development": "Desarrollo de la sesión: qué trajo el paciente, qué se trabajó.",
        "interventions": "Intervenciones aplicadas: técnicas usadas (reestructuración cognitiva, exposición, psicoeducación, etc.).",
        "patient_response": "Análisis y respuesta del paciente: cómo respondió, avance respecto a objetivos.",
        "plan_tasks": "Plan y tareas: qué sigue, tareas asignadas para la casa.",
    },
    "DISCHARGE": {
        "discharge_summary": "Resumen del proceso terapéutico completo.",
        "final_state": "Estado final del paciente, contrastado contra el motivo de consulta inicial.",
        "goals_achieved": "Objetivos logrados respecto al plan inicial.",
        "recommendations": "Recomendaciones e indicaciones al paciente.",
        "referral": "Remisión a otro profesional, si aplica.",
    },
}

_SYSTEM_PROMPT = """Eres un asistente clínico especializado en psicología. Tu única tarea es
estructurar la transcripción de una sesión clínica en las secciones del registro clínico.

REGLAS ESTRICTAS:
1. No inventes información que no esté en la transcripción.
2. Si una sección no tiene contenido en la transcripción, usa null en ese campo.
3. Nunca incluyas nombres, documentos o datos de contacto — el texto ya fue anonimizado.
4. Usa terminología psicológica precisa y lenguaje formal clínico, en tercera persona.
5. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional ni marcas de formato.
6. Añade además la clave "suggested_icd10": una SUGERENCIA (no un diagnóstico definitivo)
   del código CIE-10 más probable según lo expresado en la sesión, como objeto
   {{"code": "F41.1", "description": "Trastorno de ansiedad generalizada"}}.
   Usa códigos de salud mental (capítulo F). Si no hay base suficiente, usa null.
   El profesional confirmará o cambiará esta sugerencia antes de aprobar.

Formato de respuesta — un objeto JSON con las claves de secciones y "suggested_icd10":
{schema}"""


def _schema_for(record_type: str) -> tuple[str, dict[str, str]]:
    rt = record_type if record_type in _SECTION_SCHEMAS else "EVOLUTION"
    return rt, _SECTION_SCHEMAS[rt]


async def generate_soap_draft(anonymized_transcription: str, record_type: str = "EVOLUTION") -> str:
    """Send anonymized transcription to Claude and return the draft as a JSON string.

    The input has already been processed by anonymize() — no PII should reach here.
    Returns '{"record_type": ..., "sections": {...}}' matching the clinical
    record structure for the session's record type.
    """
    rt, schema = _schema_for(record_type)

    if not anonymized_transcription.strip():
        return json.dumps({"record_type": rt, "sections": {}, "suggested_icd10": None}, ensure_ascii=False)

    logger.info("generating clinical draft", extra={"chars": len(anonymized_transcription), "record_type": rt})

    schema_json = json.dumps({k: f"string | null — {v}" for k, v in schema.items()}, ensure_ascii=False, indent=2)

    message = await _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3072,
        system=_SYSTEM_PROMPT.format(schema=schema_json),
        messages=[
            {
                "role": "user",
                "content": f"Transcripción de sesión:\n\n{anonymized_transcription}",
            },
        ],
    )

    raw = message.content[0].text.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Claude 4.x rejects assistant prefill, so fences/preamble can slip in:
        # pull the outermost JSON object out of whatever came back
        start, end = raw.find("{"), raw.rfind("}")
        try:
            parsed = json.loads(raw[start : end + 1]) if 0 <= start < end else None
        except json.JSONDecodeError:
            parsed = None
        if not isinstance(parsed, dict):
            logger.warning("claude returned non-JSON; storing raw text in the first section")
            parsed = {next(iter(schema)): raw}

    # Keep only known sections with actual content
    sections = {k: v for k, v in parsed.items() if k in schema and isinstance(v, str) and v.strip()}

    # ICD-10 suggestion (the professional confirms it before it becomes a diagnosis)
    suggested = None
    raw_icd = parsed.get("suggested_icd10")
    if isinstance(raw_icd, dict) and isinstance(raw_icd.get("code"), str) and raw_icd["code"].strip():
        suggested = {
            "code": raw_icd["code"].strip().upper(),
            "description": str(raw_icd.get("description") or "").strip(),
        }

    logger.info("clinical draft generated", extra={"input_tokens": message.usage.input_tokens, "sections": len(sections), "icd10": bool(suggested)})
    return json.dumps({"record_type": rt, "sections": sections, "suggested_icd10": suggested}, ensure_ascii=False)
