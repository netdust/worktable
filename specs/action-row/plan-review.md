# Plan review: action-row (set)
Reviewed-plan: 995dac51489b341e781d81c5c671c13950fce16b specs/action-row/plan.md
Reviewed-plan: 2a5e912daf63a69e736a9753c84e059bc8a0a7e8 netdust-studio specs/site-address/plan.md

Both blob hashes match the files on disk. Sources checked: worktable at 6e2df3a, netdust-studio at 1f9aad5.

Verdict: **not ready.** site-address has two false premises (Blocking). action-row is ready with fixes: none of its premises is false, but it has eight Should-fix items.

## Blocking

**B1. site-address, Architecture and Test map row 2: "`applyDirect` (src/apply.ts)" does not exist.**
- `grep -rn applyDirect` across src/test/docs finds only the plan.
- The real path is the private `runSite` (`/home/ntdst/Sites/netdust-studio/src/apply.ts:52`), called from the exported `applyRequest` (`apply.ts:123`). `applyConfirmed` is imported from `src/handlers/update.ts` (`apply.ts:4`).
- Smallest change: name `runSite` / `applyRequest`, and say where in `runSite` the recount goes (see S11).

**B2. site-address, Global Constraints, "Premise": "This plan's e2e needs that engine." It is not only the e2e.**
- Every engine-backed test runs in-process against a fixed checkout: `/home/ntdst/Sites/netdust-studio/test/worktable.ts:1-4` imports from `/home/ntdst/Sites/worktable-studio/...`, and `test/sync.test.ts:9` uses `inProcess()`.
- That checkout is at 6e2df3a. Its `packages/studio/src/datasets.ts` has no `adres`. The engine refuses an undeclared key: `checkValues`, `/home/ntdst/Sites/worktable-main/packages/engine/src/writes.ts:132-137`, answers 400 `bad_value` "is not a declared column".
- So Task 1's tests cannot go GREEN before action-row is merged and worktable-studio is moved.
- The denial test fails for the wrong reason: "refused write (400 `bad_link`)" would be refused as `bad_value`, because the column is undeclared.
- Live hazard: the live worker writing `adres` to an engine without it throws in `syncRegistry` (`src/registry/sync.ts:33`, `:37`). That stops the whole registry sync, not one site.
- Smallest change: state that Task 1 (R8) cannot be built or tested before worktable-studio carries `site.adres`. Task 2 (R9 and null) runs on 6e2df3a today, because the counts are already nullable (`datasets.ts:61-63`). See The cut.

## Should fix

**S1. action-row, Task 1 Step 3 and Test map row 1: the R3 unit test cannot run as written.**
- The plan asks for the foot cell's computed `position` (`static`/`sticky`) in `Grid.test.tsx`.
- `app.css` and `theme.css` are imported only in `apps/grid/src/main.tsx:8-9`. Vitest runs jsdom (`apps/grid/vite.config.ts`, `test:` line), and no test loads the stylesheet. So neither the RED nor the GREEN half can happen.
- Smallest change: move the proof into Playwright (totals-clear-of-the-panel, using bounding boxes of the foot against the last row and `.nv-selection`) inside Task 1, and drop the unit row.

**S2. action-row, Task 1 Step 3: a totals row that is sticky only while the dock is empty does not meet R3's first sentence.**
- R3 says "never drawn over rows" and "stays at the table's end".
- With an empty dock, `.nv-grid__foot td { position: sticky; bottom: 0 }` (`apps/grid/src/ui/app.css:2418-2420`) still covers the rows scrolling under it: 28 rows × 40px do not fit at 900px.
- The simpler design is static always: delete the three sticky lines. The existing dock padding (`app.css:3644-3647`) already lets the end scroll clear of the panel.
- The Simplest design paragraph does not consider this. Smallest change: make the foot static unconditionally, or argue in the plan why a sticky foot over rows is acceptable under R3.

**S3. action-row, Task 2 Step 2: the count rule ("primary plus 2 others visible", "wraps never") does not implement R4's "when they do not fit on one line".**
- The drawer is 392px wide (`app.css:2839-2841`), and widening makes it wider.
- A site has no primary. Its actions are "Gezondheid checken", "Malware scannen", "Bijwerken", "Smoketest draaien" (`packages/studio/src/actions.ts`). Three of those plus "Meer" do not fit about 360px of body as `nv-button--sm`. With "wraps never", they overflow.
- The rule also leaves undecided how many show when there is no primary.
- Smallest change: either measure (hide from the end into Meer when the row overflows; proven in e2e at 392px and widened, since jsdom has no layout), or keep the count but add an e2e assertion that the site's row is one line with no horizontal overflow at 392px, and say what shows when there is no primary.

