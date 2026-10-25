# Plan review round 2: action-row (set)

Reviewed-plan: b5310a673c48745278f67ad8b856f49edb29dc96 /home/ntdst/Sites/worktable-main/specs/action-row/plan.md
Reviewed-plan: 78394d54e3ec8cb973242d731be512feb937c357 /home/ntdst/Sites/netdust-studio/specs/fresh-counts/plan.md
Reviewed-plan: 51160c5d860f834857fc6944a360eb63b885b38d /home/ntdst/Sites/netdust-studio/specs/site-address/plan.md

All three blob hashes match the files on disk. I checked against worktable main 6e2df3a, netdust-studio main 1f9aad5, and the worktable-studio checkout at 6e2df3a.

Verdict: **ready with fixes.** Every round-1 finding is fixed except one Note on the cut, which is left to Stefan. No new Blocking finding. The rewrite caused three new Should-fix items: deleting the sticky foot also un-freezes the matrix's foot; the new i18n key `moreActions` already exists; the one-size e2e would trip on `.nv-open`. There are two more Should-fix items: the R3 e2e can pass without testing anything, and the recount misses an apply that throws.

## Round-1 findings

| # | Status | Where it is fixed |
|---|---|---|
| B1 `applyDirect` | fixed | fresh-counts names `runSite` (`apply.ts:52`) and `applyRequest` (`:123`); both hold. |
| B2 engine prerequisite | fixed | R8 is split into site-address with a Build order, and its denial is `bad_url`. R9 is fresh-counts, buildable today: `worktable-studio/packages/studio/src/datasets.ts:61` has the counts nullable. |
| S1 R3 unit test can't run | fixed | Moved to `e2e/table-look.spec.ts`. But see new S-d. |
| S2 sticky foot over rows | fixed wrong | The foot is now static, but the deleted rule is shared with the matrix. See new S-a. |
| S3 count rule vs "do not fit" | fixed | Folding is measured; e2e at 392px and widened; the no-primary case is in Step 1 and Review Focus 6. |
| S4 cell size overrides unlisted | fixed | Every selector is listed. But see new S-c. |
| S5 test blast radius | fixed | Lists `test-setup.ts:38-46`, the 9 unit tests, the 3 e2e tests and `CHECKS.md:218, 227` (both lines verified). |
| S6 `opens` / `bad_link` taken | fixed | Now `href` and `bad_url`. |
| S7 `readonly` | fixed | Interfaces says no `readonly` and gives the reason (`writes.ts:100-106`). |
| S8 `rel` untested | fixed | Test map row 3 and Task 3 Step 4. |
| S9 SPEC.md and validate.ts | fixed | Task 3 Files and Step 1. |
| S10 wrong test file; flipped test | fixed | `worker.test.ts:799` and `handlers.test.ts:118-130` (verified). The health.ts comment is named. |
| S11 where the recount goes | fixed | After `link close`, in its own try. The Simplest design sentence is corrected. See new S-e for the thrown path. |
| S12 refused create stops the sync | fixed | Create or update without `adres`, plus a `conditie` taak. |
| N1 14px rationale | fixed | Rationale given; both comments to be updated. |
| N2 matrix lines | fixed | Accepted and stated (Task 1 Step 1). |
| N3 name the function | fixed | Threat-model Mitigations name it. |
| N4 domain copy in grid | fixed | "Openen in nieuw tabblad", now also a Global Constraint. |
| N5 pre-flight question | fixed | Task 2 Step 3. |
| Cut: split Task 1 out of action-row | not acted on (Stefan's ruling) | Task 1 stays in action-row behind its stop. |
| Cut: split site-address | fixed | Spec "Left to the builder" now names both netdust-studio plans. |

## Blocking

None.

## Should fix

**S-a. action-row, Task 1 Step 3: deleting the sticky lines of `.nv-grid__foot td` also un-freezes the matrix's Totaal.**
- The rule at `apps/grid/src/ui/app.css:2419-2431` is unscoped.
- The matrix renders the same `<tfoot className="nv-grid__foot">` (`apps/grid/src/matrix/Matrix.tsx:607`).
- The matrix CSS relies on a frozen foot: "stops short of the frozen header, first column and foot" (`app.css:2444-2446`, `scroll-padding: 52px 0 36px 412px`).
- That contradicts the plan's own "change what the spec names", and "The matrix keeps its own sizes".
- Smallest change: scope the R3 rule as `.nv-grid:not(.nv-mx) .nv-grid__foot td { position: static }`, or move the three sticky lines into `.nv-mx .nv-grid__foot td` (`:2466`).

**S-b. action-row, Task 2 Files: the i18n key `moreActions` already exists.**
- `apps/grid/src/i18n.ts:217` reads `moreActions: 'More actions'`, with its pair `moreActionsShown: 'Meer acties'` at `:218`.
- It is `MoreMenu`'s default label and menu name (`apps/grid/src/ui/MoreMenu.tsx:24`) and is used by `ViewList.tsx:212`.
- Adding `moreActions: "Meer"` either duplicates the key or relabels every default `MoreMenu`.
- Smallest change: a new key (for example `moreInRow: 'Meer'`), passed as the row's `MoreMenu` `label` and `menu`.

**S-c. action-row, Task 1 Step 4: one-size-in-a-row ("every `.nv-td` and its text children … share one computed font-size") fails on a child the plan leaves at 11px.**
- The title cell holds the hover button `.nv-open` (`apps/grid/src/grid/GridBody.tsx:73`), styled `#root .nv-open { font-size: 11px }` at `app.css:2222-2223`.
- Its opacity is 0, but it is still a text child.
- Smallest change: either the test excludes `.nv-open`, as the open-row affordance rather than a cell value, or Step 2 adds it to the inherit list. With the `#root` rule, that needs `#root .nv-grid:not(.nv-mx) .nv-open`.
- The same specificity trap applies to `#root .nv-chip` (`:695-696`) if chips ever render in a cell.

**S-d. action-row, Task 1 Step 4: totals-clear-of-the-panel can pass without testing anything.**
- The step allows "the studio harness's sites plus a short table".
- The studio seed has 3 sites (`packages/studio/src/seed.ts:24-`). A table that does not overflow never shows the R3 bug: the foot is below the last row and clear of the panel whatever the CSS says.
- Smallest change: fix the fixture at 28 or more invented rows, and assert first that the table's scroll container overflows (`scrollHeight > clientHeight`) before the box checks.

**S-e. fresh-counts, Task 1 Step 1 bullet 5 ("after a 'mislukt' apply the site is recounted too") against Step 2's placement ("after `link close`" inside `runSite`).**
- `runSite` reaches its `link close` only when `applyConfirmed` returns (`src/apply.ts:95-103`).
- A thrown mislukt never reaches it: an exception inside `applyConfirmed`, the `written('backup path')` at `:77`, or the `onderhoud` write at `:83-94`. These land in `applyRequest`'s catch (`:151-177`), possibly after plugins were already updated, and the counts stay stale. That is the very bug R9 names.
- Smallest change: say which mislukt the test means. If both, recount in `applyRequest` after the try/catch, for every claimed link whose target is not web-only, in its own try. That is one call site, and it covers both paths.

## Note

- **Line-number drift in the new citations.** None of these is load-bearing; correct them so the coder does not hunt.
  - `health.ts:56`: the comment is at `:57`.
  - `apply.ts:94-102`: `link close` is at `:95-103`.
  - site-address `sync.ts:33, 37`: the throws are at `:35, :39`.
  - `sync.ts:41-49`: the web-only block is at `:42-52`.
  - action-row `Drawer.tsx:214`: `LinkSection` is at `:215`. The fields toggle ends at `:213` and the `LongSection`s are at `:218`, so the placement in Task 2 Step 3 holds.
- **action-row, Task 2 Step 4: the head's ⋮ keeps its label `recordActions` "Acties".** That is `i18n.ts:297` and `DrawerTools.tsx:63`. After the move, the menu holds no action, and the e2e and unit helpers that find it by "Acties" (Grid.test.tsx's Verwijderen tests) keep working only because the name stays. Decide the name deliberately: keep it, or rename it and update those helpers.
- **action-row, Task 2 Step 5: the existing pieces.** `DrawerButtons` (`apps/grid/src/grid/DrawerButtons.tsx:8-23`, `.nv-dw-buttons` in `drawer-buttons.css`) already renders a record's lifecycle buttons as a row with the primary filled. It wraps (`flex-wrap: wrap`), so it does not meet R4 as is. `ActionRow` should not grow a third copy of `press`. Moving `press` out of `DrawerTools` (Step 2) is right; reusing `DrawerButtons`' button markup is optional.
- **action-row, Task 2 Step 2: where focus goes after an inputs panel.** Escape returns focus to "the action's button in the row" (Files, `action-inputs.spec.ts:372`). An action that was folded has no button, so focus goes to the Meer trigger. State that, or the escape test is undefined for a folded action.
- **action-row, Task 3: two unlisted effects.**
  - Seeding `adres` for the e2e sites touches `packages/studio/src/seed.ts`, which Files does not list.
  - `site.adres` is a new column. The engine adds it by `ALTER TABLE ADD COLUMN` (`packages/engine/src/schema-diff.ts:95`), and it will show as a Sites table column unless a view hides it. If Stefan does not want an Adres column in the table, say so.
