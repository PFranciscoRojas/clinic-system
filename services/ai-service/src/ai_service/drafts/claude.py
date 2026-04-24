import json
import logging

import anthropic

from ai_service.config import settings

logger = logging.getLogger(__name__)

_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

_SYSTEM_PROMPT = """Eres un asistente clínico especializado en psicología. Tu única tarea es
estructurar la transcripción de una sesión clínica en formato SOAP.

REGLAS ESTRICTAS:
1. No inventes información que no esté en la transcripción.
2. Si algo no es claro o no se mencionó, usa null en ese campo.
3. Nunca incluyas nombres, documentos o datos de contacto — el texto ya fue anonimizado.
4. Usa terminología psicológica precisa y lenguaje formal clínico.
5. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional.

Formato de respuesta:
{
  "subjective": "Relato del paciente: motivo de consulta, síntomas referidos, estado emocional.",
  "objective": "Observaciones del clínico: comportamiento, afecto, cognición, presentación.",
  "assessment": "Impresión diagnóstica o clínica basada en la sesión.",
  "plan": "Plan terapéutico acordado, tareas, próximos pasos."
}"""


async def generate_soap_draft(anonymized_transcription: str) -> str:
    """Send anonymized transcription to Claude and return a SOAP draft as JSON string.

    The input has already been processed by anonymize() — no PII should reach here.
    Returns a JSON string matching the SOAP schema.
    """
    if not anonymized_transcription.strip():
        return json.dumps({"subjective": None, "objective": None, "assessment": None, "plan": None})

    logger.info("generating soap draft", extra={"chars": len(anonymized_transcription)})

    message = await _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Transcripción de sesión:\n\n{anonymized_transcription}",
            }
        ],
    )

    raw = message.content[0].text.strip()

    # Validate it's parseable JSON before storing
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("claude returned non-JSON; wrapping as subjective")
        parsed = {"subjective": raw, "objective": None, "assessment": None, "plan": None}

    logger.info("soap draft generated", extra={"input_tokens": message.usage.input_tokens})
    return json.dumps(parsed, ensure_ascii=False)