**S4. action-row, Task 1 Step 2 (R2): the step names two of the cell size overrides and leaves the rest unshown.**
- It removes the 12.5px for `.nv-cell__tabular` (`app.css:1755-1758`) and `.nv-dot` (`:1776-1778`).
- Still in cells, not addressed: `.nv-pill` 12px (`:1550`, a global rule), `.nv-blank` 11.5px (`:1812`), `.nv-cell__muted` 12px (`:1889`), `.nv-td__error` 12px (`:2271`).
- "Pills, dots, switches' labels and blanks follow the cell's size" says what without showing how. Smallest change: list each selector with a `.nv-grid:not(.nv-mx) … { font-size: inherit }` rule.

**S5. action-row, Task 2 Files: the test blast radius is not named.** Task 2 lists only `e2e/drawer.ts` and "the e2e specs that call `pressInMenu`/`offered`".
- A unit-test `pressAction` and `actionsOffered` already exist in `apps/grid/src/test-setup.ts:38-46`. Both open the head's "Acties" menu. The plan also gives these two names to the new e2e helpers, but never mentions the unit ones.
- **9 unit tests assert the old placement directly** and go red whatever the helper does:
  - `Drawer.test.tsx:458` (focus back to the Acties button)
  - `DrawerButtons.test.tsx:30, :94, :112, :145`
  - `Selection.test.tsx:191, :351`
  - `dashboard/Dashboard.test.tsx:180`
  - `dashboard/more-tiles.test.tsx:77`
