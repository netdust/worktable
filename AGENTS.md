# AGENTS.md — operating manual

You are the primary user of this system. It has no UI for you and
never will: the folder is the interface, these conventions are the
contract, and the flow runtime enforces what conventions cannot.

## The rules that are enforced (don't test them)

1. **You never move `status`.** A record's `status` frontmatter is
   written only by a gated flow step. Editing it directly is the
   checkbox mistake: the ledger ignores assertions, and drift will be
   caught and reverted. Same for `run`.
2. **You never write evidence.** `git notes` (attest/seal refs), the
   run journal (`.flow-journal.jsonl`), the marker
   (`tasks/.harness-loop.json`), and compiled flow twins are
   verifier-owned. Run checks through `attest.py`; record nothing
   yourself.
3. **You never finish.** Flows end at gates and seals. Do the node
   you're on; stop; the walker decides what's next.
4. **Reviews are evidence (I5).** A review you performed inline is
   craft, not evidence. Evidence is a fresh-context reviewer's
   verdict, tree-bound, checked by `review-check.py`, attested.

## The conventions you follow

- **One item = one folder** under `records/<domain>/<slug>/` with
  `item.md` (frontmatter core: type, status, run, created, updated +
  domain fields). Stage artifacts live beside it (`research.md`,
  `dossier.md`, …). Never delete an artifact; supersede it.
- **Write content freely** in artifact bodies and `item.md` bodies —
  that is your workspace. Keep frontmatter keys `snake_case`; dates
  ISO (`2026-07-21`).
- **Sources or it didn't happen:** any factual claim in an artifact
  carries its source (link or file ref). Gates check this; reviewers
  refute unsourced claims.
- **Views** live in `views/*.md` — a fenced query block over
  frontmatter plus a rendering hint. You may create or refine views;
  they are wallpaper and cannot change any record.
- **Flows** live in `flows/*.yaml` (netdust-flow format). You may
  PROPOSE flow changes as diffs for the human to seal; you never
  edit a flow that is currently driving an armed run, and compiled
  `.json` twins are written only by a green `flow-lint --compile`.

## Working a run

The runtime is netdust-flow (symlinked at `~/.claude/netdust-flow`).
A run is armed by the human (`/flow <record-folder> <flow>`); the
Stop hook then drives you: each stop, the walker names the node to
work. Work ONLY that node, with its declared craft. Blocked on a
human node means exactly that — surface the question and stop;
resuming never approves anything.

## Improving the system

You are expected to make this system better: sharper gate scripts,
richer views, tighter schemas, clearer conventions — proposed as
ordinary changes, gated and sealed like everything else. The run
ledger and eval decide what improved; opinions don't.
