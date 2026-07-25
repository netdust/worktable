#!/usr/bin/env python3
"""runtime-contract.py — every gate command our flows declare must be
UNDERSTOOD by the netdust-flow runtime we run against.

This exists because of a real, silent, production break:

  worktable's four finishing gates were updated to call
  `seal.py check <fd> <name> --fresh`. The netdust-flow on main had no
  `--fresh` flag. argparse rejects an unknown flag with **exit 2** —
  and every one of those flows routes `gate.exit == 2` as *rejected*.
  So a human's approval was read as a refusal and the record was sent
  back to `draft`, forever. No test failed. Nothing in either repo
  could see it, because the contract between them was prose in a doc
  that claimed the fix had shipped when it had not.

The check is deliberately narrow. It does NOT assert a gate passes —
gates are supposed to fail, that is their job. It asserts only that
the runtime PARSED the command: no `unrecognized arguments`, no usage
error, no missing file. A gate that runs and returns a red verdict is
a working gate; a gate that cannot be invoked is a broken contract.

    python3 tests/runtime-contract.py [--netdust-flow DIR]

Exit 0 all commands understood · 1 otherwise.
"""
from __future__ import annotations

import argparse
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDER_RE = re.compile(r"\{[A-Za-z_][A-Za-z0-9_]*\}")

# An argparse failure is the signature we are hunting: it always exits
# 2 and always says so on stderr. `2` alone is not enough — a seal gate
# legitimately exits 2 to mean `rejected`.
USAGE_MARKERS = ("unrecognized arguments", "invalid choice",
                 "the following arguments are required", "error: argument")

# Binds the human supplies when arming (`/flow`), not values this repo
# knows statically. A gate that needs one cannot be probed here; the
# arm step verifies them, and flow-lint --check-gates WARNs on them.
ARM_TIME_BINDS = {"gate_check_cmd", "test_suite_cmd"}


def scratch_repo(tmp: Path) -> Path:
    """A minimal, REAL worktable record in a REAL git repo: the gates
    talk to git notes, so a fixture that is not a repo would fail for
    the wrong reason and hide the one we care about."""
    repo = tmp / "repo"
    record = repo / "records" / "dossiers" / "contract-probe"
    (record / "reviews").mkdir(parents=True)
    (record / "item.md").write_text(
        "---\ntype: dossier\nstatus: reviewed\ncreated: 2026-01-01\n"
        "---\n\nprobe\n")
    (record / "research.md").write_text("# research\n" + "x" * 400 +
                                        "\nhttps://a.example\n"
                                        "https://b.example\nhttps://c.example\n")
    (record / "dossier.md").write_text(
        "## Summary\n\nprobe\n\n## Sources\n\nhttps://a.example\n"
        "https://b.example\nhttps://c.example\n")
    (record / "reviews" / "dossier.md").write_text("VERDICT: CLEAN\ntree: none\n")
    for args in (["init", "-b", "main"], ["config", "user.email", "t@t"],
                 ["config", "user.name", "t"], ["add", "-A"],
                 ["commit", "-m", "probe"]):
        subprocess.run(["git", *args], cwd=repo, capture_output=True)
    return repo


def gate_commands(flows: list[Path]) -> list[tuple[str, str, str]]:
    out = []
    for flow in flows:
        doc = yaml.safe_load(flow.read_text())
        for node in doc.get("nodes", []) or []:
            if node.get("kind") == "gate" and node.get("run"):
                out.append((flow.name, node["id"], str(node["run"])))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--netdust-flow", type=Path,
                    default=Path(os.environ.get(
                        "WORKTABLE_NETDUST_FLOW",
                        str(Path.home() / ".claude" / "netdust-flow"))))
    args = ap.parse_args()
    runtime = args.netdust_flow.expanduser().resolve()
    if not (runtime / "bin" / "seal.py").exists():
        print(f"FAIL  [contract]  no netdust-flow runtime at {runtime} "
              f"(set WORKTABLE_NETDUST_FLOW)")
        return 1

    flows = sorted(ROOT.glob("flows/*.yaml"))
    if not flows:
        print("FAIL  [contract]  no flows found")
        return 1

    fails: list[str] = []
    skipped: list[str] = []
    checked = 0
    with tempfile.TemporaryDirectory() as td:
        repo = scratch_repo(Path(td))
        feature = "records/dossiers/contract-probe"
        binds = {"worktable": str(ROOT), "netdust_flow": str(runtime),
                 "feature_dir": feature, "base_ref": "main"}
        for flow_name, node_id, run in gate_commands(flows):
            cmd = run
            for key, val in binds.items():
                cmd = cmd.replace("{" + key + "}", val)
            leftover = PLACEHOLDER_RE.search(cmd)
            if leftover:
                name = leftover.group(0).strip("{}")
                if name in ARM_TIME_BINDS:
                    skipped.append(f"{flow_name}:{node_id} (needs "
                                   f"{leftover.group(0)}, supplied at arm)")
                else:
                    fails.append(f"{flow_name}:{node_id} has unbound "
                                 f"placeholder {leftover.group(0)}")
                continue
            argv = shlex.split(cmd)
            if argv[0].endswith(".py"):
                argv = [sys.executable] + argv
            if not Path(argv[1] if argv[0] == sys.executable
                        else argv[0]).exists():
                fails.append(f"{flow_name}:{node_id} names a program that "
                             f"does not exist: {argv[1]}")
                continue
            p = subprocess.run(argv, cwd=repo, capture_output=True, text=True)
            checked += 1
            stderr = p.stderr.lower()
            if any(m in stderr for m in USAGE_MARKERS):
                first = p.stderr.strip().splitlines()[-1]
                fails.append(f"{flow_name}:{node_id} — the runtime does NOT "
                             f"understand this command: {first}")
            elif p.returncode == 2 and "usage:" in stderr:
                fails.append(f"{flow_name}:{node_id} — usage error (exit 2 "
                             f"is routed as `rejected` by the flow!)")

    for f in fails:
        print(f"FAIL  [contract]  {f}")
    if fails:
        print(f"contract: {checked} gate command(s) probed, {len(fails)} "
              f"not understood by {runtime}")
        return 1
    for s_ in skipped:
        print(f"skip  [contract]  {s_}")
    print(f"ok    [contract]  {checked} gate command(s) understood by "
          f"{runtime.name}"
          + (f", {len(skipped)} deferred to arm time" if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
