# Plan review (round 2): selection-actions
Reviewed-plan: bff2ffe4a0258a9901114294d69566f69d3ae205 specs/selection-actions/plan.md

Spec blob d82600202d9baeb39852eabacb5b6db83717455c, read against `main` (8545b1d) and `origin/feature/studio-mcp` (b04fcac).

The revision fixes 17 of round 1's 18 findings against the source. B1 is the exception. Its replacement, "dropping a link uses the drawer's existing link remove", does not hold: the drawer has no link remove. Two more gaps came with the revision: the R6 trigger leaves an old block in place, and the shared action-input component needs a record that the selection bar does not have.

## Blocking

**B1. The table's drawer has no link remove. The remove lives in the sheet's links cell.**
- **Plan:**
  - Threat 4 (plan.md:40): "The only write from that list is the existing link remove, which goes through the link dataset's writer."
  - Task 3 Step 1 (:207), in `Drawer.test.tsx`: "The link list's existing remove still works beside it."
  - Task 3 Step 4 (:212): "Then back on the parent, remove that link from the list; the parent's link count drops by one."
  - The spec's Settled line (spec.md:68) says the same: "removing it from the request's link list, which the drawer already does."
- **Source:**
  - The drawer's link list is `LinkSection` → `PlaceRow` (`apps/grid/src/grid/drawer/Sections.tsx:68-107`, `drawer/PlaceRow.tsx:29-47`). It renders name, role, state and flags, with no remove and no add.
  - Its only write is `onLink`, which re-picks who holds a place: an `update` of the link row's target (`drawer/place.ts:16-27`). It is offered only when the target column has `options_from` (`Sections.tsx:82`).
  - Add and remove live in the sheet cell editor `LinksEditor` (`grid/cells/Links.tsx:152-207`; remove at :164-167 and :182, add at :196). It is reached through `LinksContext` (`Links.tsx:18`, provided at `Grid.tsx:332`) and App's `links.add` / `links.remove` (`ui/App.tsx:489-507`).
  - The existing e2e removes a link exactly that way, in the picker's chips (`e2e/dagplanning.spec.ts:210-211`).
- **Effect:**
  - Task 3 Step 1's drawer test has nothing to assert.
  - Task 3 Step 4's flow cannot be driven in the drawer.
  - An executor will either fail the step or invent a drawer write that neither the spec nor the plan designs.
- **Smallest change:** point the three plan lines at the sheet's links cell.
  - Threat 4 becomes "the parent row's links cell → `links.remove` → `removeRow` on the link dataset".
  - Drop "remove still works beside it" from the `Drawer.test.tsx` step.
  - The link-opens-record flow removes the link from the parent row's links cell, as `dagplanning.spec.ts:210` does. Studio's request view then has to show its links column.
  - Spec.md:68's "which the drawer already does" is wrong and needs Stefan to correct it to "the table's links cell". If he wants the remove in the drawer instead, that is a new drawer write and a spec change first.

## Should fix

**S1. The R6 trigger contradicts `createBlocked`'s `pickFirst` branch and an existing test.**
- **Plan:**
  - Task 4 Step 3 (:234): "opened when `made.needs` is non-empty. `createBlocked` stays for `missing`."
  - Step 1 (:230): "`missing` stays blocked, as today."
  - Neither line says what happens to `pickFirst`.
- **Source:**
  - `createBlocked` returns `pickFirst` for any need other than the title (`App.tsx:674-675`). That reaches the button through `addBlocked` (`App.tsx:417, 577`).
  - The existing test `App.test.tsx:1540-1548`, "waits for a pick the dataset needs, and says which", asserts that block ("Kies eerst Productie").
  - If the branch stays, a target that needs a required single relation never opens the dialog. That is against R6's "or another field the view cannot fill", and QuickCreate can ask that field (`RelationSelect`, `QuickCreate.tsx:35`; `askedOf` keeps required needs, :72).
  - If the branch goes, that test turns red, and no task owns it.
- **Smallest change:**
  - Task 4 Step 3: "`createBlocked` keeps `readOnly` and `missing`; its `pickFirst` branch (`App.tsx:674-675`) goes."
  - Task 4 Step 1: rewrite `App.test.tsx:1540` as "+ Nieuw opens QuickCreate asking Productie", and list `App.test.tsx` in Task 4's Files.

