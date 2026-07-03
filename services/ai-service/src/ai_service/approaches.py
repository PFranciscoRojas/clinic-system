"""Therapeutic-approach catalog and prompt instruction blocks.

Keys must stay in sync with core-api (profiles/handler/aiprefs.go
TherapeuticApproaches) and the Settings UI. The approach ONLY changes
instruction text inside the system prompts — never the "Formato de
respuesta" JSON contracts the frontend consumes. An unknown or empty
approach falls back to the previous (approach-neutral / CBT-for-plans)
behaviour, so old jobs and unset profiles are unaffected.
"""

APPROACH_LABELS: dict[str, str] = {
    "cbt": "terapia cognitivo-conductual (TCC)",
    "humanistic": "terapia humanista (centrada en la persona)",
    "psychodynamic": "terapia psicodinámica",
    "systemic": "terapia sistémica",
    "gestalt": "terapia Gestalt",
    "act": "terapia de aceptación y compromiso (ACT)",
    "dbt": "terapia dialéctico-conductual (DBT)",
    "integrative": "enfoque integrador",
}

# Blocks for the treatment-plan prompt: framework for the formulation, the
# kind of techniques/goals to propose, and how to phrase them. Goals must stay
# concrete and measurable in every approach — that rule lives in the shared
# prompt, not here.
PLAN_INSTRUCTIONS: dict[str, str] = {
    "cbt": (
        "El enfoque es cognitivo-conductual (TCC). Formula el caso en términos de pensamientos, "
        "emociones y conductas mantenedoras. Propón objetivos con técnicas TCC: reestructuración "
        "cognitiva, exposición, activación conductual, psicoeducación, prevención de recaídas."
    ),
    "humanistic": (
        "El enfoque es humanista, centrado en la persona. Formula el caso desde la experiencia "
        "subjetiva del consultante, su autoconcepto y sus condiciones de crecimiento. Propón "
        "objetivos orientados a la autoexploración, la congruencia, la autoaceptación y el "
        "desarrollo del potencial personal, apoyados en la relación terapéutica."
    ),
    "psychodynamic": (
        "El enfoque es psicodinámico. Formula el caso considerando patrones relacionales "
        "repetitivos, conflictos y defensas, y su vínculo con la historia temprana. Propón "
        "objetivos orientados al insight, la elaboración de conflictos y el trabajo con la "
        "relación transferencial."
    ),
    "systemic": (
        "El enfoque es sistémico. Formula el caso en términos de pautas de interacción, roles y "
        "ciclos que mantienen el problema en los sistemas del consultante (pareja, familia, "
        "trabajo). Propón objetivos relacionales: redefinición de pautas, límites, comunicación, "
        "tareas entre sesiones que involucren al sistema."
    ),
    "gestalt": (
        "El enfoque es Gestalt. Formula el caso en términos de awareness, contacto e "
        "interrupciones del ciclo de la experiencia en el aquí y ahora. Propón objetivos "
        "orientados a ampliar la conciencia presente, el trabajo experiencial (experimentos, "
        "silla vacía) y la integración de polaridades."
    ),
    "act": (
        "El enfoque es la terapia de aceptación y compromiso (ACT). Formula el caso en términos "
        "de evitación experiencial, fusión cognitiva y alejamiento de valores. Propón objetivos "
        "orientados a la flexibilidad psicológica: aceptación, defusión, contacto con el presente, "
        "clarificación de valores y acción comprometida."
    ),
    "dbt": (
        "El enfoque es la terapia dialéctico-conductual (DBT). Formula el caso en términos de "
        "desregulación emocional y déficits de habilidades. Propón objetivos por módulos de "
        "habilidades: regulación emocional, tolerancia al malestar, efectividad interpersonal y "
        "mindfulness, equilibrando validación y cambio."
    ),
    "integrative": (
        "El enfoque es integrador. Formula el caso combinando los marcos que mejor expliquen el "
        "problema y justifica brevemente la elección. Propón objetivos que integren técnicas de "
        "distintas corrientes según lo que la historia muestra más indicado para este caso."
    ),
}


def plan_instruction(approach: str) -> str:
    """Instruction block for the treatment-plan prompt. Unknown/empty → CBT
    (the behaviour the product shipped with)."""
    return PLAN_INSTRUCTIONS.get(approach, PLAN_INSTRUCTIONS["cbt"])


def wording_instruction(approach: str) -> str:
    """One-line wording hint for drafts and recaps; empty when no approach is
    set so those prompts stay byte-identical to the previous behaviour."""
    label = APPROACH_LABELS.get(approach)
    if not label:
        return ""
    return (
        f"El profesional trabaja desde la {label}: cuando sea pertinente, usa la "
        "terminología de ese enfoque, sin inventar contenido que no esté en el material."
    )
