# Feature review: react-aria

- **Range:** `56240dd..365d54e`, from the merge-base with origin/main to the branch head. The range also carries the unmerged grid-toolbar commits. Those have their own review in `specs/grid-toolbar/review.md`.
- **Plan:** `specs/react-aria/plan.md`, with spec `specs/react-aria/spec.md` and `specs/field-contract.md`.
- **Reviewers:**
  - superpowers' code reviewer on the whole branch;
  - `security-sentinel`, because the range touches access checks, the history endpoint, filter parsing and the sign-in overlay.
  - No `ARCHITECTURE-INVARIANTS.md`; not WordPress.
- **Gate before review:** `bun run gate` exit 0. That covers check, 1144 engine and script tests, 929 grid tests and 133 e2e tests (log in the SDD workspace, `gate-2.log`).

## Blocking

None.

## Should fix

1. **A half-typed date or time is written on Tab or on leaving the cell** (code reviewer).
   - Where: `apps/grid/src/grid/cells/Date.tsx:73-78` blocks only Enter while the value is partial, and `Date.tsx:80-84` calls `onLeave()` unconditionally. Tab reaches `keys.ts:95-96` and leaving reaches `Grid.tsx:239-249`, and both commit the last complete draft.
   - Repro: on 22-05-2026, press Backspace twice on the day, then Tab. The cell gets `2026-05-02`, a value that was never on screen.
   - This breaks the field contract ("an incomplete date … writes nothing") and Review Focus 4.
2. **R5 is not fully met** (code reviewer). FilterBuilder's `Choices`/`Related` list (`apps/grid/src/ui/FilterBuilder.tsx:163`) is still hand-built. The plan scoped Task 10 to the range only. **Owner decision:** add a follow-up task, or narrow R5 in the spec.
3. ~~R1's `docs/SPEC.md` line is not written~~ Withdrawn: already on the branch at `docs/SPEC.md:37` (0e96e48).
4. **Share is modal and Escape cannot close it** (code reviewer).
   - Where: `apps/grid/src/ui/Share.tsx:58`, which sets `isKeyboardDismissDisabled`.
   - The modality is plan-mandated by R5 and is an owner sign-off. While it stays modal, Escape should close it.
   - Where focus lands on close is checked at the shake-out.

## Note

### Code reviewer

- `apps/grid/src/grid/cells/anchor.test.tsx:6-8` regex-reads `app.css`, which makes it a source-scan test. `e2e/ui-fit.spec.ts` already covers the property, so delete the file.
- `apps/grid/src/ui/MoreMenu.test.tsx:19` asserts React Aria's internal `data-trigger`.
- `apps/grid/src/ui/ViewList.tsx:106,182`: one click should select exactly once, but no exactly-once test proves it.
- `e2e/ui-fit.spec.ts:357-362` leaves a "Kader e2e" row behind and contains `console.log`s.
- `apps/grid/src/grid/cells/Relation.tsx:28-31`: a double-click on the open button also opens the cell editor and fetches twice.
- `apps/grid/src/grid/Grid.tsx:300-307`: `openRelated` has no guard against a stale response.
- `apps/grid/src/grid/cells/RelationPicker.tsx:107-111`: Enter is swallowed when the active descendant is no longer listed.
- `apps/grid/src/grid/cells/Select.tsx:69`: Space on an option now commits (small R7 drift, ruled).
- `apps/grid/src/ui/Search.tsx:47`: Escape in a non-empty search no longer closes the filter panel (small R7 drift).
- Comments still name Sakani: `app.css:1`, `app.css:3010`, `theme.css:2`, `Toast.tsx:57`.
- `apps/grid/src/grid/Grid.test.tsx:387-399`: the time editor has no Enter or Escape test at the Grid seam.
- `apps/grid/src/grid/cells/Bool.tsx:12`: the per-row cost of React Aria's `Switch` is unmeasured.

### Security sentinel

All Low; nothing Critical, High or Medium. The earlier M1 (ics CR) is fixed.

- `packages/engine/src/history.ts:82-93`: history takes a query row's `id` as the record id and ignores `writes.key`. That holds today but is not enforced.
- `packages/engine/src/history.ts:111-116`: record titles are read without the scope.
- History from before an owner change stays visible to the new owner. This was already known as L3.
- `packages/engine/src/filter.ts:51-55`: `$in`/`$nin` have no cap, and `params.ts:34` has no limit on filter length, so a signed-in user can push SQLite past its variable limit.
- `apps/grid/src/grid/conditions.ts:34-43`: conditions carried in a link are autosaved on the receiver's next change to a shared view.
- `apps/grid/src/ui/app.css:3190`: rows loaded before a session lapse stay readable under the 40% backdrop.

Findings: 0 Blocking · 3 Should fix · 18 Note
