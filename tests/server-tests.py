#!/usr/bin/env python3
"""server-tests.py — the worktable server suite. Stdlib only.

Boots the REAL server (subprocess) on a free port against a fixture
folder (its own git repo, so seals work), and exercises every spec
requirement over actual HTTP. Groups double as task checks:

    python3 tests/server-tests.py [--only=scaffold|records|views|events|seal|floors]

Exit 0 all green · 1 failures (FAIL lines on stdout).
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NETDUST_FLOW = Path(os.environ.get("WORKTABLE_NETDUST_FLOW",
                                   "/home/user/netdust-flow"))
TOKEN = "test-token-123"

checks = 0
fails: list[str] = []
only = None
for arg in sys.argv[1:]:
    if arg.startswith("--only="):
        only = arg.split("=", 1)[1]


def check(cond: bool, msg: str) -> None:
    global checks
    checks += 1
    if not cond:
        fails.append(msg)
        print(f"FAIL  [suite]  {msg}")


# ── fixture + server lifecycle ───────────────────────────────────────

def build_fixture(base: Path) -> Path:
    root = base / "fixture"
    demo = root / "records" / "dossiers" / "demo"
    demo.mkdir(parents=True)
    (demo / "item.md").write_text(
        "---\ntype: dossier\nstatus: final\nrun: r-test\n"
        "created: 2026-07-24\nupdated: 2026-07-24\n---\n\nDemo record.\n")
    (demo / "research.md").write_text("# research\n\nsourced things\n")
    other = root / "records" / "dossiers" / "open-one"
    other.mkdir(parents=True)
    (other / "item.md").write_text(
        "---\ntype: dossier\nstatus: new\ncreated: 2026-07-24\n"
        "updated: 2026-07-23\n---\n")
    (root / "views").mkdir()
    (root / "views" / "pipeline.md").write_text(
        "---\ntype: view\nview: table\nsource: records/dossiers\n"
        "group_by: status\ncolumns: [status, updated]\nsort: updated desc\n"
        "---\n\n# pipeline\n")
    (root / "secret-outside.md").write_text("must never be served via artifacts\n")
    for args in (["init", "-qb", "main"],
                 ["config", "user.email", "t@t"],
                 ["config", "user.name", "t"],
                 ["add", "-A"],
                 ["commit", "-qm", "fixture"]):
        subprocess.run(["git", *args], cwd=root, capture_output=True)
    return root


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server(root: Path, port: int) -> subprocess.Popen:
    env = dict(os.environ, WORKTABLE_TOKEN=TOKEN, WORKTABLE_ROOT=str(root),
               WORKTABLE_PORT=str(port),
               WORKTABLE_NETDUST_FLOW=str(NETDUST_FLOW))
    p = subprocess.Popen([sys.executable, str(ROOT / "server.py")], env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            get("/views", port)
            return p
        except Exception:
            time.sleep(0.1)
    p.kill()
    raise RuntimeError("server did not come up")


def request(path: str, port: int, method: str = "GET", body: dict | None = None,
            token: str | None = TOKEN, raw: bool = False):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}",
                                 method=method)
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=data, timeout=10) as resp:
        payload = resp.read()
        return resp.status, (payload if raw else json.loads(payload))


def get(path: str, port: int, **kw):
    return request(path, port, **kw)


def status_of(exc_or_call) -> int:
    try:
        return exc_or_call()[0]
    except urllib.error.HTTPError as e:
        return e.code


# ── the suite ────────────────────────────────────────────────────────

def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="worktable-suite-"))
    try:
        root = build_fixture(tmp)
        port = free_port()
        proc = start_server(root, port)
        try:
            run_groups(root, port, proc, tmp)
        finally:
            proc.kill()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"suite: {checks} checks, {len(fails)} failure(s)"
          + (f" [--only={only}]" if only else ""))
    return 1 if fails else 0


def run_groups(root: Path, port: int, proc, tmp: Path) -> None:
    def group(name):
        return only is None or only == name

    if group("scaffold"):
        check(status_of(lambda: get("/views", port, token=None)) == 401,
              "no token must 401")
        check(status_of(lambda: get("/views", port, token="wrong")) == 401,
              "wrong token must 401")
        code, data = get("/views", port)
        check(code == 200 and "views" in data, "authed /views answers JSON")
        check(status_of(lambda: get("/nope", port)) == 404, "unknown route 404")

    if group("records"):
        code, rec = get("/records/dossiers/demo", port)
        check(code == 200 and rec["frontmatter"]["status"] == "final",
              "record carries frontmatter (A02)")
        check(rec["body"].strip() == "Demo record.", "record carries body")
        check(rec["artifacts"] == ["research.md"],
              "artifacts listed, item.md excluded (A02)")
        code, content = get("/records/dossiers/demo/artifacts/research.md",
                            port, raw=True)
        check(b"sourced things" in content, "artifact fetchable (A02)")
        check(status_of(lambda: get("/records/dossiers/ghost", port)) == 404,
              "unknown record 404")

    if group("views"):
        code, listing = get("/views", port)
        check([v["name"] for v in listing["views"]] == ["pipeline"],
              "view documents listed (R01)")
        code, view = get("/views/pipeline", port)
        slugs = [r["slug"] for r in view["records"]]
        check(slugs == ["demo", "open-one"],
              "records sorted by updated desc (R01)")
        check(all("body" not in r for r in view["records"]),
              "view records are body-less (R01)")
        final = next((g for g in view["groups"] if g["value"] == "final"), None)
        check(final is not None and final["records"] == ["demo"],
              "grouped under final (A01)")
        check(status_of(lambda: get("/views/ghost", port)) == 404,
              "unknown view 404")

    if group("events"):
        import http.client
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        conn.request("GET", "/events",
                     headers={"Authorization": f"Bearer {TOKEN}"})
        resp = conn.getresponse()
        check(resp.status == 200, "SSE endpoint answers")
        first = resp.fp.readline()
        check(first.startswith(b":"), "SSE opens with a comment frame")
        (root / "records" / "dossiers" / "demo" / "note.md").write_text("x\n")
        got_change = False
        deadline = time.time() + 5
        while time.time() < deadline:
            line = resp.fp.readline()
            if b"event: change" in line:
                got_change = True
                break
        check(got_change, "file change produces an SSE tick (A03)")
        conn.close()
        (root / "records" / "dossiers" / "demo" / "note.md").unlink()

    if group("seal"):
        code, out = request("/seal", port, method="POST",
                            body={"record": "dossiers/demo", "node": "test-node",
                                  "decision": "approved", "note": "via API"})
        check(code == 200 and out.get("sealed") is True,
              "seal records via the API (A04)")
        p = subprocess.run(
            [sys.executable, str(NETDUST_FLOW / "bin" / "seal.py"), "check",
             "records/dossiers/demo", "test-node"],
            cwd=root, capture_output=True, text=True)
        check(p.returncode == 0, "seal.py check reads the API-recorded seal (A04)")
        check(status_of(lambda: request(
            "/seal", port, method="POST",
            body={"record": "dossiers/demo", "node": "n2",
                  "decision": "maybe"})) == 400,
              "bad decision is a 400 (R04)")
        p = subprocess.run(
            [sys.executable, str(NETDUST_FLOW / "bin" / "seal.py"), "check",
             "records/dossiers/demo", "n2"],
            cwd=root, capture_output=True, text=True)
        check(p.returncode == 1, "rejected request recorded nothing (A04)")
        check(status_of(lambda: request(
            "/seal", port, method="POST",
            body={"record": "dossiers/ghost", "node": "n",
                  "decision": "approved"})) == 404,
              "seal on unknown record 404s")

    if group("floors"):
        for path in ("/records/dossiers/demo/artifacts/..%2Fitem.md",
                     "/records/dossiers/demo/artifacts/..%2F..%2F..%2Fsecret-outside.md",
                     "/records/dossiers/demo/artifacts/.hidden",
                     "/records/../dossiers/demo"):
            check(status_of(lambda p=path: get(p, port)) == 404,
                  f"traversal 404s: {path} (A07)")
        check(status_of(lambda: request(
            "/seal", port, method="POST", token="wrong",
            body={"record": "dossiers/demo", "node": "n3",
                  "decision": "approved"})) == 401,
              "seal without valid token 401s (A05)")
        p = subprocess.run(
            [sys.executable, str(NETDUST_FLOW / "bin" / "seal.py"), "check",
             "records/dossiers/demo", "n3"],
            cwd=root, capture_output=True, text=True)
        check(p.returncode == 1, "unauthorized seal recorded nothing (A05)")
        # survival test (A06): kill, restart fresh process, identical answer
        _, before = get("/views/pipeline", port)
        port2 = free_port()
        proc2 = start_server(root, port2)
        try:
            _, after = get("/views/pipeline", port2)
            check(before == after,
                  "restart yields identical view response (A06)")
        finally:
            proc2.kill()

    # env floor: the server refuses to start without a token (R05)
    if group("scaffold"):
        env = dict(os.environ, WORKTABLE_ROOT=str(root))
        env.pop("WORKTABLE_TOKEN", None)
        p = subprocess.run([sys.executable, str(ROOT / "server.py")],
                           env=env, capture_output=True, text=True, timeout=10)
        check(p.returncode == 1 and "TOKEN" in p.stdout,
              "refuses to start without a token (R05)")


if __name__ == "__main__":
    sys.exit(main())