- **site-address, Global Constraints: "Only `environments.production.url` enters the studio, and no other `site.yml` value" is not true of today's code.** `slaOf(record)` already crosses (`src/registry/sync.ts:34`). Read it as "this change adds no other value" and word it that way.
- **The cut:** action-row Task 1 shares no file with Tasks 2–3, as round 1 said. It stays in action-row behind its stop; that is Stefan's ruling.

## Premises checked

New and changed premises only:
- `checkLong` pattern in validate.ts → `packages/engine/src/validate.ts:92`; `validateDomain` at `:746` → holds
- `checkValues` refuses an undeclared key `bad_value` → `writes.ts:132-138` → holds
- `answeredOf` calls `checkValues` at `:623` and `:636` → holds
- import and seed writers go through `valuesOf` → `import.ts:163`, `seed-missing.ts:60` → holds
- a person's write to a `written_by` column → `service_only` → `writes.ts:595-601` → holds
- `opens` is taken by actions → `declare.ts:384`; `bad_link` by record links → `record-link.ts:21` → holds
- the schema serves column flags raw (so `href` passes through) → `packages/engine/src/app.ts:141-147`; the grid maps flags in `apps/grid/src/engine.ts:180-181` → holds
- `worker = { written_by: 'service' }` → `packages/studio/src/datasets.ts:8` → holds
- `links.sites` on the opdracht → `datasets.ts:109-118` → holds
- `packages/studio/test/` exists → holds
- `e2e/drawer-actions.spec.ts` exists ("Add to") → holds
- the unit test helpers `pressAction` and `actionsOffered` open "Acties" → `apps/grid/src/test-setup.ts:38-46` → holds
- jsdom has a ResizeObserver stub → `test-setup.ts:9-16` → holds
- `studio.spec.ts:979` drawer-reads-right, `:1005` drawer-actions-in-the-bar, `action-inputs.spec.ts:372` → holds
- `CHECKS.md:218, 227` → holds
- new i18n key `moreActions` → `i18n.ts:217` → does not hold (S-b)
- deleting `.nv-grid__foot td` sticky touches only the table → `Matrix.tsx:607`, `app.css:2444-2446` → does not hold (S-a)
- every cell-text override is listed → `#root .nv-open` 11px at `app.css:2223` is a cell child → partly holds (S-c)
- `Drawer.tsx:199-217`, the tools slot and the body order → `:199`, `:213`, `:215`, `:218` → holds
- `DrawerTools` holds the primary, actions, link and delete, plus the inputs panel → `DrawerTools.tsx:40-90` → holds
- `wordpress(read)` at health.ts:39-63 → `src/handlers/health.ts:39-69` → holds; the comment is `:57`
- `runSite` / `applyRequest` / the catch → `src/apply.ts:52`, `:123`, `:151-177` → holds; `link close` is at `:95-103`
- a ReadRunner can be built in `runSite` → `readRunner(runner, target)` at `src/remote/runner.ts:38`; `deps.runner` and `target` are in scope at `apply.ts:60`, `:70` → holds (INV-4 respected)
- `handlers.test.ts:118-130` asserts the counts are absent; `worker.test.ts:799` "bijwerken: apply" → holds
- `productionUrl` → `src/registry/target.ts:56`, used at `apply.ts:64` → holds
- `Row` and `studioSites` in sync.ts → `src/registry/sync.ts:6`, `:19` → holds
- netdust-studio has an e2e directory for the shakeout flow → `/home/ntdst/Sites/netdust-studio/e2e` → holds

## The cut

- `/home/ntdst/Sites/worktable-main/specs/action-row/plan.md` → one feature (R1–R7). Task 1 could be its own feature; that is Stefan's ruling, unchanged from round 1.
- `/home/ntdst/Sites/netdust-studio/specs/fresh-counts/plan.md` → one feature (R9), buildable and testable on 6e2df3a today.
- `/home/ntdst/Sites/netdust-studio/specs/site-address/plan.md` → one feature (R8), ordered after action-row by the engine column it writes. That is the build order, not a split.
- Coverage: R1–R9 each have exactly one owning plan.

Verdict: **ready with fixes** (S-a to S-e; no Blocking).


Fixed after this review (Should fix and notes only, no further round): action-row plan.md de8953d4dc3fceeb09031093fc1de8fd688d7cf0, fresh-counts plan.md 090d06ffdba36f0a686001c947c77e86805ca7bf, site-address plan.md 25e748de5bed3a2e36383cceda8b6aec27fa86a7. Approved by Stefan 2026-10-25 ("approved").
