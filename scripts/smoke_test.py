#!/usr/bin/env python3
"""
SGHCP smoke test — happy-path sequence against the live API.
Runs after every deploy to catch regressions before they affect real users.

Environment variables:
  SMOKE_URL       Base URL of the API  (default: https://app.chapni.com)
  SMOKE_EMAIL     Test user email      (default: admin@demo.clinica.co)
  SMOKE_PASSWORD  Test user password   (required — set as GitHub secret)
"""
import os
import sys
from datetime import datetime, timedelta, timezone

try:
    import httpx
except ImportError:
    print("httpx not found — run: pip install httpx")
    sys.exit(2)

BASE     = os.environ.get("SMOKE_URL", "https://app.chapni.com")
EMAIL    = os.environ.get("SMOKE_EMAIL", "admin@demo.clinica.co")
PASSWORD = os.environ.get("SMOKE_PASSWORD", "")

if not PASSWORD:
    print("❌ SMOKE_PASSWORD is not set")
    sys.exit(2)

NOW          = datetime.now(timezone.utc)
TODAY        = NOW.strftime("%Y-%m-%d")
SCHEDULED_AT = (NOW + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
DOC_NUMBER   = f"SMOKE{int(NOW.timestamp())}"

client = httpx.Client(base_url=BASE, timeout=30)
steps_passed = 0

def step(label: str, resp: httpx.Response, expect: int) -> dict:
    global steps_passed
    if resp.status_code != expect:
        print(f"❌ [{label}] expected {expect}, got {resp.status_code}")
        try:
            print(f"   {resp.json()}")
        except Exception:
            print(f"   {resp.text[:300]}")
        sys.exit(1)
    steps_passed += 1
    print(f"✅ {label}")
    try:
        return resp.json()
    except ValueError:  # e.g. /healthz returns plain text
        return {}

# ── 1. Login ──────────────────────────────────────────────────────────────────
data = step("login", client.post("/api/v1/auth/login", json={
    "email": EMAIL,
    "password": PASSWORD,
}), 200)
token = data["access_token"]
auth  = {"Authorization": f"Bearer {token}"}

# ── 2. Healthcheck + identity ─────────────────────────────────────────────────
step("healthz", client.get("/healthz"), 200)
data = step("auth/me", client.get("/api/v1/auth/me", headers=auth), 200)
staff_id = data["user_id"]

# ── 3. Create patient ─────────────────────────────────────────────────────────
data = step("create patient", client.post("/api/v1/patients", headers=auth, json={
    "first_name":           "Smoke",
    "paternal_last_name":   "Test",
    "birth_date":           "1990-06-15",
    "gender":               "No especificado",
    "document_type_code":   "CC",
    "document_number":      DOC_NUMBER,
    "phone":                "3000000000",
}), 201)
patient_id = data["id"]

# ── 4. Create appointment ─────────────────────────────────────────────────────
data = step("create appointment", client.post("/api/v1/appointments", headers=auth, json={
    "patient_id":   patient_id,
    "staff_id":     staff_id,
    "scheduled_at": SCHEDULED_AT,
    "duration_min": 50,
    "modality":     "IN_PERSON",
}), 201)
appointment_id = data["id"]

# ── 5. Create clinical record (DRAFT) ─────────────────────────────────────────
data = step("create clinical record", client.post(
    f"/api/v1/patients/{patient_id}/records",
    headers=auth,
    json={
        "appointment_id": appointment_id,
        "record_type":    "INITIAL",
        "session_date":   TODAY,
        "sections": {
            "consultation_reason": "Smoke test — verificación automatizada post-deploy",
            "current_problem":     "Smoke test — no es un paciente real",
            "mental_exam":         {"appearance": {"status": "NORMAL", "note": None}},
        },
        "risk_level": "NONE",
    },
), 201)
record_id = data["id"]

# ── 6. Approve clinical record ────────────────────────────────────────────────
step("approve clinical record", client.post(
    f"/api/v1/clinical-records/{record_id}/approve",
    headers=auth,
    json={},
), 204)

# ── 7. Verify status = APPROVED ───────────────────────────────────────────────
data = step("get clinical record", client.get(
    f"/api/v1/clinical-records/{record_id}",
    headers=auth,
), 200)
if data.get("status") != "APPROVED":
    print(f"❌ verify APPROVED: got status={data.get('status')!r}")
    sys.exit(1)
steps_passed += 1
print("✅ verify status=APPROVED")

# ── 8. Cleanup — reset demo data ──────────────────────────────────────────────
step("reset demo data", client.post(
    "/api/v1/admin/reset-clinical-data",
    headers=auth,
    json={"confirmation": "ELIMINAR"},
), 200)

print(f"\n✅ All {steps_passed} smoke tests passed")
