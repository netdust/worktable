# Review: fix/plugin-actions-when (b2237c6..7a35fb7)

Reviewer: fresh general-purpose reviewer (Opus), read-only. It ran `bun test packages scripts` (2478 pass), the grid vitest suites it touched (214 pass) and `bun run check` (green).
Findings: 0 Blocking · 1 Should fix · 4 Note

## Should fix
- docs/SPEC.md:65 says a selectable query offers only selection actions without `conditional`, which contradicts Grid.tsx:128 (skips actions pass too). SPEC:94 doesn't say that a query's rows carry no marks, so there the skip action always shows and the server judges the run. A later client or refactor could drop skips actions on queries again.

## Notes
- specs/CHECKS.md:258-263: the rows carry "pending 2026-10-27" instead of a commit sha.
- packages/studio/src/actions.ts:28-45: on a query, a plugin action on only gone sites reads the generic "Geen van deze rijen komt in aanmerking." instead of the registry reason (follows from ruling 1).
- icons.ts:20 / declare.ts:21: 'undo' also appears in the table-icon picker (as 'log-in' did before). Harmless.
- Grid.tsx:374: a ticked id missing from state.rows keeps a skips action shown. This is the safe direction, since the engine refuses and the bar words it.
