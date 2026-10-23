# Plan review: studio-polish
Reviewed-plan: efd81454f53c6435893f19be042eaf57938f4778 specs/studio-polish/plan.md

The blob sha was checked against the file and matches. The repo is at d1d3613.

## Blocking

**B1. Two premises are false: that the import "runs as the system and is untouched", and that "the seed and the import still create".** Plan lines 37-39 and 104 (Task 1 Step 2, R2).
- The import runs as a named administrator, not the system. `serve.ts:145-151` returns `{ id, role, subject: null }` with no `kind`, so it counts as a person.
- The import plans every row through `valuesOf` → `answeredOf` (`import.ts:174`). `answeredOf` is the function where "the write is planned" (`writes.ts:599-629`, writer at 615).
- `--seed-missing` also goes through `valuesOf`, as `SYSTEM` (`seed-missing.ts:55-57`; `views.ts:71`, no kind).
- The plan's own rule refuses "every kind but `service`" (plan lines 27 and 36). So the import and seed-missing would be refused, and the plan's own test fails.
- `answeredOf` is also the only place that catches the undo: `restore` calls `valuesOf` (`writes.ts:859`). So moving the check out of it is not free.

Smallest change: name the choke point (`answeredOf`, reached by REST, `createAs`, `updateAs`, the action token at `action-token.ts:182`, and undo). Then pick one:
- an explicit exemption that import and seed-missing pass in, with the test kept; or
- the import and seed-missing are refused like a person. Studio's site writer already refuses an administrator's create (`writers/site.ts:41`). Then drop "the import still creates" and rewrite threat line 38.

**B2. "primary … served in `/schema`" is false.** Plan line 10, and Task 1 Step 2 line 106 ("/schema: … `primary` … are served").
- `/schema` serves only `{ column, live }` of a lifecycle, never its transitions (`app.ts:307-309`).
- Buttons reach the grid per row as `available.buttons` `{ to, label }` (`available.ts:35-44`), and `DrawerButtons.tsx:19-21` reads them there.

Smallest change:
- Add `available.ts` to Task 1's files: `buttonsOf` emits `primary`.
- Test it on a row's `available.buttons`.
- Add `primary?: true` to `Available.buttons` in `apps/grid/src/types.ts:71`.

**B3. R3's mitigation misses a second way a service deletes a file.** Threat 3 (line 40) and the denial test (line 61) cover only `DELETE /attachments/file/:id`. A service can also undo its own upload:
- An upload records a `write` batch (`attachments.ts:282`), which its own actor may undo (`writes.ts:781-788`).
- `undoAttachments` then soft-deletes the file (`attachments.ts:400-401, 431`).
- Its `checkWrite` returns early for every non-owner role (`attachments.ts:145`).
- Studio's worker uploads every screenshot, so after R3 a service can still remove all of them.

For rows, the same rule already covers this path: undoing a create calls `writer.delete` (`writes.ts:853-854`), and studio's `noServiceDeletes` wrapper refuses a service there (`writers/index.ts:9-18`).

Smallest change: refuse in the undo too wherever it sets `deleted_at` (`to !== null`). Add the test "a service's undo of its own upload on a `deleted_by: 'user'` dataset is refused 403", and add that path to threat 3.

## Should fix