**S2. The shared `ActionInputs` needs a record the selection bar does not have.**
- **Plan:** Files (:103) and Task 2 Interfaces (:168) say `SelectionBar` uses `ActionInputs`, the drawer's `Action` moved out.
- **Source:**
  - `Action` takes `record` (`Drawer.tsx:360`). A relation input with `options_from` builds its candidates from it (`Drawer.tsx:388` → `api.ts:230-231`, filter = `record[own]`).
  - The engine lets any action input declare `options_from`, checked against the `on` dataset's columns (`validate.ts:561-565`).
  - The bar has no single record. Passing `{}` filters on nulls and silently shows no candidates.
- **Smallest change:**
  - Task 1: `checkActions` refuses `options_from` on a selection action's input, with a "validation refuses …" test in `selection-actions.test.ts`.
  - `ActionInputs`' `record` becomes optional.

**S3. One hook is named two ways.** The Files table (:104) still has round 1's `useSelection(rows, resetKey)`. Task 2 Interfaces (:167) has `useSelection(rowIds: number[])`, pruned on every change. Change :104 to match :167.

## Note

- **N1.** Task 3's `Drawer.test` "offers a selection action: its button calls `onAction`" (:205) already passes today.
  - The drawer renders every served action (`Drawer.tsx:214`), and `engine.ts:198` keeps the served action objects whole.
  - The R4 behaviour is App's `act`, which "a drawer run sends the open record alone" (:206) covers. Add `App.test.tsx` to Test map row 4.
- **N2.** `openRelated` closes the parent drawer (`Grid.tsx:315`), and closing the related drawer leaves no drawer open (`Grid.tsx:349`). "Back on the parent" in link-opens-record means reopening the parent row.
- **N3.** QuickCreate sends only the asked keys and the preset (`QuickCreate.tsx:88, 95`). `createThrough` sent all of `made.fields` (`App.tsx:420`).
  - So a target's optional `date_field`, which `newRow` fills (`grid/newRow.ts:36`), is dropped, and a record added on a calendar would land with no day.
  - The fixture's required date hides this. Studio's `agendapunt.datum` is non-nullable on `feature/studio-domain`, so studio is safe today.
  - One line in Task 4, or pass the calendar's day as `preset`.
- **N4.** "App pushes the batch into history" (:224, :235) also gives the quick creates on board, calendar, gallery and timeline views, outside queries, an undo they lack today (`App.tsx:578, 617, 649`). State it, or scope it to the query path.
- **N5.** Where the checkbox goes:
  - A new tanstack column shifts the keyboard model's indexes (`visible[active.col]`, `Grid.tsx:288-293`, copy and paste :296-308).
  - The existing `#` cell (`GridHeader.tsx:44, 51`; `GridBody.tsx:145`) sits outside them, but it is `aria-hidden`.
  - One sentence in Task 2 Step 4 saves a ruling at execution.
- **N6.** Selection.test's "change the filter, the search, the space and the period window" (:180): filter, space and period are App's (`App.tsx:385`). At Grid level all three are a change of rows. Say so, or test those causes in `App.test.tsx`.
- **N7.** "Selectie wissen" (spec.md:15) has no test. In Task 1's "no ids", name both `{}` and `{ ids: [] }`.

## Round-1 findings against source
- **B1** (R5 write): resolved by making the opened link record read-only (spec R5, plan :40, :209). The replacement premise fails: new B1.
- **B2** (R6 on a calendar): resolved. Every query view with `creates` goes through QuickCreate with `model={target}` (:234), the fixture's query is a calendar (:101), and the flow runs on it (:238). This holds against `App.tsx:390, 578, 647-649`, and `QueryDecl.calendar` exists (`declare.ts` QueryDecl).
- **B3** (R6 trigger): resolved in direction (`needs`, not `missing`). The `pickFirst` remainder is S1.
- **B4** (space scope): resolved. The test runs as an owner (:133, :126). `access.ts:75` and `SPEC.md:81` match Threat 1.
- **S1** (`runAction` signature): resolved. `runAction` is unchanged and `runSelection` is new (:169). The matrix calls are untouched (`matrix/store.ts:15, 287`; `hooks.ts:11`). `bun run check`, which includes typecheck (`package.json:14`), is in :193, :213 and :239.
- **S2** (OpenAPI body): resolved (:100, :116, :127, :137). It hits `openapi.ts:113-136`.
- **S3** (empty ids, cap): resolved (:36, :135-136).
- **S4** (selection outliving the view): resolved (:167, :180-181). The stale Files row is S3.
- **S5** (Undo after a quick create): resolved. `create` returns `{ row, batch }` (`api.ts:272-282`).
- **S6** (drawers beyond the table): resolved by spec R4/R5 and :209. `openRelated` exists only under Grid (`Relation.tsx:10-13` default has none).
- **S7** (tests that cannot see their claim): resolved (:61, :183-185, :206).
- **N1–N7:** all addressed (:151, :17, :52, :103, :46/:99/:141, :234, :63).

