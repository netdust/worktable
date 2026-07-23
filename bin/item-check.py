#!/usr/bin/env python3
"""item-check.py — the record gate: frontmatter contract + stage
artifacts. Stdlib only; fails closed.

    item-check.py <record-folder> <stage>

  always      item.md exists; frontmatter parses; required core keys
              present (type, status, created). `status` is never
              judged here — that is the flow's business, not a file's
              claim about itself.
  research    research.md exists, is non-trivial, and carries at
              least 3 source references (http links) — sources or it
              didn't happen (AGENTS.md).
  draft       dossier.md exists with `## Summary` and `## Sources`
              sections, and its Sources section carries at least 3
              references. A dossier without sources is an opinion.

Exit 0 clean · 1 findings (FAIL lines on stdout).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

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

    if stage == "research":
        research = folder / "research.md"
        if not research.exists():
            fails.append("research.md missing")
        else:
            text = research.read_text()
            if len(text) < 300:
                fails.append("research.md is trivial (<300 chars)")
            if len(LINK_RE.findall(text)) < 3:
                fails.append("research.md carries <3 source links")
    elif stage == "draft":
        draft = folder / "dossier.md"
        if not draft.exists():
            fails.append("dossier.md missing")
        else:
            text = draft.read_text()
            for section in ("## Summary", "## Sources"):
                if section not in text:
                    fails.append(f"dossier.md missing `{section}` section")
            sources = text.split("## Sources", 1)[-1]
            if len(LINK_RE.findall(sources)) < 3:
                fails.append("dossier.md Sources section carries <3 references")
    else:
        fails.append(f"unknown stage `{stage}`")

    for f in fails:
        print(f"FAIL  [item-check]  {f}")
    if not fails:
        print(f"ok    [item-check]  {folder.name} clean at stage {stage}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
