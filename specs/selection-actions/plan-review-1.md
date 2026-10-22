# Plan review: selection-actions
Reviewed-plan: 32c1a2fcc0c0c9f3437c1cf180d7c565ce20fa29 specs/selection-actions/plan.md

Verdict: not ready

The engine half (Task 1) and the MCP half (Task 5) rest on source that exists and behaves as the plan says. Three grid premises are false: R5's "write", R6's trigger, and R6's reach to a calendar. The test behind Review Focus 1 also rests on an access rule the engine does not have.

## Blocking

**B1. R5: the record a link item opens cannot be written. Task 3 has no step for it.**
- **Plan:** Architecture says "R5's link opening reuses `openRelated`". Threat 4 says "Writes go through the dataset's writer as any record's do". Task 3 Step 4's flow says "edit its state, and the parent's link list shows the new state".
- **Source:**
  - `openRelated` builds the related record's columns with writable `false` (`apps/grid/src/grid/Grid.tsx:316`).
  - It renders the drawer with no `onWrite`, `onLink` or `editor` (`Grid.tsx:349-350`).
  - It also closes the parent drawer (`Grid.tsx:315`).
  - No drawer edits a short field at all. `Drawer.tsx:84-85` says "The drawer reads; a checkbox's toggle is the sheet's", and `Drawer.tsx:129-137` shows values through a read-only `Display`.
  - The only place `actie_site.state` can be edited today is the sheet of that dataset's own table. `listed: false` takes exactly that out of the tree.
