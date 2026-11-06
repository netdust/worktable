# Feature review — editable-board

Reviewed: origin/feature/editable-board, 0898010..96936bd (27 files, +1046 −124), against specs/editable-board/plan.md (Threat model, Review Focus), specs/work-model/spec.md R3 board row with the 2026-11-06 rulings, docs/SPEC.md. Reviewers: superpowers' code reviewer (opus) and security-sentinel (opus), on a detached checkout of the head. No ARCHITECTURE-INVARIANTS.md. Neither ran tests or the gate.

Both: the engine stays the sole authority (servedLifecycle filters with the same role predicate as allowed(); the 422 backstop is tested); /schema leaks no other role's transitions, no `when`, no buttons; query boards send one mapped field, never a position; create undo reaches only the actor's own batch; no new SQL; every Review Focus bullet is pinned and every task has RED evidence; no existing board regresses (Studio Per status, Per fase, Opdrachten, Op tafel; theatre toewijzing).

## Blocking
None.

## Should fix

**S1. A query board previews a reorder it will never write** — apps/grid/src/board/useBoardDrag.ts:166-172 (collide, own-lane branch), :183-190 (step). Code reviewer Important 1. On a sorted query board the own lane still aims at the nearest card: the cards slide apart and ↑/↓ announces "plaats 3 van 3", then the drop is `none` and they snap back — a dead end. Fix: when `sorted` and the lane is the card's own, aim at the card's own place (`aim({lane: from.lane, index: from.index})`, `last.current = []`, `return []`) and keep `index = from.index` in `step`. RED first: lift a card on a query board, press ↓, the announcement still says "plaats 1".

**S2. docs/SPEC.md contradicts the build** — :96 (Lifecycle: "`/schema` serves `lifecycle: { column }`", "Grids hide no transition") and :98 ("`/schema` does not list the transitions"). Code reviewer Important 2. Fix: both paragraphs say `/schema` serves `lifecycle.transitions` ({from, to}, the viewer's role's only) and the board offers only the lanes they reach; other surfaces still send the write and show the refusal; the server judges.

**S3. "+" on a greyed lane (decision — Stefan ruled 2026-11-06: hide it)** — apps/grid/src/board/Board.tsx:84, apps/grid/src/ui/App.tsx:488-490. Security Low 1. On a lifecycle board (own or through `writes`) "+" was offered on every lane, so an editor could create a row straight into a state they cannot reach by drag, firing its entry hook (theatre toewijzing `uitgenodigd` mints a token and mails an invite). Stefan's ruling: on a lifecycle board "+" shows only on lanes reachable as a first state — a transition whose `from` is `'*'` (or that lists no prior state, if the declaration form allows it; check declare.ts) reaches the lane; on a board without a lifecycle every lane keeps "+". The API is unchanged (a create may still set any option by POST). This replaces ruling P9's "the '+' stays on a greyed column". Edit specs/work-model/spec.md (the 2026-11-06 board ruling paragraph) and docs/SPEC.md (Work model, Board) to say so. RED first in Board.test.tsx (theatre-like fixture: "+" absent on unreachable lanes, present on a `'*'`-reachable lane, present on every lane of a plain options board).

## Note (fix where marked)

- **N1 (fix). `updateThrough` drops keys after the first silently** — apps/grid/src/api.ts:329. Throw `read_only` when more than one key is sent. (security Low 4)
- **N2 (fix). Target id unencoded in the URL path** — apps/grid/src/api.ts:337. `encodeURIComponent(String(target))`. (security Low 3)
- **N3 (fix). Explicit `expect` through a query is keyed by the target field** — one line in the doc comment above `update`. (code Minor)
- **N4 (fix). `boardCreates` inside Workspace** — apps/grid/src/ui/App.tsx:487-490: move it beside `canSet`/`draggable` at module level; rename `owner` at :773-774 to `made` and reuse it at :770. (code Minor; ui-code-has-a-place)
- **N5 (fix). CHECKS.md :152-153 name `dbb2e0c`**, which lacks the tests; name e328ff1. (code Minor)
- **N6 (fix). board.css :102-105** — one selector form for head and cards; with S3 the "+" on a greyed lane is gone anyway. (code Minor)
- **N7 (recorded). Stale-drop guard skipped when the query row shows null or ''** — api.ts:335-336; a `writes` column on a lifecycle field must project the raw state. Deferred: no query does otherwise today. (security Low 2)
- **N8 (recorded). Test gaps the coder deferred**: no RED witness for canSet-through-writes; no unit test for ← skipping or the stay branch; a query-board snap-back test that cannot fail; no service-created target test; the 500 ms negative wait in `stays()`. The reviewer agrees they are minor.
- **N9 (recorded, outside the diff). writes.ts:831 lets any account undo a batch whose actor is SYSTEM_OWNER**, guarded only by its kind; confirm seed/import batches never carry write/action/undo kinds. Not this branch.

## Declined to judge (code reviewer)
Per-row `available`/`when` on drag (deferred); inherited-lookup group column (deferred); a query whose target is not served (deferred, display only); drag gated on the query's writable rather than the target's (plan-sanctioned, engine refuses); calendar/timeline/gallery/grid drag (own plans); no explanation on a greyed drop (design question); shake-out flows (after review); the composite gate (a process ruling); the pre-existing Biome warning.

Findings: 0 Blocking · 3 Should fix · 9 Note
