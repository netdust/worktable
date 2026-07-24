#!/usr/bin/env python3
"""server.py — worktable phase 2a: a derived index over the folder,
plus the one guarded write (the owner's seal).

Contract: docs/SERVER.md · spec: specs/server/spec.md. One file,
stdlib only. The folder is the record; this process holds nothing
that is not derivable — kill it, delete nothing, restart, and every
response is identical (the survival test, R06).

  GET  /views                      view documents (name + definition)
  GET  /views/<name>               definition + matching records, grouped
  GET  /records/<domain>/<slug>    frontmatter, body, artifact list
  GET  /records/<domain>/<slug>/artifacts/<file>   one artifact, read-only
  GET  /events                     SSE invalidation ticks (no payloads)
  POST /seal                       {record, node, decision, note?} — THE write

Auth: every route requires `Authorization: Bearer $WORKTABLE_TOKEN`
(single owner principal, constant-time compare, 401 tells nothing).
Binds 127.0.0.1 by default — exposure is a deployment decision.

Env: WORKTABLE_TOKEN (required) · WORKTABLE_ROOT (default cwd) ·
WORKTABLE_PORT (default 8737) · WORKTABLE_HOST (default 127.0.0.1) ·
WORKTABLE_NETDUST_FLOW (default ~/.claude/netdust-flow).

Note on http.server: acceptable here precisely because the exposure
default is loopback and the server is stateless; fronting it with a
real proxy is deployment's problem, per spec R08.
"""
from __future__ import annotations

import hmac
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
DECISIONS = ("approved", "rejected")
POLL_SECONDS = 1.0
HEARTBEAT_SECONDS = 15.0


# ── the folder, read through (the index is a function, not a state) ──

def frontmatter(text: str) -> dict:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    fm: dict = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return fm
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return {}


def body_of(text: str) -> str:
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return text
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "".join(lines[i + 1:]).lstrip("\n")
    return text


def parse_list(raw: str) -> list[str]:
    """Accept every form a view definition uses: `[a, b]`, `a, b`,
    `a b`, `a`. The space form matters — `sort: updated desc` is the
    natural way to write it, and silently ignoring it was the HIGH
    correctness finding."""
    raw = (raw or "").strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    sep = "," if "," in raw else None  # None → split on any whitespace
    return [p.strip() for p in raw.split(sep) if p.strip()]