- **Why studio needs it:** studio drops a site by writing `actie_site.state` from `te_bevestigen` to `overgeslagen` (78ce848 `packages/studio/src/writers/actie-site.ts`, `checkState`). Spec R5 requires "fields read and write as any record's do".
- **Smallest change:** Task 3 gains a step and a test that make the related drawer write. That means:
  - `onWrite` for long text;
  - `DeleteRow` when the model is `deletable`;
  - writes through `api.update` / `remove` with a history entry, then a re-read of the parent row.
  - For the state edit, either add a drawer field editor (no drawer has one, so this needs Stefan's ruling first), or drop "edit its state" from the link-opens-record flow.

**B2. R6 does not reach a calendar on a query, which is the case the spec names.**
- **Plan:** Task 4 Step 3 changes only `add` in `App.tsx`.
- **Source:**
  - `quickAdd` is `!model?.query && (… || Boolean(calendar))` (`App.tsx:390`), so it is false on any query.
  - `onAdd` is `undefined` whenever `calendar` is set (`App.tsx:578`).
  - So a calendar view of a query has no `+ Nieuw` at all, and `add` never runs there.
- **Why studio needs it:** spec R6 says "Studio's Agenda is a calendar on a query that creates `agendapunt`". It is seeded as `skin: 'calendar'` on `agenda` (78ce848 `packages/studio/src/seed.ts:364`).
- **Smallest change:** route every view of a query with `creates` through the existing quick-create path, with `model={target}` and `label=newLabel(target)` (`App.tsx:647-649`). Make the fixture's query a calendar, and run the add-from-query flow on that calendar.

**B3. R6's trigger names the one case QuickCreate cannot serve, and misses the fixture's real case.**
- **Plan:** Task 4 Step 3 says "`add` opens QuickCreate for `target` when `made` reports missing fields". The fixture is "a dataset with a required date". The test expects "the dialog asks title and date, saves".
- **Source:**
  - With `missing`, QuickCreate asks nothing (`dashboard/QuickCreate.tsx:67`) and disables Create (`QuickCreate.tsx:120`).
  - `newRow` fills a required date itself (`grid/newRow.ts:36`), so the fixture yields `{ needs: ['title'] }`, not `missing`.
  - Today that case either creates at once with no title (`App.tsx:420`) or is blocked by `pickFirst` (`App.tsx:674-675`).
- **Smallest change:** open QuickCreate when `made` has a non-empty `needs` (the title included). Keep `missing` blocked, and change `createBlocked` to match.

**B4. The test behind Review Focus 1 assumes an editor can be out of scope by space. The engine has no such rule.**
- **Plan:** Task 1 Step 2: "an editor with a space scope sends one id from another space → 404 `unknown_record`". Threat 1 also lists "another space".
- **Source:**
  - `scopeOf` returns `'all'` for every non-owner (`packages/engine/src/access.ts:75`).
  - `docs/SPEC.md:81` says a space "never limits what they may read … the engine never filters by space". The engine will answer 201.
- **Smallest change:** run the denial as an owner, as `packages/engine/test/actions.test.ts:200` does. Give `selection-domain.ts` an `owners` column and an owner account, and remove "another space" from threat 1.

## Should fix

**S1. Changing `runAction`'s signature breaks files and tests the plan does not list.**
- **Plan:** Task 2 Interfaces: `runAction(name, target: {id}|{ids}, input)`.
- **What breaks:**
  - The type check, via `matrixWrites.runAction = runAction` (`matrix/hooks.ts:11`) against `MatrixApi.runAction(name, id: number, …)` (`matrix/store.ts:15`).
  - Existing tests: `api.test.ts:587`, `ui/App.test.tsx:1620`, and the matrix tests (`store.test.ts:951`, `Matrix.test.tsx:588`).
- This contradicts the Global Constraint "existing tests pass untouched". Task 2 never runs `bun run check`, so the break first shows at the gate.
- **Smallest change:** keep `runAction(name, id, input)` and add `runSelection(name, ids, input)`. Add `bun run check` to the run steps of Tasks 2–4.

**S2. The OpenAPI document will describe a selection action with the wrong body.**
- `actionPath` hard-codes `required: ['id', 'input']` (`packages/engine/src/openapi.ts:113-136`).
- `ServedSource` will accept the extra `many` without a type error (`openapi.ts:11`).
- `/schema?format=openapi` is on the spec's surface (`docs/SPEC.md:100, 135`).
- **Smallest change:** add `openapi.ts` to Task 1, with an `ids` body (1–500) for `many`, and a test row.

**S3. R3 is not fully tested.**
- An empty `ids` (spec R3: "No ids → 400") is neither in `idsOf`'s rules (Threat 2) nor in a test. "a zero" in the test means the id 0, not an empty list.
- Review Focus 4 ("exactly 500 runs") has no engine test, so an off-by-one at the cap would pass.
- **Smallest change:** add `[]` → 400 and "500 ids run" to `selection-actions.test.ts`.

**S4. The selection can outlive what is shown, against Review Focus 2.**
- `resetKey` joins the view, filter, search and space only (Task 2 Interfaces).
- A table's period window, or a `reloadView` after a write, changes the rows without clearing the selection (`App.tsx:399, 430`).
- The spec's "folded groups included" has no test either.
- **Smallest change:** prune `selected` to the shown ids on every change of `rowIds`, add a test for it, and add a "folded groups included" test.

**S5. "Undo removes it" in the add-from-query flow has no path.**
- QuickCreate's `onCreated()` carries no batch (`QuickCreate.tsx:95-97`), so nothing goes into history.
- Compare `createThrough`, which pushes one (`App.tsx:426-433`).
- **Smallest change:** pass the batch out of QuickCreate and push it into history, or drop Undo from the flow.

**S6. Link items only open in the table's drawer, but R5 says "in a record's drawer".**
- `openRelated` is provided only by Grid (`Grid.tsx:333`).
- The board, calendar, gallery and dashboard drawers come from `useOpenRow.tsx:22`, with no `RelationContext` behind them.
- Studio's "Acties per status" is a board (78ce848 `seed.ts:297`).
- **Smallest change:** either state that R5 covers the table's drawer only (Stefan's ruling), or give `useOpenRow` an `openRelated`.

**S7. Two Test map rows name tests that cannot see their claim.**
- `Drawer.test.tsx` can only see `onAction(action, input)`. The `{ ids: [row.id] }` body is decided in App's `act` (`App.tsx:535-545`).
- "One notice, one Undo" is also App-level, so `Selection.test.tsx` cannot see it unless it renders App.
- **Smallest change:** put the `act` assertions in `ui/App.test.tsx`, where `api.runAction` is already mocked (`App.test.tsx:12, 1585`).

## Note

- **N1.** `SelectionActionDecl` is not added to `packages/engine/src/index.ts:4-39`. Studio imports its types from `@worktable/engine`.
- **N2.** `bun run check` scans only `packages/engine` for domain words (`package.json` "check"; `check-vocabulary.ts` root default), with theatre and fiche words only. `apps/grid` and studio's words are not checked, so the Global Constraint overstates what the check enforces. Choose neutral fixture words by hand.
- **N3.** The deferral "the existing per-account rate limits apply" holds for service accounts only (`rate-limit.ts:14`). Cookie sessions have no such limit.
- **N4.** The drawer's input UI `Action` is private to `Drawer.tsx:360`. For "opens its inputs, as an action in the drawer does", `SelectionBar` needs it exported or moved. The plan should say which.
- **N5.** A query declared `of` an unlisted dataset loses its views from the tree as well (`ui/tables.ts:25-36`). Either refuse it in validation or rule on it.
- **N6.** Simpler R6 design: one quick-create path for every skin of a query with `creates` (see B2), rather than a branch inside `add`.
- **N7.** The Rail row's command "as above" does not say which command. Name `bun run --filter @worktable/grid test -- Rail`.

