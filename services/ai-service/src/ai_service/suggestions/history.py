"""Render a patient's decrypted clinical history into a single text block.

Pure formatting — no DB, no crypto. The worker decrypts each record's sections
and hands them here; the result is anonymized before it ever reaches Claude.
"""
from datetime import date
from typing import Any

# Human labels for the section keys (mirror of the clinical-record templates).
_SECTION_LABELS: dict[str, str] = {
    # INITIAL
    "consultation_reason": "Motivo de consulta",
    "current_problem": "Problema actual",
    "personal_history": "Antecedentes personales",
    "family_history": "Antecedentes familiares",
    "psychosocial_context": "Contexto psicosocial",
    "diagnostic_impression": "Impresión diagnóstica",
    "initial_plan": "Plan inicial",
    # EVOLUTION
    "session_development": "Desarrollo de la sesión",
    "interventions": "Intervenciones",
    "patient_response": "Respuesta del paciente",
    "plan_tasks": "Plan y tareas",
    # DISCHARGE
    "discharge_summary": "Resumen del proceso",
    "final_state": "Estado final",
    "goals_achieved": "Objetivos logrados",
    "recommendations": "Recomendaciones",
    "referral": "Remisión",
}

_RECORD_TYPE_LABELS = {
    "INITIAL": "Sesión inicial",
    "EVOLUTION": "Evolución",
    "DISCHARGE": "Alta",
}


def render_record(record_type: str, session_date: date | None, sections: dict[str, Any]) -> str:
    """One clinical record → a labeled text block."""
    header = _RECORD_TYPE_LABELS.get(record_type, record_type)
    if session_date is not None:
        header = f"{header} ({session_date.isoformat()})"
    lines = [f"## {header}"]
    for key, value in sections.items():
        if not isinstance(value, str) or not value.strip():
            continue
        label = _SECTION_LABELS.get(key, key)
        lines.append(f"- {label}: {value.strip()}")
    return "\n".join(lines)


def render_diagnoses(diagnoses: list[dict[str, Any]]) -> str:
    """Active/registered diagnoses → a text block (ICD-10 codes are not PII)."""
    if not diagnoses:
        return ""
    lines = ["## Diagnósticos registrados"]
    for d in diagnoses:
        code = str(d.get("code", "")).strip()
        desc = str(d.get("description", "")).strip()
        status = str(d.get("status", "")).strip()
        lines.append(f"- {code} {desc} [{status}]")
    return "\n".join(lines)


def render_history(records: list[dict[str, Any]], diagnoses: list[dict[str, Any]]) -> str:
    """Assemble the full history (oldest → newest) plus diagnoses into one block."""
    blocks: list[str] = []
    diag = render_diagnoses(diagnoses)
    if diag:
        blocks.append(diag)
    for r in records:
        block = render_record(r["record_type"], r.get("session_date"), r.get("sections") or {})
        if block.strip():
            blocks.append(block)
    return "\n\n".join(blocks)
