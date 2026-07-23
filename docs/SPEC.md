# worktable — founding spec

**One sentence:** agents work records through flows; gates and seals
decide what advances; views are the human layer over the files —
including the flow runs themselves, which are records too.

## The four primitives

1. **Records** — one item is one folder under `records/<domain>/`.
   `item.md` carries the small structured core in frontmatter; stage
   artifacts (research.md, dossier.md, contract.pdf, …) accumulate
   beside it. Git history is provenance; nothing is overwritten-and-
   lost. The lineage of an item IS its folder filling up.
2. **Flows** — declared YAML graphs (netdust-flow format: agent /
   gate / human nodes, machine-readable edges, compiled twins). A
   flow is the only thing that moves a record's `status`.
3. **Gates & seals** — deterministic checks produce evidence (exit
   codes, attest notes, tree-bound review verdicts); humans produce
   recorded seals. netdust-flow's invariants I1–I5 apply unchanged:
   no assertion is a signal — not an agent's claim, not a checkbox,
   not a resumed session, not "the reviewer ran."
4. **Views** — documents containing a query over frontmatter plus a
   rendering hint (table, grouped table, kanban, calendar, timeline).
   Anything that renders them — Obsidian, GitHub, a future frontend —
   is wallpaper: derived, disposable, never authoritative.

## The record contract

Frontmatter core (every `item.md`):

    type:       <domain type, e.g. dossier | lead | article | venue>
    status:     <flow-owned; agents and humans never edit directly>
    run:        <flow run id that last moved status>
    created:    <date>
    updated:    <date>

Everything else is the open bag — domain fields, freely extensible.
This is deliberately the shape folio's proven view layer consumes
(fixed tiny core + open frontmatter + optional body; see
`docs/folio-view-harvest.md`), so the phase-2 frontend renders it
without translation.

## Authority

- Agents write artifact content freely — the folder is their
  workspace, and they are the primary user.
- `status` and decision records move only via gated flow steps,
  stamped with the run id.
- Humans seal irreversible or judgment-bearing transitions
  (send, publish, confirm, final). `seal.py record` on explicit
  say-so only; resumption is never approval.
- Evidence stores: git notes (attest/seal), the run journal, git
  history itself. Views may be wrong for a moment; the record may
  never be.

## Domains are folders, not features

Adding a domain = adding files: a record schema (checked by
`bin/item-check.py`), a flow, gate scripts where the domain has
mechanical checks, views. Zero kernel changes. Planned domains:
dossiers (first), leads/outreach, articles/newsletter, theater-tour
production. "And more of course."

## Phases

- **Phase 1 (now): no frontend, no server.** Claude Code + the
  netdust-flow Stop hook is the whole runtime. Humans see views via
  anything that renders markdown; flow runs are visible as generated
  reports (records themselves).
- **Phase 2: the human layer.** A lean frontend for people who don't
  live in the terminal: file-backed source feeding the record
  contract; table / grouped table / kanban / calendar / timeline.
  Built new, guided by `docs/folio-view-harvest.md` — carry the ten
  harvested design decisions and the pure layout modules; carry none
  of the DB-era write machinery. Read-mostly: body edits may sync
  back; status never moves from a view.
- **Adapt the flow runtime only when a real trigger fires** (timers
  for outreach follow-ups will be the first).

## What is deliberately absent

Databases as truth, servers in phase 1, agent-designed flows,
self-modifying policy, view-writable status. The human measurement
loop (netdust-flow's run ledger and eval) is part of the
architecture here too: domains improve because runs are measured and
a human edits the definitions.