## Premises checked

- `runAction`: one transaction, `readRecord` as the caller, one batch → `packages/engine/src/actions.ts:96-123` → holds
- `readRecord`, `contextOf`, `createAs`, `updateAs`, `recordBatch` are available → `actions.ts:80-93`, `writes.ts` imports at `actions.ts:13-24` → holds
- An editor can be out of scope by space → `access.ts:74-80`, `SPEC.md:81` → does not hold (B4)
- The matrix fill check sits in `checkMatrix` → `validate.ts:385` calls `checkOpen` at `validate.ts:389-412` → holds
- The grid hides the fill from the model's actions → `apps/grid/src/engine.ts:198, 241` → holds
- `actionsOn` / `servedActions` feed `/schema` → `actions.ts:125-129`, `app.ts:127-133, 317` → holds; OpenAPI also consumes it → `openapi.ts:113-136` (S2)
- `QueryDecl.creates` and App's `made` / `createBlocked` path → `declare.ts:193`, `App.tsx:415-433, 671-676` → holds for table views only (B2, B3)
- `QuickCreate({ label, model, tables, scope, window, preset, onClose, onCreated })` → `QuickCreate.tsx:76-83` → holds; returns no batch (S5); asks nothing on `missing` (B3)
- `RelationContext.openRelated(target, id)` reads `GET /rows` as the caller → `cells/Relation.tsx:10-13`, `Grid.tsx:310-318`, `api.ts:304-307` → holds; Grid only (S6); opens a read-only drawer (B1)
- `LinkItem` carries the link row's id → `types.ts:57-63`, `drawer/Sections.tsx:56-57, 86-89` → holds
- Link items render in `PlaceRow` inside `LinkSection` → `drawer/PlaceRow.tsx:29-47`, `Sections.tsx:68-106` → holds
- The table's drawer is the only one with actions → `Grid.tsx:351-354`, `useOpenRow.tsx:22` → holds
- `sectionsOf`: engine → `app.ts:95-103` (filters only by what the caller can read); grid → `ui/tables.ts:40-48` → holds
- `checkSections` is the place to refuse an unlisted dataset → `validate.ts:603-616` → holds
- e2e harness: `webServer` pairs, `Instance`, `cli --domain`, `global-setup` → `playwright.config.ts:15-50`, `e2e/auth.ts:6-45`, `e2e/global-setup.ts` → holds
- `--domain <path>` with a default export → `serve.ts:82-83` (`Bun.resolveSync`) → holds
- `check-vocabulary` scans `packages/engine/test` → `check-vocabulary.ts:24-27, 56-63` → holds
- `testEngine(sqlite, domain)` → `packages/engine/test/sign-in.ts:16` → holds; MCP tests already use it (studio-mcp `packages/mcp/test/tools.test.ts:10, 59`)
- Grid runner `bun run --filter @worktable/grid test -- <name>` → ran with `-- Spinner`: 1 file, 2 tests → holds
- The MCP `action` tool and `assertId` → studio-mcp b04fcac `packages/mcp/src/tools.ts` (`action`), `src/client.ts` (`assertId`) → holds; `src`-only boundary, so tests may import the engine → holds
- The grid's `runAction` is used only by App → `api.ts:331`; `matrix/hooks.ts:11`; `matrix/store.ts:15, 287` → does not hold (S1)
- Theatre's `ActionDecl` is unaffected by the union → `packages/theatre/src/actions.ts:53, 90, 113` → holds

## The cut

This is one plan, not a set, so this section only answers your question about studio. Does the plan give studio what it needs?
- **One request record holding every selected site:** yes. A selection action's `run` returns one create with `children` (`declare.ts:308-312`).
- **Per-site action from the drawer:** yes, in table views (R4).
- **Reachable `actie_site` records:** readable from table drawers only, and not writable, so dropping a site cannot be done (B1, S6).
- **Adding to the agenda from the agenda query:** no. The calendar has no `+ Nieuw` (B2).

Studio's re-plan will hit B1, B2 and S6 the moment it builds on this branch.