**S1. The spec says the tests R8–R14 change are "named in the plan" (spec line 76). The plan names none.** Task 3 Step 1 (line 146) defers the naming to execution, which contradicts its own Global Constraint (line 25). From source:
- **R8:** `apps/grid/src/grid/useLiveHost.test.tsx:39,44`; `e2e/drawer-actions.spec.ts:89,95,151`; `e2e/studio.spec.ts:205`.
- **R10:** `apps/grid/src/ui/insight.test.ts:15-21` (a theatre-shaped fixture; the return becomes a list).
- **R13:** `apps/grid/src/api.test.ts:85-87`.
- **R14:** `apps/grid/src/ui/App.test.tsx:1649-1655` ("+ New is blocked on a query view", theatre's Dagplanning).
- **R12:** theatre's drawer actions in `e2e/step-1.spec.ts:194`, `step-2.spec.ts:208`, `ui-fit.spec.ts:414` and `action-inputs.spec.ts`. Check each and name it, even where it stays green.

**S2. Task 2 turns existing studio tests red, and the plan does not say so.**
- Once the engine refuses before the writer, `packages/studio/test/ownership.test.ts:68, 102, 124, 168` fail. They assert code `forbidden` (`:42-46`) and the writer's Dutch message.
- `e2e/studio.spec.ts:414-444` (`sites-board-and-gallery`, `CHECKS.md:202`) and `:543-566` (`person-cannot-take-worker-steps`, `CHECKS.md:205`) drive a drag that will no longer exist.
- `packages/studio/test/seed.test.ts:117-120` pins a `new_label` that no button will show any more.

Name each one and its new assertion. Also add `service_only` to the grid's `ENGINE_CODES` (`i18n.ts:433-438`) with a Dutch text. Otherwise a person gets the engine's English message where studio's Dutch one used to come through, which breaks the "Dutch UI copy" constraint.

**S3. R2 misses two places the grid offers a create.**
- The dashboard shows any declared quick action whose model exists (`Dashboard.tsx:96-100`).
- The composer offers a quick create on every non-query model (`Composer.tsx:153`), so it offers "Nieuwe site".
- A query whose `creates` names a service-created dataset would still show its button.

Add `Dashboard.tsx` and `Composer.tsx` to Task 2, with a test for each.

**S4. R5 fixes only the footer row.** `sums()` in `grid/group.ts:160-165` also feeds the group band totals (`GridBody.tsx:100, 117-121`) and the Excel total row (`export/xlsx.ts:81-82`). Grouped by gezondheid, "HTTP 1100" would still show. Put the `footer: 'none'` filter in `sums()`, and add `group.ts` to the files.

**S5. R7 touches only `Sections.tsx`.** The symptom the spec quotes, "reads green and full", is the table cell's bar, as `shakeout.md:52` says. That bar is `LinksCell` in `cells/Links.tsx:42-49`, shown in the Opdrachten table and on the board card. Add `Links.tsx` to Task 2, or record a ruling that the cell keeps its meter.

**S6. R13 has a trap.** The undo history keeps a step whose undo never reached the server by the code `unknown` (`ui/history.ts:67`, `KEPT`). If the fix gives a network failure a new code, an undo that fails offline silently leaves the history. `history.test.ts:54,95` mock the error object, so no test would catch it. Either keep `code: 'unknown'` with the Dutch message (`api.ts:24-32, 66-77`; also `uploadAttachment`'s own `fetch`), or add the new code to `KEPT`. Test it through `api.ts`.

**S7. The Test map is missing runnable homes for three things.**
- Row 2 names e2e flows `no-edit-on-service-columns` and `no-new-where-not-allowed`, but no task step writes them and no row gives a file or `--grep` command.
- R11 cannot be tested in a jsdom component test: there is no layout there. The plan offers "component or e2e at 1280" (line 142), and row 3 lists no e2e. The shake-out measured the overlap at 1440 (`shakeout.md:56`).

Put both R2/R1 flows and R11 in `e2e/studio.spec.ts` (or `toolbar.spec.ts`), give each a `flock … bunx playwright test … --grep` command, and test R11 at 1440.

**S8. R1's tests cover only PATCH, though Review Focus 1 says "by any path".** Add:
- a person's POST that sets a `written_by` column;
- a person's action whose `updates` set one.

Also decide what happens when a person's writer fills in such a column on its own. The original write passes, but its undo then 403s, because `restore` replays the whole batch through `answeredOf`.

**S9. The plan is missing parts of the writing-plans format.** No task has an `Interfaces` block, and no step shows code ("Step 2: Implement." in all four tasks). Tasks 2 and 4 depend on what Task 1 serves, so pin at least:
- each declaration's TypeScript type;
- the served JSON: `readonly` per viewer, `created_by` raw or a per-viewer flag, `board.drag`, `link.meter` (`servedLink` picks fields one by one, `app.ts:163-176`), `selectable`, `buttons[].primary`;
- the 403 body `{ code: 'service_only' }`;
- the check's call site.

## Note

- **N1. R1 needs no new grid code.** The grid already turns off inline edit on `readonly` (`columns.ts:179`), board drop (`App.tsx:680`) and the title (`engine.ts:207`). Serving `readonly` per viewer is enough, so `Grid.tsx` and `Board.tsx` can drop out of R1.
- **N2. No check enforces "no domain word in the grid".** `check-vocabulary` scans only `packages/engine` and `packages/mcp` (`package.json:14`). Run on `apps/grid/src`, it already reports words (`types.ts:92` activiteit, `Calendar.tsx:52` soort). So the constraint at line 25 rests on review alone. Separately, `packages/engine/test/studio-polish.test.ts` puts a domain package's name into the engine; name the file after the shapes instead.
- **N3. R10 visibly changes theatre.** Activiteit has `geannuleerd: 'bad'` (`packages/theatre/src/datasets.ts:45`), so theatre views gain a red "Geannuleerd" pill. Toewijzing has two bad options (`:268`), so the plan must say which one, or how they are counted. Stefan should see this before it ships.
- **N4. R15 and actions with a condition.** Query rows carry no `available` (`available.ts:48` handles datasets only). So `misfits()` counts 0 (`Grid.tsx:343-345`) and the server refuses any condition-bound selection action 422. Either refuse `selectable` when the `of` dataset has such an action, or offer only unconditioned ones. Also say whether a query row's drawer (`Grid.tsx:399`) offers the dataset's actions.
- **N5. Refused controls remain outside R1–R16.**
  - Onderhoud's writer refuses every update (`writers/onderhoud.ts:15-17`), yet `writable` follows from `update` existing (`app.ts:37-39`). So the Onderhoudslog table offers inline edits that always fail.
  - The Opdrachten table's Status cell offers every option, while the writer allows a person only two moves (`writers/actie.ts`, `checkPersonMove`).

  Both break the spec's anti-goal; Stefan should rule.
- **N6. More validation cases for `validate.ts`.** Refuse:
  - `written_by` together with `owner_writable`;
  - `written_by` on a lifecycle column that has `button` transitions (every press would 403);
  - a query `writes` mapping onto a `written_by` column (`validate.ts:357` checks only `readonly`);
  - `creates` naming a service-created dataset (`validate.ts:149-155`).
- **N7. R9 has no stated trigger.** `HistorySection` reads once per `[model.key, id]` (`Sections.tsx:152-158`). Re-reading on every row replacement would also refetch on every live poll. Pin the trigger.
- **N8. R11 should be scoped.** `.nv-toolbar` wraps on purpose (`app.css:413-416`). Truncate the save-error text rather than removing wrap altogether.
- **N9. Two small slips.** Task 2 lists `seed.ts` for R16, but `drag` sits on the dataset's `BoardDecl` (`declare.ts:136-138`), so nothing of R16 lands in `seed.ts`. The Architecture says "seven small declarations" and lists eight.
- **N10. `deleted_by: 'user'` reads as actor kind `user`.** The plan's "person" also includes kind `link`. Say so where the declaration is documented, or name the value `person`.

## Premises checked
- R1/R2 refused "in writes.ts where the write is planned", covering REST, actions, the action token and undo → `writes.ts:599-629, 489-494, 859`; `actions.ts:129-133`; `action-token.ts:182` → holds
- "The import runs as the system and is untouched" → `serve.ts:145-151`, `import.ts:174` → does not hold
- "The seed bypasses writers" → `migrate.ts:146-148` holds for the seed; `seed-missing.ts:55-57` goes through writers as kind-less `SYSTEM` → partly holds
- `primary` served in `/schema` → `app.ts:307-309`, `available.ts:35-44` → does not hold
- `attachments.ts` refuses "before the soft delete" → `remove` at `:298-305` holds; the undo path `:406-431` is not covered → partly holds
- `/schema` can serve `readonly` per viewer → `servedColumn(domain, declared, actor)` at `app.ts:111-118` → holds
- `board.drag` is served as declared → `app.ts:302` serves `board` whole → holds
- A link's `meter` is served → `servedLink` picks its fields (`app.ts:163-176`) → must be added; feasible
- The board already won't drag on a read-only column → `App.tsx:680` → holds
- R14: a disabled "Nieuw <query>" today → `App.tsx:421, 641-642` → holds
- The "+ Nieuw" paths are the toolbar, board "+" and quick create → `App.tsx:641-642, 681, 712` → holds, but misses `Dashboard.tsx:96` and `Composer.tsx:153`
- The footer sum lives in `GridFoot` → it is computed in `group.ts:160` and shared with the band and Excel → partly holds
- The meter is in `Sections` → also in `Links.tsx:42-49` → partly holds
- The live mark is "Bezig…" → `Drawer.tsx:121`, `i18n.ts:274` → holds
- Actions sit at the drawer's foot → `Drawer.tsx:221` against buttons at `:205` → holds
- The network error is "Failed to fetch" → `api.ts:31, 66-77` → holds
- The title pill is warn-only → `insight.ts:12-22`, `Toolbar.tsx:102` → holds
- Query selection re-reads each id as the caller → `actions.ts:104-111, 179` → holds
- A query model carries no actions of its `of` dataset → `actionsOn` per source name, `Grid.tsx:122` → holds (Task 4 must source them)
- The `selection-domain.ts` fixture, `seed.test.ts` and `e2e/studio.spec.ts` exist → holds
- `bun run check` guards domain words → engine and mcp only (`package.json:14`) → does not cover the grid

## Verdict
not ready. The three Blocking findings are each a few lines in the plan (the import/seed-missing ruling, `available.ts` for `primary`, the attachment undo). With those in and S1–S9 addressed, it should be ready.
