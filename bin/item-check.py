#!/usr/bin/env python3
"""item-check.py — the record gate: frontmatter contract + stage
artifacts, PARAMETERIZED BY THE DOMAIN. Fails closed.

    item-check.py <record-folder> <stage>

What a stage requires is read from the domain definition, not baked in
here:

    records/<domain>/domain.yaml

Before that file existed this script hardcoded `dossier.md` as the
draft artifact for every domain, so a lead's outreach draft and an
article's newsletter copy were both — literally — files named
`dossier.md`, and the README's claim that "a domain is a folder of
definitions, never kernel code" was only half true. Adding a domain
must not require editing this file. If you are about to write
`if domain == …` here, the domain is missing a parameter.

  always      item.md exists; frontmatter parses; required core keys
              present (type, status, created). `status` is never judged
              here — that is the flow's business, not a file's claim
              about itself.
  <stage>     the artifact named by `stages.<stage>.artifact` exists,
              clears `min_chars`, carries `sections`, and holds
              `min_links` source links (counted inside
              `min_links_in` when given — three citations in the body
              and none under `## Sources` is an unsourced document with
              a decorative heading).

On the link count, honestly: it is a proxy for rigor, not rigor. It
accepts three fabricated `https://….invalid` URLs (stress test
2026-07, F3). The fresh-context reviewer is the real backstop, which
is why content domains mark `review.required: true` and why that is
not a formality.

Exit 0 clean · 1 findings (FAIL lines on stdout).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # a gate that cannot read its definition must not guess
    yaml = None

REQUIRED_KEYS = ("type", "status", "created")
LINK_RE = re.compile(r"https?://\S+")


def frontmatter(path: Path) -> dict | None:
    lines = path.read_text().splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    fm: dict = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return fm
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return None  # unterminated frontmatter


def load_domain(folder: Path) -> tuple[dict | None, str]:
    """The domain definition for a record folder: records/<domain>/<slug>/
    -> records/<domain>/domain.yaml. Returns (doc, error)."""
    definition = folder.resolve().parent / "domain.yaml"
    if not definition.exists():
        return None, (f"no domain definition at {definition} — a record "
                      f"whose domain declares nothing cannot be checked")
    if yaml is None:
        return None, ("PyYAML required to read the domain definition "
                      "(pip install pyyaml) — refusing to guess at what "
                      "this domain requires")
    try:
        doc = yaml.safe_load(definition.read_text())
    except Exception as e:
        return None, f"{definition.name} does not parse: {e}"
    if not isinstance(doc, dict):
        return None, f"{definition.name}: top level must be a mapping"
    return doc, ""


def check_stage(folder: Path, spec: dict, stage: str) -> list[str]:
    fails: list[str] = []
    name = spec.get("artifact")
    if not name:
        return [f"domain stage `{stage}` declares no `artifact`"]
    artifact = folder / name
    if not artifact.exists():
        return [f"{name} missing"]
    text = artifact.read_text()

    min_chars = int(spec.get("min_chars", 0))
    if min_chars and len(text) < min_chars:
        fails.append(f"{name} is trivial (<{min_chars} chars)")

    for section in spec.get("sections") or []:
        if section not in text:
            fails.append(f"{name} missing `{section}` section")

    min_links = int(spec.get("min_links", 0))
    if min_links:
        within = spec.get("min_links_in")
        if within:
            if within not in text:
                # the section check above already reported a missing
                # heading if it was declared; say why the count is 0
                fails.append(f"{name} has no `{within}` section to count "
                             f"sources in")
                scope = ""
            else:
                scope = text.split(within, 1)[-1]
        else:
            scope = text
        found = len(LINK_RE.findall(scope))
        if found < min_links:
            where = f" in `{within}`" if within else ""
            fails.append(f"{name} carries {found} source link(s){where} "
                         f"(need {min_links})")
    return fails


def main() -> int:
    if len(sys.argv) != 3:
        print("FAIL  [item-check]  usage: item-check.py <record-folder> <stage>")
        return 1
    folder, stage = Path(sys.argv[1]), sys.argv[2]
    fails: list[str] = []

    item = folder / "item.md"
    if not item.exists():
        fails.append("item.md missing — a record without a core is not a record")
    else:
        fm = frontmatter(item)
        if fm is None:
            fails.append("item.md frontmatter missing or unterminated")
        else:
            for key in REQUIRED_KEYS:
                if not fm.get(key):
                    fails.append(f"item.md frontmatter missing `{key}`")

    domain, err = load_domain(folder)
    if domain is None:
        fails.append(err)
    else:
        stages = domain.get("stages") or {}
        spec = stages.get(stage)
        if spec is None:
            fails.append(f"domain `{domain.get('domain')}` declares no stage "
                         f"`{stage}` (has: {', '.join(sorted(stages)) or 'none'})")
        else:
            fails.extend(check_stage(folder, spec, stage))
        want_type = domain.get("type")
        if want_type and item.exists():
            fm = frontmatter(item) or {}
            if fm.get("type") and fm["type"] != want_type:
                fails.append(f"item.md type is `{fm['type']}` but this domain "
                             f"is `{want_type}` — wrong folder, or wrong type")

    for f in fails:
        print(f"FAIL  [item-check]  {f}")
    if not fails:
        print(f"ok    [item-check]  {folder.name} clean at stage {stage}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