class Folder:
    """Read-through access to the worktable root. Every method derives
    its answer from the files at call time — nothing cached, nothing
    that can drift."""

    def __init__(self, root: Path):
        self.root = root.resolve()

    def _safe(self, folder: Path, name: str) -> Path | None:
        """One convergence point for path safety (R07): reject unsafe
        names outright, then verify the resolved path stays inside the
        folder — belt and braces, symlink escapes included."""
        if not name or "/" in name or "\\" in name or name.startswith("."):
            return None
        try:
            candidate = (folder / name).resolve()
            candidate.relative_to(folder.resolve())
        except ValueError:
            return None      # traversal escape OR embedded null byte etc.
        return candidate if candidate.is_file() else None

    def record_folder(self, domain: str, slug: str) -> Path | None:
        if not (SLUG_RE.match(domain) and SLUG_RE.match(slug)):
            return None
        folder = self.root / "records" / domain / slug
        return folder if (folder / "item.md").is_file() else None

    def record(self, domain: str, slug: str) -> dict | None:
        folder = self.record_folder(domain, slug)
        if folder is None:
            return None
        text = (folder / "item.md").read_text()
        artifacts = sorted(p.name for p in folder.iterdir()
                           if p.is_file() and p.name != "item.md"
                           and not p.name.startswith("."))
        reviews = folder / "reviews"
        return {
            "domain": domain, "slug": slug,
            "frontmatter": frontmatter(text), "body": body_of(text),
            "artifacts": artifacts,
            "reviews": len(list(reviews.glob("*.md"))) if reviews.is_dir() else 0,
        }

    def artifact(self, domain: str, slug: str, name: str) -> bytes | None:
        """Bytes, not text — artifacts may be binary (a PNG, a signed
        contract PDF). The caller sets content-type from the name."""
        folder = self.record_folder(domain, slug)
        if folder is None:
            return None
        path = self._safe(folder, name)
        return path.read_bytes() if path else None

    def flow(self, name: str) -> dict | None:
        """A flow definition, for the panel's tab ordering (nodes' out:
        sequence). Serves the compiled twin — the runtime artifact."""
        if not SLUG_RE.match(name):
            return None
        twin = self.root / "flows" / f"{name}.json"
        if not twin.is_file():
            return None
        try:
            return json.loads(twin.read_text())
        except Exception:
            return None

    def views(self) -> list[dict]:
        out = []
        views_dir = self.root / "views"
        if views_dir.is_dir():
            for path in sorted(views_dir.glob("*.md")):
                # listed names must be resolvable — same rule both sides,
                # so no listed-but-unreachable view (LOW finding)
                if not SLUG_RE.match(path.stem):
                    continue
                fm = frontmatter(path.read_text())
                if fm.get("type") == "view":
                    out.append({"name": path.stem, "definition": fm})
        return out

    def resolve_view(self, name: str) -> dict | None:
        if not SLUG_RE.match(name):
            return None
        view = next((v for v in self.views() if v["name"] == name), None)
        if view is None:
            return None
        fm = view["definition"]
        source = self.root / fm.get("source", "")
        records = []
        if source.is_dir():
            for rec_folder in sorted(p for p in source.iterdir()
                                     if p.is_dir()):
                item = rec_folder / "item.md"
                if not item.is_file():
                    continue
                reviews = rec_folder / "reviews"
                records.append({          # body-less by design (R01)
                    "domain": source.name, "slug": rec_folder.name,
                    "frontmatter": frontmatter(item.read_text()),
                    "artifacts": sorted(
                        p.name for p in rec_folder.iterdir()
                        if p.is_file() and p.name != "item.md"
                        and not p.name.startswith(".")),
                    "reviews": (len(list(reviews.glob("*.md")))
                                if reviews.is_dir() else 0),
                })
        sort = parse_list(fm.get("sort", "")) or ["updated", "desc"]
        key, desc = sort[0], len(sort) > 1 and sort[1] == "desc"
        records.sort(key=lambda r: str(r["frontmatter"].get(key, "")),
                     reverse=desc)
        group_by = fm.get("group_by", "")
        groups: list[dict] = []
        if group_by:
            seen: dict[str, list[str]] = {}
            for r in records:
                seen.setdefault(str(r["frontmatter"].get(group_by, "—")),
                                []).append(r["slug"])
            groups = [{"value": v, "records": slugs}
                      for v, slugs in seen.items()]
        return {"name": name, "definition": fm,
                "records": records, "groups": groups}

    def fingerprint(self) -> str:
        """Cheap change detector for the watcher: mtimes+sizes of every
        file under records/ and views/."""
        parts = []
        for base in (self.root / "records", self.root / "views"):
            if base.is_dir():
                for p in sorted(base.rglob("*")):
                    if p.is_file():
                        st = p.stat()
                        parts.append(f"{p}:{st.st_mtime_ns}:{st.st_size}")
        return str(hash("|".join(parts)))


# ── the watcher: change → generation bump → SSE ticks ────────────────

class Watcher(threading.Thread):
    def __init__(self, folder: Folder):
        super().__init__(daemon=True)
        self.folder = folder
        self.generation = 0
        self.cond = threading.Condition()

    def run(self) -> None:
        last = self.folder.fingerprint()
        while True:
            time.sleep(POLL_SECONDS)
            now = self.folder.fingerprint()
            if now != last:
                last = now
                with self.cond:
                    self.generation += 1
                    self.cond.notify_all()


# ── the one write ────────────────────────────────────────────────────

def record_seal(folder: Folder, netdust_flow: Path,
                payload: dict) -> tuple[int, dict]:
    rec = str(payload.get("record", ""))
    node = str(payload.get("node", ""))
    decision = str(payload.get("decision", ""))
    note = str(payload.get("note", "") or "")
    if decision not in DECISIONS:
        return 400, {"error": "decision must be approved or rejected"}
    parts = rec.strip("/").split("/")
    if len(parts) != 2 or not SLUG_RE.match(node):
        return 400, {"error": "record must be <domain>/<slug>; node required"}
    target = folder.record_folder(parts[0], parts[1])
    if target is None:
        return 404, {"error": "no such record"}
    feature_dir = target.relative_to(folder.root).as_posix()
    argv = [sys.executable, str(netdust_flow / "bin" / "seal.py"), "record",
            feature_dir, node, decision]
    if note:
        argv += ["--note", note]
    p = subprocess.run(argv, capture_output=True, text=True,
                       cwd=str(folder.root), timeout=30)
    if p.returncode != 0:
        return 502, {"error": "seal not recorded",
                     "detail": p.stdout.strip()[:200]}
    return 200, {"sealed": True, "record": rec, "node": node,
                 "decision": decision, "detail": p.stdout.strip()}