- **26 more unit tests press actions through the test-setup helper** and go red until it learns the row: Drawer 7, App 14, Selection 2, DrawerButtons 2, more-tiles 1. Six more in `Grid.test.tsx` press Verwijderen, which stays in ⋮.
- Counting overlaps once, that is **about 33 distinct unit tests red**.
- **22 e2e tests in 8 specs** use `pressInMenu`/`offered`.
- **3 e2e tests assert the head placement outright:**
  - `e2e/studio.spec.ts:979` drawer-reads-right
  - `e2e/studio.spec.ts:~1006` drawer-actions-in-the-bar ("the body holds no action")
  - `e2e/action-inputs.spec.ts:372` escape-after-the-picker (focus onto the head's Acties at `:387`)
- These are registered checks: `specs/CHECKS.md:218` and `:227` describe "Bevestigen in de kop … geen actie in de body". `scripts/check-checks.ts` fails `bun run check` on a registered check that matches no test.
- Smallest change: add to Task 2's Files `apps/grid/src/test-setup.ts`, the 6 unit test files and `specs/CHECKS.md`. Add a step that rewrites or retires the three head-placement tests and their two CHECKS rows.

**S6. action-row, Task 3 and the threat model: two engine names are already taken.**
- `opens?: true` already exists on action declarations, meaning "the grid opens the first record the run created" (`packages/engine/src/declare.ts:383-384`, `:396`; validated at `validate.ts:652-653`; used at `packages/studio/src/actions.ts:26`). A column `opens` gives one word two meanings in one schema.
- `bad_link` is already the record-link 401 (`packages/engine/src/record-link.ts:21`). The grid treats it as "dead link" (`apps/grid/src/ui/LinkPage.tsx:38`).
- Smallest change: rename the flag (for example `href: true`). Use the existing value refusal `bad_value` (`writes.ts:66`) or a new `bad_url`, and update rows 2–3 and Review Focus 1.

**S7. action-row, threat model attack 2: "studio declares the column `written_by: 'service'` and `readonly`".**
- Read literally, this breaks R8. `cutBody` drops every `readonly` key for every writer, the service included (`writes.ts:100-106`).
- The person-facing read-only already comes from `written_by` (`packages/engine/src/app.ts:141-142`), and the Interfaces line rightly uses only `...worker` (`packages/studio/src/datasets.ts:8`).
- Smallest change: delete "and `readonly`" from the threat model.

**S8. action-row, threat model attack 3: `rel="noopener noreferrer"` has no test.**
- Test map row 3 asserts only that the button is present or absent.
- Smallest change: add a `target`/`rel` assertion to the `Drawer.test.tsx` row-3 test.

**S9. action-row, Task 3 Files: the engine change skips `docs/SPEC.md`.**
- AGENTS.md:33 makes `docs/SPEC.md` the spec of record. It documents the column flags (`badge` at `:56`, `footer` at `:65`), and views-and-actions changed SPEC.md first for engine declarations (`specs/views-and-actions/plan.md:37`).
- The declare-time refusal belongs in `packages/engine/src/validate.ts` (the `checkLong` pattern at `:92`), not `declare.ts`, and validate.ts is not listed.
- Smallest change: Task 3 Step 0 edits SPEC.md's dataset-columns row; add `validate.ts` to Files.
- The generic flag itself respects AGENTS.md:6. No Scope-lock "out" item (`docs/SPEC.md:353-364`) covers it.

**S10. site-address, Test map rows 2–3: wrong file for the apply path, and an existing test that flips.**
- Row 2 names `test/update.test.ts` for "the worker's apply path". That file unit-tests `applyConfirmed` with fakes (`test/update.test.ts:134`); the apply path with an engine is tested in `test/worker.test.ts:799` ("bijwerken: apply").
- Row 3's change flips an existing assertion: `test/handlers.test.ts:118-130` asserts the counts are absent after an SSH failure. The comment at `src/handlers/health.ts:56` ("the counts have no null in the domain") becomes false.
- Smallest change: name `worker.test.ts` for row 2, and name the test and comment Task 2 rewrites.

**S11. site-address, Task 2 Step 2: "implement" does not show where the recount goes, and the placement decides Review Focus 3.**
- `applyRequest` wraps `runSite` in a try/catch that closes the link `mislukt` (`apply.ts:150-176`).
- If the recount, or its engine write through `written`, throws before `link close` (`apply.ts:94-102`), a successful update reads "mislukt".
- Smallest change: recount after `link close`, inside its own try. A failed read writes nulls; a failed write is logged, not rethrown.
- The Simplest design also says "`wordpress(read)`, exported", but it is not exported (`health.ts:39`). Task 2's `readCounts` export fixes that; fix the sentence.

**S12. site-address, Task 1 Step 1: "a refused write is reported in `SyncResult.refused` and the sync goes on" does not hold for a create.**
- `adres` goes into the create body (`sync.ts:32`), and any non-201 throws (`sync.ts:33`). A malformed `url:` would then stop that site from ever being created, and end the sync.
- The worker discards `SyncResult` (`src/worker.ts:193`), so "the sync reports it" reaches no one but `bin/sync`.
- Smallest change: on a refusal, create or update without `adres`. Report it as a `conditie` taak, as the web-only case does (`sync.ts:41-49`).

## Note

- **N1. action-row, Task 1 Step 2, 14px.** `app.css:1765-1766` says the 16px table text is the approved prototype's size, "kept on purpose", and `:1781` says small marks keep to "the middle of a 16px line". The spec leaves the size to the builder, judged by screenshots, so 14px is allowed. But the plan should say why it picks 14 over 16 (16 everywhere also meets R2 and keeps the prototype), and update both comments.
- **N2. action-row, Task 1 Step 1.** `--color-border-row` also draws the matrix's lines: the base `.nv-td` rule (`app.css:1681`) is not scoped to `:not(.nv-mx)`. Either accept that and say so, or scope the change, given "change what the spec names".
- **N3. action-row, Task 3 Mitigations, "the coder names the function in pre-flight".** It can be named now: `checkValues` (`writes.ts:132`), called twice in `answeredOf` (`:623`, `:636`). The import path (`import.ts:163`) and seeds (`seed-missing.ts:60`) go through it, so "every writer" holds there.
- **N4. action-row, Task 3 Step 3.** The aria-label "Website openen" is domain copy in the domain-free grid. The vocabulary check covers only `packages/engine` and `packages/mcp` (package.json `check` script), so nothing catches it. A generic key such as "Openen in nieuw tabblad", or the column's own label, keeps the grid generic and still meets R7.
- **N5. action-row, Task 2 Step 3, the pre-flight question.** Answered: an opdracht's Sites is a `links` declaration (`packages/studio/src/datasets.ts:109-118`), rendered by `LinkSection` (`Drawer.tsx:214-217`), not `InboundSection`. A site has no `links`, so its row goes under the fields, before the `LongSection`s.

## Premises checked

- theme.css `--color-border-row` at :26, :142, :192 → `apps/grid/src/ui/theme.css:26,142,192` → holds. Both row and column lines use it (`app.css:1681`, `:1699`).
- app.css cell sizes at 1755-1790 → `app.css:1755-1786` → holds. The step omits further cell overrides (S4).
- `.nv-grid__foot td` sticky at 2419-2427 → `app.css:2418-2431` → holds.
- Dock padding at 3645-3647 → `app.css:3644-3647` → holds.
- `DrawerTools` holds the primary, actions, link and delete → `apps/grid/src/grid/DrawerTools.tsx:40-62` → holds.
- `Drawer.tsx:199-216` (the tools slot and LinkSection) → `Drawer.tsx:199`, `:215` → holds.
- An opdracht's Sites renders via LinkSection → `datasets.ts:109` and `Drawer.tsx:214` → holds.
- `e2e/drawer.ts` `pressInMenu`/`offered` → `e2e/drawer.ts:7-20` → holds.
- `pressAction`/`actionsOffered` are new names → `apps/grid/src/test-setup.ts:38-46` → does not hold; they already exist as unit helpers.
- `ColumnDecl` in `declare.ts` → `packages/engine/src/declare.ts:37-66` → holds. `opens` is already an action flag (`:384`, `:396`).
- The engine's write value validation → `writes.ts:132` (`checkValues`), every writer → holds.
- `worker` spread is "service-written, read-only" → `datasets.ts:8` (`{ written_by: 'service' }`) and `app.ts:142` → holds for persons only. The threat model's literal `readonly` would break the service write (`writes.ts:106`).
- A person's write to a `written_by` column → 403 `service_only` → `writes.ts:596-601` and `access.ts:49` → holds.
- `bad_link` is free to use → `record-link.ts:21` → does not hold.
- Counts nullable since views-and-actions R16 → `worktable-main/packages/studio/src/datasets.ts:61-63`, and the worktable-studio checkout at 6e2df3a → holds.
- `syncRegistry` "already resolves" the production URL → `sync.ts:43` calls `productionTarget`, whose `url` comes from `environments.production.url` (`target.ts:16-24`) → holds in substance. `productionUrl` lives at `src/registry/target.ts:56` and is used at `apply.ts:64` → holds.
- `applyDirect` in `src/apply.ts` → absent; the real functions are `runSite` (`:52`) and `applyRequest` (`:123`) → does not hold (B1).
- `wordpress(read)` is exported → `src/handlers/health.ts:39` (not exported) → does not hold. Task 2 exports `readCounts`.
- health.ts's count write → `health.ts:57-63` (a count is omitted on a failed read) → holds.
- Only e2e needs the action-row engine → `test/worktable.ts:1-4`, `test/sync.test.ts:9` → does not hold (B2).
- INV-3 and INV-4 respected by the planned code (sync stays in `src/registry/`; the recount uses `readRunner`, `src/remote/runner.ts:38`) → holds.

## The cut

- **specs/action-row/plan.md → one feature, with one reservation.** Task 1 (table CSS) shares no file with Tasks 2–3, which share `Drawer.tsx`. By the one-feature rule that is too broad. The spec prescribes one plan per repository, so this is Stefan's ruling. If he wants it, the smallest change is to split Task 1 into its own `table-look` plan; it already ends at its own stop.
- **netdust-studio specs/site-address/plan.md → artificially split from action-row at one boundary, `site.adres`.**
  - Its Task 1 (R8) cannot be built or tested without action-row Task 3 Step 4's `datasets.ts` change, because its tests run in-process against `/home/ntdst/Sites/worktable-studio` (B2).
  - Its Task 2 (R9 and the R16 null follow-up) is a standalone feature, buildable and testable on 6e2df3a today.
  - Smallest change: split site-address so that R9 and null ship as one netdust-studio plan now, and R8's sync change is its own netdust-studio plan, built once worktable-studio carries `site.adres`.
- **Spec coverage:** R1–R7 are owned by action-row and R8–R9 by site-address. No requirement is owned twice or by no plan.

Verdict: not ready. site-address must fix B1 and B2 before Stefan reads it. action-row is ready with fixes S1–S9.
