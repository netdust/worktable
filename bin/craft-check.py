#!/usr/bin/env python3
"""craft-check.py — every craft path a flow declares must exist.

    craft-check.py [flow.yaml ...]        (default: flows/*.yaml)

Invariant I5 says the quiet part out loud: a node's `craft` list is
prose to the driving agent, and *nothing mechanical notices when it is
skipped*. That is precisely why a craft path pointing at nothing is so
expensive — the agent reads `craft: [agents/reviewer]`, finds no such
file, and carries on with whatever it would have done anyway. No gate
fires. The flow still looks well-formed. The review just quietly
becomes an opinion.

This repo shipped in exactly that state: `agents/reviewer`,
`agents/implementer`, `skills/spec-authoring` and
`skills/testing-workflow` were declared by the flows and existed
nowhere.

So while the *use* of craft cannot be verified, its *existence* can,
and that is the half worth taking. A path resolves if it is a file, or
a directory holding SKILL.md / AGENT.md / README.md.

Exit 0 all resolve · 1 otherwise.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("FAIL  [craft-check]  PyYAML required (pip install pyyaml)")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
ENTRY_FILES = ("SKILL.md", "AGENT.md", "README.md")


def resolves(craft: str) -> bool:
    target = ROOT / craft
    if target.is_file():
        return True
    if target.suffix == "":
        if target.with_suffix(".md").is_file():
            return True
        if target.is_dir():
            return any((target / e).is_file() for e in ENTRY_FILES)
    return False


def main() -> int:
    paths = [Path(a) for a in sys.argv[1:]] or sorted(ROOT.glob("flows/*.yaml"))
    fails: list[str] = []
    checked = 0
    for path in paths:
        if not path.exists():
            fails.append(f"{path}: not found")
            continue
        doc = yaml.safe_load(path.read_text())
        if not isinstance(doc, dict):
            fails.append(f"{path.name}: top level must be a mapping")
            continue
        for node in doc.get("nodes", []) or []:
            if not isinstance(node, dict):
                continue
            for craft in node.get("craft") or []:
                checked += 1
                if not resolves(str(craft)):
                    fails.append(f"{path.name}: node `{node.get('id')}` "
                                 f"declares craft `{craft}`, which does not "
                                 f"exist — the agent will silently proceed "
                                 f"without it")

    for f in fails:
        print(f"FAIL  [craft-check]  {f}")
    if fails:
        return 1
    print(f"ok    [craft-check]  {checked} craft reference(s) resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
