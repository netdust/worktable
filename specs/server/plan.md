# Plan: worktable server (phase 2a)

Loop budget: ~12

## Approach

One file, Python stdlib only: `server.py` at the repo root —
http.server ThreadingHTTPServer + a polling folder watcher (mtime
scan; SSE clients notified on change). Frontmatter parsing reuses the
same naive parser the gates use (one grammar everywhere). Tests are a
dependency-free suite (`tests/server-tests.py`) that boots the server
on an ephemeral port against a fixture folder and exercises every
requirement over real HTTP — including the survival test and the
auth/traversal floors. Reviews are ledger tasks, attested tree-bound
via review-check (I5).

## Threat model (floor-class: auth + user input)

The token is the only principal: constant-time comparison, required
on every route, 401 reveals nothing. Path handling is the input
surface: every file access resolves under the served root or 404s —
no traversal, no symlink escape. The seal endpoint shells to seal.py
as argv (no shell), decision whitelisted. Server binds 127.0.0.1 by
default; TLS/exposure is deployment's problem, stated in the spec.

## Tasks

- T01 scaffold: server.py skeleton — config (root, port, token from
  env), auth middleware, JSON responses, 404/401/400 helpers.
  Check: `--only=scaffold`
- T02 index + records: folder scan → records index; /records and
  /records/…/artifacts endpoints with path safety (R02, R07).
  Check: `--only=records`
- T03 views: view-document parsing + query resolution (filter by
  source, group_by, sort, columns) → /views endpoints (R01, A01).
  Check: `--only=views`
- T04 events + watch: mtime watcher thread + SSE endpoint emitting
  ticks (R03, A03). Check: `--only=events`
- T05 seal: POST /seal → seal.py record via argv, decision whitelist,
  results readable by seal.py check (R04, A04). Check: `--only=seal`
- T06 floors: auth everywhere + traversal suite + survival test
  (R05-R07, A05-A07). Check: `--only=floors`
- T07 independent security review (attested via review-check).
  Check: `python3 bin/review-check.py specs/server security`
- T08 independent correctness review vs spec (attested via
  review-check). Check: `python3 bin/review-check.py specs/server correctness`
- T09 SUITE green end-to-end. Check: `python3 tests/server-tests.py`

## Acceptance matrix

| Acceptance | Verified by |
|---|---|
| A01 | T03 |
| A02 | T02 |
| A03 | T04 |
| A04 | T05 |
| A05-A07 | T06 |
