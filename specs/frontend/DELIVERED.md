# Frontend (phase 2b) — SEALED FINAL

**Owner shakeout: approved** — 2026-07-24 (stefan@netdust.be).

The folio human layer over worktable, delivered through the `deliver`
flow and sealed at shakeout. (The durable seal is a git note on
`refs/notes/seal`; this file mirrors it because this host rejects
`refs/notes/*` pushes, so the note stays container-local.)

## What shipped

A lean React/Vite/TypeScript UI (`ui/`) speaking only the phase-2a
server API, in folio's design language:

- **Five views** via one exhaustive ViewType→renderer map — table,
  grouped list (distribution bar), kanban (@dnd-kit, seal-gated drag),
  calendar (month grid), timeline (Gantt, day/week/month zoom).
- **Record panel** — folder-as-one slideover: flow-ordered artifact
  tabs, reviews badge, and the seal actions (the only write).
- **Folio skin** — neutral monochrome palette, floating-card shell,
  Linear-style dot status pills, hairline density; light + dark.
- **Folio IA (increment 2)** — rail project→view tree (views grouped by
  source folder); shared filter/group/sort control bar, ephemeral
  (URL-held, client-side over loaded records). No new writes — the seal
  stays the only write.

## Discipline

- 13 tasks attested + SUITE green on the sealed HEAD (67 Playwright
  e2e/unit); ledger FINISHED.
- Two independent fresh-context reviews (security + correctness/UX),
  both CLEAN on the final tree. Reviews caught real defects in-run —
  most notably a HIGH ungroup bug a coincidental test was masking —
  each fixed and re-confirmed.
- Only new runtime dep: `@dnd-kit/core`.

## Deferred

Write-requiring folio features (saved filters into view files,
create-from-UI, per-project field/status registries, inline edit) are
parked in `docs/DEFERRED-UI.md` with costs and pick-up order; each must
preserve seal-only-write.
