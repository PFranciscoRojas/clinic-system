"""Verify an AI draft generated with the cloned 'Nota de Evolución' template:
every template key should be present (or explainably absent) and every widget
value must match the shape the frontend widget expects."""

import json
import sys
import urllib.request

BASE = "https://app.chapni.com"

TEMPLATE_KEYS = {
    "nivel_de_malestar_subjetivo": ("widget", "distress_scale"),
    "estado_actual_y_reporte_subjetivo": ("text", None),
    "seguimiento_a_compromisos_actividades": ("widget", "task_adherence"),
    "descripci_n_cl_nica_de_la_sesi_n": ("text", None),
    "evaluaci_n_del_cierre_de_sesi_n": ("widget", "session_evaluation"),
    "nuevas_tareas_asignadas": ("widget", "task_checklist"),
    "nivel_de_riesgo": ("widget", "risk"),
}


def check_widget(widget: str, val) -> str | None:
    """Return an error string, or None when the value is well-shaped."""
    if widget == "distress_scale":
        if not isinstance(val, (int, float)) or not (0 <= val <= 10):
            return f"expected number 0-10, got {val!r}"
    elif widget == "task_adherence":
        if not isinstance(val, dict) or not isinstance(val.get("adherence"), (int, float)):
            return f"expected {{adherence: number, notes}}, got {val!r}"
        if not (0 <= val["adherence"] <= 4):
            return f"adherence out of range 0-4: {val['adherence']!r}"
    elif widget == "session_evaluation":
        if not isinstance(val, dict) or not any(isinstance(val.get(k), str) for k in ("axis", "quality", "notes")):
            return f"expected {{axis, quality, notes}} with strings, got {val!r}"
    elif widget == "task_checklist":
        if not isinstance(val, list) or not all(isinstance(x, str) for x in val):
            return f"expected array of strings, got {val!r}"
    elif widget == "risk":
        if val not in ("NONE", "IDEATION", "PLAN", "ATTEMPT"):
            return f"expected risk enum, got {val!r}"
    return None


def main(draft_id: str, token: str) -> int:
    req = urllib.request.Request(
        f"{BASE}/api/v1/ai-drafts/{draft_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as r:
        d = json.load(r)

    print(f"status={d['status']}  whisper={d.get('whisper_model')}  model={d.get('ai_model_version')}")
    print(f"template_id={d.get('template_id')}  processed_at={d.get('processed_at')}")
    trans = d.get("transcription") or ""
    print(f"transcription: {len(trans)} chars, ~{len(trans.split())} words")

    content = d.get("draft_content_plain") or {}
    sections = content.get("sections") or {}
    print(f"suggested_icd10: {content.get('suggested_icd10')}")
    print(f"sections returned: {sorted(sections.keys())}\n")

    failures = 0
    for key, (ftype, widget) in TEMPLATE_KEYS.items():
        val = sections.get(key)
        if val is None:
            print(f"⚠️  {key}: ABSENT (AI returned null — allowed, but check transcript had content for it)")
            continue
        if ftype == "text":
            ok = isinstance(val, str) and len(val.strip()) > 0
            print(f"{'✅' if ok else '❌'} {key}: text, {len(str(val))} chars")
            failures += 0 if ok else 1
        else:
            err = check_widget(widget, val)
            if err:
                print(f"❌ {key} [{widget}]: {err}")
                failures += 1
            else:
                print(f"✅ {key} [{widget}]: {json.dumps(val, ensure_ascii=False)[:140]}")

    extra = set(sections) - set(TEMPLATE_KEYS)
    if extra:
        print(f"❌ keys outside template schema leaked through: {extra}")
        failures += 1

    print(f"\n{'PASS' if failures == 0 else f'FAIL ({failures})'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
