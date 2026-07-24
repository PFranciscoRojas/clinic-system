#!/usr/bin/env python3
"""Split an exported lead list into priority A, priority B and discarded rows.

Implements section 1 of docs/ai/PLAN_VENTA_DIRECTA.md. Column names are detected
from the header, so it works with whatever shape the export has (Explee, LinkedIn,
a hand-made sheet) as long as there is something resembling a name, a company,
a title and a headline.

Usage:
    python3 scripts/leads/filter_leads.py leads.csv
    python3 scripts/leads/filter_leads.py leads.csv --outdir /tmp/leads

Writes <outdir>/leads_A.csv, leads_B.csv and leads_discarded.csv, and prints a
summary with the reason each row was dropped.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

# --- column detection -------------------------------------------------------

COLUMN_HINTS = {
    "first_name": ("first_name", "firstname", "nombre"),
    "last_name": ("last_name", "lastname", "apellido"),
    "full_name": ("full_name", "fullname", "name_person", "person_name", "lead"),
    "company": ("company", "company_name", "organization", "account", "empresa", "name"),
    "title": ("title", "job_title", "cargo", "position", "puesto"),
    "headline": ("headline", "summary", "bio", "descripcion", "description"),
    "email": ("email", "email_address", "correo", "mail"),
    "domain": ("domain", "website", "company_domain", "url", "sitio"),
    "linkedin": ("linkedin", "linkedin_url", "profile_url", "perfil"),
    "country": ("country", "geo_country", "country_iso_2", "pais"),
}


def normalize(text: str) -> str:
    """Lowercase and strip accents, so 'Fundación' matches 'fundacion'."""
    stripped = unicodedata.normalize("NFD", text or "")
    stripped = "".join(c for c in stripped if unicodedata.category(c) != "Mn")
    return stripped.lower().strip()


def detect_columns(fieldnames: list[str]) -> dict[str, str]:
    """Map our logical fields to the actual header names, best effort."""
    found: dict[str, str] = {}
    normalized = {normalize(f): f for f in fieldnames}
    for logical, hints in COLUMN_HINTS.items():
        for hint in hints:
            if hint in normalized:
                found[logical] = normalized[hint]
                break
        else:
            # fall back to a substring match, longest header wins
            candidates = [
                original
                for norm, original in normalized.items()
                if any(hint in norm for hint in hints)
            ]
            if candidates:
                found[logical] = max(candidates, key=len)
    return found


# --- filtering rules --------------------------------------------------------

# Roles that are not the buyer: they do not keep a private clinical record.
ROLE_BLOCKLIST = (
    "psychiatrist",
    "psiquiatra",
    "social psychologist",
    "psicologo social",
    "psicologa social",
    "child psychologist",
    "organizacional",
    "organizational",
    "recursos humanos",
    "human resources",
    "talent",
    "recruit",
    "seleccion",
    "customer success",
    "comercial",
    "riesgo psicosocial",
    "psicosocial",
    "forense",
    "forensic",
    "deportivo",
    "sports",
    "escolar",
    "educativa",
    "docente",
    "profesor",
    "estudiante",
    "student",
    "practicante",
    "intern",
    "recien titulado",
)

# Employers: if the person works here, they are not the decision maker for a
# single-seat subscription.
ORG_BLOCKLIST = (
    "fundacion",
    "asociacion",
    "corporacion",
    "e.s.e",
    "ese ",
    "hospital",
    "clinica ",
    "institucion",
    "instituto",
    " ips",
    "ips ",
    "universidad",
    "colegio",
    "secretaria",
    "alcaldia",
    "gobernacion",
    "ministerio",
    "eps ",
    "sas",
    "s.a.s",
    "ltda",
    "s.a.",
    " inc",
    "inc.",
    "llc",
    "gmbh",
    "locatel",
    "cotrafa",
    "dreamjobs",
    "aiesec",
    "gospel",
)

# Directory placeholder domains: the "company" is a container, not the practice.
DOMAIN_BLOCKLIST = (
    "guiapj.com.br",
    "abotorrino.com.br",
    "jaimeyasky.cl",
    "cp-barcelona.com",
    "silvia-aber.co.il",
    "ondira.com",
    "psicologosmadridcapital.com",
    "att.com",
    "aiesec.org",
    "chasedimond.com",
    "unal.edu.co",
)

# Signals of a real independent practice.
PRACTICE_SIGNALS = (
    "consulta privada",
    "consulta particular",
    "consultorio",
    "consultorio particular",
    "practica privada",
    "private practice",
    "independiente",
    "independent",
    "freelance",
    "autonomo",
    "particular",
)

# Baseline profession signal. The role blocklist above already removed the
# organizational, school, forensic and social variants, so whatever is left that
# says "psicólogo" is a clinician for our purposes.
PROFESSION_SIGNALS = (
    "psicolog",
    "psycholog",
    "psicoterap",
    "psychotherap",
    "terapeuta",
    "therapist",
)

# Stronger clinical markers. Only used to sort priority A, so the clearest
# profiles are the ones written to first.
CLINICAL_SIGNALS = (
    "clinic",  # clinical / clínica / clínico
    "psicoterap",
    "psychotherap",
    "terapeuta",
    "therapist",
    "tcc",
    "act,",
    " act ",
    "dbt",
    "cbt",
    "gestalt",
    "sistemic",
    "sistemat",
    "psicoanal",
    "psychoanal",
    "cognitivo",
    "cognitive",
    "salud mental",
    "mental health",
)


def row_text(row: dict, cols: dict[str, str], *fields: str) -> str:
    """Concatenate the normalized value of the given logical fields."""
    parts = [row.get(cols[f], "") for f in fields if f in cols]
    return normalize(" ".join(p for p in parts if p))


def company_is_own_name(row: dict, cols: dict[str, str]) -> bool:
    """True when the practice is named after the person, e.g. 'Francisco Castro Terapia'.

    A solo practitioner branding the consultorio with their own name is as strong
    a signal of private practice as writing 'consulta privada'.
    """
    company = row_text(row, cols, "company")
    if not company:
        return False
    name = row_text(row, cols, "full_name", "first_name", "last_name")
    tokens = [t for t in re.split(r"\W+", name) if len(t) > 2]
    if not tokens:
        return False
    return sum(1 for t in tokens if t in company) >= 2


def classify(row: dict, cols: dict[str, str]) -> tuple[str, str, int]:
    """Return (bucket, reason, sort_rank). Bucket is 'A', 'B' or 'discard'."""
    role = row_text(row, cols, "title", "headline")
    company = row_text(row, cols, "company")
    domain = row_text(row, cols, "domain")
    everything = f"{role} {company} {domain}"

    for bad in DOMAIN_BLOCKLIST:
        if bad in domain:
            return "discard", f"dominio de directorio ({bad})", 0

    for bad in ROLE_BLOCKLIST:
        if bad in role:
            return "discard", f"cargo fuera de perfil ({bad.strip()})", 0

    for bad in ORG_BLOCKLIST:
        if bad in company:
            return "discard", f"empleado de institucion ({bad.strip()})", 0

    own_name = company_is_own_name(row, cols)
    has_practice = any(s in everything for s in PRACTICE_SIGNALS) or own_name
    is_professional = any(s in everything for s in PROFESSION_SIGNALS)
    clinical_hits = sum(1 for s in CLINICAL_SIGNALS if s in everything)

    if has_practice and is_professional:
        why = "consultorio con su nombre" if own_name else "consulta privada"
        if clinical_hits:
            return "A", f"{why} + {clinical_hits} senal(es) clinica(s)", clinical_hits + 1
        return "A", f"{why}, sin enfoque clinico explicito", 1

    if has_practice:
        return "B", "consulta privada pero el cargo no dice psicologia", 0
    if is_professional:
        return "B", "es psicologo pero no se ve consulta propia", 0
    return "B", "sin senales, revisar a mano", 0


# --- main -------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv_path", type=Path, help="exported lead list (.csv)")
    parser.add_argument("--outdir", type=Path, default=None, help="where to write the buckets (default: next to the input)")
    args = parser.parse_args()

    if not args.csv_path.exists():
        print(f"no existe: {args.csv_path}", file=sys.stderr)
        return 1

    outdir = args.outdir or args.csv_path.parent
    outdir.mkdir(parents=True, exist_ok=True)

    with args.csv_path.open(newline="", encoding="utf-8-sig") as fh:
        sample = fh.read(8192)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(fh, dialect=dialect)
        if not reader.fieldnames:
            print("el archivo no tiene encabezado", file=sys.stderr)
            return 1
        cols = detect_columns(list(reader.fieldnames))
        rows = list(reader)

    missing = [f for f in ("company", "title") if f not in cols]
    if missing:
        print(f"aviso: no encontre columnas para {missing}. Encabezados vistos: {reader.fieldnames}", file=sys.stderr)

    buckets: dict[str, list[dict]] = {"A": [], "B": [], "discard": []}
    reasons: Counter[str] = Counter()

    ranks: dict[int, int] = {}
    for row in rows:
        bucket, reason, rank = classify(row, cols)
        row["_motivo"] = reason
        ranks[id(row)] = rank
        buckets[bucket].append(row)
        if bucket == "discard":
            reasons[reason] += 1

    # Clearest profiles first, so the 30 you write to this week are the top 30.
    buckets["A"].sort(key=lambda r: ranks[id(r)], reverse=True)

    header = list(reader.fieldnames) + ["_motivo"]
    names = {"A": "leads_A.csv", "B": "leads_B.csv", "discard": "leads_discarded.csv"}
    for bucket, filename in names.items():
        target = outdir / filename
        with target.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(buckets[bucket])

    total = len(rows)
    print(f"columnas detectadas: { {k: v for k, v in sorted(cols.items())} }")
    print(f"\n{total} filas leidas")
    print(f"  prioridad A  {len(buckets['A']):>4}  -> {outdir / names['A']}")
    print(f"  prioridad B  {len(buckets['B']):>4}  -> {outdir / names['B']}")
    print(f"  descartadas  {len(buckets['discard']):>4}  -> {outdir / names['discard']}")

    if reasons:
        print("\nmotivos de descarte:")
        for reason, count in reasons.most_common():
            print(f"  {count:>4}  {reason}")

    print("\nLee leads_A.csv de arriba a abajo antes de escribir. El filtro se equivoca;")
    print("mueve a mano lo que no encaje y lo que se le haya colado de B.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
