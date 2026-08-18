#!/usr/bin/env python3
"""Drive N sessions at once through the parts upload, and time the wait.

What this measures is the only number anyone outside the codebase cares about:
the seconds between pressing "Finalizar" and having a usable draft. Everything
else it prints is there to explain that number when it moves.

Each session logs in, creates a patient and an appointment, uploads the parts on
a clock, calls /audio/complete and polls the draft until it is DRAFT_READY.

The pace multiplier is the point of the exercise. A part really arrives once a
minute, which gives a window five minutes to do ~35 s of work. At 3x it gets 100
seconds for the same work, so a run that keeps up at 3x keeps up comfortably in
production. Anything below 1x is not a load test, it is a demo.

Standard library only, on purpose: the last time this lived outside the repo it
needed a virtualenv rebuilt from scratch before it could be run again.

Usage:
    LOAD_PASSWORD=... python3 load_sessions.py --sessions 3 --pace 3 \\
        --parts-dir ./parts --email someone@demo.clinica.co

The account must belong to an internal (is_internal) organization, because the
run ends by calling /admin/reset-clinical-data, which refuses to touch any
other kind. Clean up after yourself: see README.md.
"""
import argparse
import json
import os
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

# 24 kbps mono Opus is a flat 3000 bytes per second, which makes a part's size an
# exact duration. The recorder's own constant, not an estimate.
RECORDER_BYTES_PER_SECOND = 3000
PART_SUFFIX = ".chunk"

_print_lock = threading.Lock()


def say(*parts: object) -> None:
    with _print_lock:
        print(f"[{time.strftime('%H:%M:%S')}]", *parts, flush=True)


def request(
    base: str, method: str, path: str, *, token: str | None = None,
    body: bytes | None = None, content_type: str | None = None, timeout: int = 120,
) -> tuple[int, dict]:
    req = urllib.request.Request(base + path, data=body, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"body": raw[:300].decode("utf-8", "replace")}


def post_json(base: str, path: str, payload: dict, token: str | None = None) -> tuple[int, dict]:
    return request(base, "POST", path, token=token,
                   body=json.dumps(payload).encode(), content_type="application/json")


def multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes]]) -> tuple[bytes, str]:
    boundary = "----sghcp" + uuid.uuid4().hex
    out = bytearray()
    for name, value in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n".encode()
        out += value.encode() + b"\r\n"
    for name, (filename, blob) in files.items():
        out += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                f"filename=\"{filename}\"\r\nContent-Type: audio/webm\r\n\r\n").encode()
        out += blob + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def load_parts(parts_dir: str) -> list[bytes]:
    names = sorted(
        (f for f in os.listdir(parts_dir) if f.endswith(PART_SUFFIX)),
        key=lambda f: int("".join(c for c in f.split(PART_SUFFIX)[0] if c.isdigit()) or 0),
    )
    if not names:
        sys.exit(f"no {PART_SUFFIX} files in {parts_dir}")
    return [open(os.path.join(parts_dir, n), "rb").read() for n in names]


def split_source(path: str, seconds_per_part: float) -> list[bytes]:
    """Cut a finished recording into parts the size the recorder would send.

    A blind byte split is not what MediaRecorder produces — its chunks end on a
    cluster — so the last part of a prefix can end mid-cluster and ffmpeg drops
    the incomplete frames at the end of a window. Fine for a load test, wrong
    for judging transcript quality. Use --parts-dir with real parts for that.
    """
    blob = open(path, "rb").read()
    size = int(seconds_per_part * RECORDER_BYTES_PER_SECOND)
    return [blob[i:i + size] for i in range(0, len(blob), size)]


