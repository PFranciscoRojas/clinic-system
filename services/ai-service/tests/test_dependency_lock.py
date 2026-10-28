"""The image installs requirements.txt, not pyproject.toml — keep them in step.

The Dockerfile installs the lock with --require-hashes and then the package
itself with --no-deps. A dependency added to pyproject.toml but not to the lock
would therefore build fine and fail at runtime with an ImportError. And a lock
pin outside pyproject's range would ship a version the code doesn't claim to
support (anthropic 1.x vs ">=0.27" is how the 2026-10-07 outage started).
"""

import re
import tomllib
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

ROOT = Path(__file__).resolve().parent.parent


def _locked() -> dict[str, str]:
    pins: dict[str, str] = {}
    for line in (ROOT / "requirements.txt").read_text().splitlines():
        m = re.match(r"^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?==([^\s\\;]+)", line)
        if m:
            pins[canonicalize_name(m.group(1))] = m.group(2)
    return pins


def _declared() -> list[Requirement]:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text())
    return [Requirement(d) for d in data["project"]["dependencies"]]


def test_every_dependency_is_locked_within_its_declared_range():
    locked = _locked()
    problems = []
    for req in _declared():
        version = locked.get(canonicalize_name(req.name))
        if version is None:
            problems.append(f"{req.name}: missing from requirements.txt")
        elif not req.specifier.contains(version, prereleases=True):
            problems.append(f"{req.name}=={version} outside pyproject's '{req.specifier}'")
    assert not problems, "regenerate requirements.txt (see its header):\n" + "\n".join(problems)


def test_every_locked_package_carries_a_hash():
    # --require-hashes rejects the whole install if one pin lacks a hash; fail
    # here, in seconds, rather than in a 10-minute image build.
    text = (ROOT / "requirements.txt").read_text()
    blocks = re.split(r"\n(?=[A-Za-z0-9._-]+==)", text)
    unhashed = [b.split()[0] for b in blocks if "==" in b.split()[0] and "--hash=sha256:" not in b]
    assert not unhashed, f"pins without --hash: {unhashed}"


def test_dockerfile_installs_the_lock_with_hashes():
    dockerfile = (ROOT / "Dockerfile").read_text()
    assert "--require-hashes -r requirements.txt" in dockerfile
    assert "spacy download" not in dockerfile.replace("`spacy download`", "")