# ── HTTP ─────────────────────────────────────────────────────────────

def make_handler(folder: Folder, watcher: Watcher, token: str,
                 netdust_flow: Path):

    class Handler(BaseHTTPRequestHandler):
        server_version = "worktable/2a"

        def log_message(self, *args) -> None:  # no request logging of paths
            pass                               # (records are the owner's)

        def _authed(self) -> bool:
            supplied = self.headers.get("Authorization", "")
            expected = "Bearer " + token
            return hmac.compare_digest(supplied.encode(), expected.encode())

        def _json(self, code: int, payload: dict) -> None:
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _deny(self) -> None:
            self._json(401, {"error": "unauthorized"})

        def do_GET(self) -> None:
            if not self._authed():
                return self._deny()
            try:
                self._route_get()
            except Exception:      # every malformed input is a 404/500,
                self._safe_500()   # never a dropped connection (R07)

        def _route_get(self) -> None:
            seg = [unquote(s) for s in self.path.split("?")[0].split("/")
                   if s != ""]
            if seg == ["views"]:
                return self._json(200, {"views": folder.views()})
            if len(seg) == 2 and seg[0] == "views":
                view = folder.resolve_view(seg[1])
                return self._json(200, view) if view else \
                    self._json(404, {"error": "no such view"})
            if len(seg) == 2 and seg[0] == "flows":
                doc = folder.flow(seg[1])
                return self._json(200, doc) if doc else \
                    self._json(404, {"error": "no such flow"})
            if len(seg) == 3 and seg[0] == "records":
                rec = folder.record(seg[1], seg[2])
                return self._json(200, rec) if rec else \
                    self._json(404, {"error": "no such record"})
            if len(seg) == 5 and seg[0] == "records" and seg[3] == "artifacts":
                body = folder.artifact(seg[1], seg[2], seg[4])
                if body is None:
                    return self._json(404, {"error": "no such artifact"})
                ctype = mimetypes.guess_type(seg[4])[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if seg == ["events"]:
                return self._events()
            self._json(404, {"error": "not found"})

        def _safe_500(self) -> None:
            try:
                self._json(500, {"error": "internal error"})
            except Exception:
                pass  # response already partly sent; connection closes

        def _events(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            gen = watcher.generation
            try:
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
                while True:
                    with watcher.cond:
                        changed = watcher.cond.wait_for(
                            lambda: watcher.generation != gen,
                            timeout=HEARTBEAT_SECONDS)
                        gen = watcher.generation
                    if changed:
                        self.wfile.write(b"event: change\ndata: {}\n\n")
                    else:
                        self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return

        def do_POST(self) -> None:
            if not self._authed():
                return self._deny()
            if self.path.split("?")[0] != "/seal":
                return self._json(404, {"error": "not found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(payload, dict):
                    raise ValueError
            except Exception:
                return self._json(400, {"error": "invalid JSON body"})
            try:
                code, out = record_seal(folder, netdust_flow, payload)
            except subprocess.TimeoutExpired:
                code, out = 504, {"error": "seal timed out"}
            except Exception:
                return self._safe_500()
            self._json(code, out)

    return Handler


def main() -> int:
    token = os.environ.get("WORKTABLE_TOKEN", "")
    if not token:
        print("server: WORKTABLE_TOKEN is required (the owner is the "
              "only principal) — refusing to start without auth")
        return 1
    root = Path(os.environ.get("WORKTABLE_ROOT", ".")).resolve()
    host = os.environ.get("WORKTABLE_HOST", "127.0.0.1")
    port = int(os.environ.get("WORKTABLE_PORT", "8737"))
    netdust_flow = Path(os.environ.get(
        "WORKTABLE_NETDUST_FLOW",
        str(Path.home() / ".claude" / "netdust-flow"))).expanduser()

    folder = Folder(root)
    watcher = Watcher(folder)
    watcher.start()
    httpd = ThreadingHTTPServer(
        (host, port), make_handler(folder, watcher, token, netdust_flow))
    httpd.daemon_threads = True
    print(f"worktable server: {host}:{httpd.server_address[1]} "
          f"root={root} (derived; safe to kill at any time)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