def run_session(n: int, args, parts: list[bytes], results: list[dict]) -> None:
    base = args.url
    status, data = post_json(base, "/api/v1/auth/login",
                             {"email": args.email, "password": args.password})
    if status != 200:
        say(n, "login failed", status, data)
        return
    token = data["access_token"]
    _, me = request(base, "GET", "/api/v1/auth/me", token=token)

    stamp = int(time.time())
    status, patient = post_json(base, "/api/v1/patients", {
        "first_name": "Carga", "paternal_last_name": f"Sesion-{n}",
        "birth_date": "1990-06-15", "gender": "No especificado",
        "document_type_code": "CC", "document_number": f"LOAD{stamp}{n}",
        "phone": "3000000000",
    }, token)
    if status != 201:
        say(n, "patient failed", status, patient)
        return

    when = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
        hour=8 + (n % 12), minute=0, second=0, microsecond=0).isoformat()
    status, appointment = post_json(base, "/api/v1/appointments", {
        "patient_id": patient["id"], "staff_id": me["user_id"],
        "scheduled_at": when, "duration_min": 50, "modality": "IN_PERSON",
    }, token)
    if status != 201:
        say(n, "appointment failed", status, appointment)
        return
    appointment_id = appointment["id"]

    upload_id = str(uuid.uuid4())
    say(n, f"recording appt={appointment_id} upload={upload_id}")

    started = time.time()
    for index, blob in enumerate(parts):
        due = started + (index + 1) * (len(blob) / RECORDER_BYTES_PER_SECOND) / args.pace
        body, ctype = multipart({"upload_id": upload_id, "index": str(index)},
                                {"part": ("chunk.webm", blob)})
        status, err = request(base, "POST",
                              f"/api/v1/appointments/{appointment_id}/audio/parts",
                              token=token, body=body, content_type=ctype)
        if status != 204:
            say(n, f"part {index} failed", status, err)
            return
        if due > time.time():
            time.sleep(due - time.time())
    upload_seconds = time.time() - started
    say(n, f"parts done in {upload_seconds:.1f}s, pressing Finalizar")

    finalized = time.time()
    body, ctype = multipart({
        "patient_id": patient["id"], "upload_id": upload_id,
        "ext": ".webm", "record_type": "EVOLUTION",
    }, {})
    status, data = request(base, "POST",
                           f"/api/v1/appointments/{appointment_id}/audio/complete",
                           token=token, body=body, content_type=ctype)
    if status != 202:
        say(n, "complete failed", status, data)
        return
    draft_id = data["draft_id"]

    quoted = None
    while True:
        _, draft = request(base, "GET", f"/api/v1/ai-drafts/{draft_id}", token=token)
        if quoted is None:
            quoted = draft.get("eta_seconds")
        state = draft.get("status")
        if state in ("DRAFT_READY", "ERROR", "EMPTY"):
            waited = time.time() - finalized
            say(n, f"{state} in {waited:.1f}s (eta said {quoted})")
            results.append({
                "session": n, "status": state, "draft_id": draft_id,
                "upload_seconds": round(upload_seconds, 1),
                "wait_seconds": round(waited, 1), "eta_quoted": quoted,
                "chars": len(str(draft.get("transcription") or "")),
            })
            return
        time.sleep(3)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sessions", type=int, default=3)
    p.add_argument("--pace", type=float, default=3.0,
                   help="how many times faster than real time the parts arrive")
    p.add_argument("--parts-dir", help="directory of <upload>.<n>.chunk files from a real recorder")
    p.add_argument("--source", help="a finished .webm to cut into parts instead")
    p.add_argument("--part-seconds", type=float, default=60.0)
    p.add_argument("--url", default=os.environ.get("LOAD_URL", "https://app.chapni.com"))
    p.add_argument("--email", default=os.environ.get("LOAD_EMAIL", "admin@demo.clinica.co"))
    p.add_argument("--reset", action="store_true",
                   help="delete the clinical data this run created when it ends")
    args = p.parse_args()

    args.password = os.environ.get("LOAD_PASSWORD", "")
    if not args.password:
        sys.exit("LOAD_PASSWORD is not set")
    if bool(args.parts_dir) == bool(args.source):
        sys.exit("pass exactly one of --parts-dir or --source")

    parts = (load_parts(args.parts_dir) if args.parts_dir
             else split_source(args.source, args.part_seconds))
    audio_seconds = sum(len(b) for b in parts) / RECORDER_BYTES_PER_SECOND
    say(f"{args.sessions} sessions at {args.pace}x, {len(parts)} parts, "
        f"{audio_seconds / 60:.1f} min of audio each")

    results: list[dict] = []
    threads = []
    for n in range(args.sessions):
        t = threading.Thread(target=run_session, args=(n, args, parts, results))
        t.start()
        threads.append(t)
        # Staggered so the three logins do not land on the same millisecond.
        # They still finish within a second of each other, which is the case
        # this test exists for.
        time.sleep(1.5)
    for t in threads:
        t.join()

    print("\n=== results ===")
    for r in sorted(results, key=lambda x: x["session"]):
        print(json.dumps(r))

    waits = sorted(r["wait_seconds"] for r in results if r["status"] == "DRAFT_READY")
    if waits:
        print(f"\nready: {len(waits)}/{args.sessions}   median {statistics.median(waits):.1f}s"
              f"   worst {waits[-1]:.1f}s")
    if len(waits) != args.sessions:
        print("NOT every session produced a draft", file=sys.stderr)

    if args.reset:
        _, session = post_json(args.url, "/api/v1/auth/login",
                               {"email": args.email, "password": args.password})
        status, data = post_json(args.url, "/api/v1/admin/reset-clinical-data",
                                 {"confirmation": "ELIMINAR"}, session["access_token"])
        print(f"\nreset-clinical-data: {status} {json.dumps(data.get('deleted', {}))[:200]}")

    return 0 if len(waits) == args.sessions else 1


if __name__ == "__main__":
    raise SystemExit(main())
