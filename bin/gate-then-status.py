#!/usr/bin/env python3
"""gate-then-status.py — compose a gate with the flow-owned status write.

Run 0001 finding: the dossier flow's gates verified artifacts but
nothing mechanically moved `status` — the convention said "only flows
move status" while the flow had no writer. This wrapper closes that:

    gate-then-status.py <record-folder> <new-status>
        [--seal <name>] -- <check cmd...>

Runs the check with stdout passing straight through (the walker reads
gate output). On exit 0, writes into <record-folder>/item.md
frontmatter: status=<new-status>, run=<run id from the marker, when
armed>, updated=<today> — then propagates the exit code. On a red
check, nothing is written. A green check whose status write fails is
a FAIL (exit 1): a transition that half-happened must not pass.

`--seal <name>` marks the record as awaiting a human decision at the
named seal: on green it writes `awaiting_seal: <name>` into the
frontmatter; any status write WITHOUT --seal clears it (empty). This
is the flow-owned signal the UI reads to show Approve/Reject — a
record is awaiting a seal because the flow parked it there, never
because a field was hand-authored (run 0003 correctness finding: the
seal must derive from real flow state, not a fixture-only field).

The verifier stays a verifier; the mutation is the walker's, under
the flow. Agents and humans never touch `status` by hand.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

MARKER = Path("tasks/.harness-loop.json")


def set_fm(item: Path, updates: dict) -> bool:
    lines = item.read_text().splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return False
    out, in_fm, seen = [], True, set()
    for i, line in enumerate(lines):
        if i == 0:
            out.append(line)
            continue
        if in_fm and line.strip() == "---":
            for key, value in updates.items():
                if key not in seen:
                    out.append(f"{key}: {value}\n")
            in_fm = False
            out.append(line)
            continue
        if in_fm:
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):", line)
            if m and m.group(1) in updates:
                seen.add(m.group(1))
                out.append(f"{m.group(1)}: {updates[m.group(1)]}\n")
                continue
        out.append(line)
    if in_fm:
        return False  # unterminated frontmatter
    item.write_text("".join(out))
    return True


def main() -> int:
    argv = sys.argv[1:]
    if "--" not in argv or argv.index("--") < 2:
        print("FAIL  [gate-then-status]  usage: <record-folder> <status> "
              "[--seal <name>] -- <cmd...>")
        return 1
    split = argv.index("--")
    head = argv[:split]
    folder, status = Path(head[0]), head[1]
    seal_name = ""
    if "--seal" in head:
        i = head.index("--seal")
        if i + 1 < len(head):
            seal_name = head[i + 1]
    cmd = argv[split + 1:]
    if cmd and cmd[0].endswith(".py"):
        cmd = [sys.executable] + cmd

    rc = subprocess.run(cmd).returncode
    if rc != 0:
        return rc

    # awaiting_seal is flow-owned derived state: set when this gate
    # parks the record at a human node, cleared by every other status
    # write. The UI reads it to show Approve/Reject — never a
    # hand-authored field (run 0003 finding).
    updates = {"status": status, "updated": date.today().isoformat(),
               "awaiting_seal": seal_name}
    try:
        run_id = json.loads(MARKER.read_text()).get("run_id")
        if run_id:
            updates["run"] = run_id
    except Exception:
        pass  # not armed (e.g. standalone check) — keep the existing run
    if not set_fm(folder / "item.md", updates):
        print(f"FAIL  [gate-then-status]  check passed but could not write "
              f"status `{status}` to {folder}/item.md — failing closed")
        return 1
    print(f"status: {folder.name} -> {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