## Premises checked
- QuickCreate's props `{ label, model, tables, scope, window, preset, onClose, onCreated }` → `dashboard/QuickCreate.tsx:76-83` → holds. `onCreated()` carries nothing today (:95-97). `create` yields a batch (`api.ts:278-282`), so `onCreated(batch)` is feasible → holds.
- QuickCreate asks the title and required fields, and nothing on `missing` → `QuickCreate.tsx:66-73, 112, 120` → holds. It sends only asked keys and the preset (:88, :95) → N3.
- `quickAdd` (`App.tsx:390`), `onAdd` empty on a calendar (:578), `made` / `createBlocked` (:415-433, :671-676) → hold. `pickFirst` blocks non-title needs (:674-675) → S1.
- The drawer's private `Action` → `Drawer.tsx:360-402` → holds. Moving it is feasible, but it needs `record` for `options_from` (:388) → S2.
- "The drawer's existing link remove" → `drawer/Sections.tsx:68-107`, `PlaceRow.tsx:29-47`, `place.ts:16-27` → **does not hold**. The remove is the sheet's `LinksEditor` (`cells/Links.tsx:152-207`; `App.tsx:499-506`) → B1.
- `openRelated(target, id)` reads `GET /rows` as the caller and opens a read-only drawer → `Grid.tsx:310-318, 349-350`; `api.ts` `rowOf` → holds. It also closes the parent drawer → N2.
- The table's drawer is the only one with actions, and it renders all of them → `Grid.tsx:351-354`, `Drawer.tsx:214` → holds.
- Owner path → `packages/engine/test/actions.test.ts:19, 162, 200` (`signIn(app, 'owner', OWN)`, owners on the fixture's project) → holds.
- `openapi.ts` `actionPath` hard-codes `required: ['id', 'input']` → `openapi.ts:113-136` → holds. Its change is in Task 1.
- The matrix's use of `runAction(name, id, input)` → `matrix/store.ts:15, 287`, `matrix/hooks.ts:11`, `api.ts:331` → holds, and stays unchanged.
- `readRecord` / `updateAs` (`actions.ts:80-93`) and `contextOf` / `createAs` / `recordBatch` (`writes.ts`, imported at `actions.ts:13-24`) → hold.
- In-operator narrowing on `'many' in action` across the union; other callers → `test/options-from.test.ts:31` casts, `matrix.test.ts:174` and `openapi.test.ts:84` spread → no type break → holds.
- `checkOpen` from `checkMatrix` → `validate.ts:385, 389-412` → holds. `checkSections` → `validate.ts:603-616` → holds. `checkActions` → `validate.ts:553-567` → holds.
- `sectionsOf` / `groupTables` → `ui/tables.ts:25-48`, `Rail.tsx:81` → holds. `Table` has no `listed` yet; `tables.ts` is in Task 4's Files.
- A query may declare `calendar` and `creates` → `declare.ts` `QueryDecl` → holds.
- The MCP `action` tool and `assertId` → studio-mcp `packages/mcp/src/tools.ts:4, 30-33, 136-148`, `src/client.ts:22` → holds.
- The harness's `webServer` pairs, `--cookie-name`, `Instance` → `playwright.config.ts:15-50`, `e2e/auth.ts:6-24` → holds.

## Verdict
**not ready.** There is one Blocking finding (B1), and fixing it means re-pointing three plan lines and correcting one spec sentence. S1–S3 are small edits. After those the plan is ready.
