# Tasks: worktable UI (phase 2b, v2 — folio-fidelity, all views)

- [ ] T01 port pure view logic (calendar-grid, timeline-lanes, board-*, columns, field-infer) + unit tests
- [ ] T02 port leaf components (pill, group headers, distribution-bar, list-row, skeletons, slideover-shell, view-router)
- [ ] T03 table + grouped table, rebuilt lean (R02, A02)
- [ ] T04 kanban: ported board math + lean @dnd-kit/core shell, seal-gated (R03, A03)
- [ ] T05 calendar: ported grid + rewired renderer (R04, A04)
- [ ] T06 timeline: ported lanes + rewired renderer, zoom (R05, A05)
- [ ] T07 record panel rebuilt in slideover-shell (R06, A06)
- [ ] T08 integration: view-router, live/URL/auth, deps audit (R01, R07, R09)
- [ ] T09 independent security review (attested via review-check)
- [ ] T10 independent correctness/UX review vs folio (attested via review-check)
- [ ] T11 SUITE green (Playwright e2e, all views)

## Increment 2 — folio IA (sidebar tree + live controls), after shakeout feedback

Pure-frontend additions; no new writes (the seal stays the only write).
The create-from-UI / saved-filter-to-file features are parked in
docs/DEFERRED-UI.md. The reviews (T09/T10) and SUITE (T11) re-run on the
final tree to cover this increment.

- [ ] T12 rail project→view tree: views grouped by their `source` folder,
  collapsible, active-view highlight (R10, A09)
- [ ] T13 shared filter/group/sort control bar (folio FilterBar shape),
  ephemeral (URL-held, client-side over loaded records), reset on view
  switch (R11, A10)
