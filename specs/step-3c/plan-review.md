# Plan review: step 3c, skins and the dashboard (second pass)

Reviewed-plan: f384ed6eda647bb80eee41b0aa1f099fe2bd2a66 specs/step-3c/plan.md
Verdict: ready with fixes

The first pass (blob a818f34, not ready) is this file at commit 4943cf1.

Both Blocking findings from the first review are resolved, and every premise I checked holds in the source. R1–R9 and G each have a task, and every threat-model mitigation has a row. Six Should-fix findings remain. Each needs a plan change of a line or two.

## Earlier findings

- **B1:** resolved. Task 3 adds `date: 'start_datum'` to speelreeks.
  - Only these paths read `date_field` for a grid view: `newRow` (`App.tsx:329`; `start_datum` is required and was filled already), the ICS export (`App.tsx:388`) and the export sheet (`App.tsx:359`).
  - The grid view's `window` stays `{}` (`App.tsx:279`), so the Tourstops grid does not narrow. The tourstop flows that create through the grid (`step-1.spec.ts:157-187`, `ui-fit.spec.ts:343`) should be unaffected.
- **B2:** resolved by Stefan's ruling and Task 5b. One gap remains: S4 below.
- **S1–S4, S6, S8:** resolved.
- **S5:** resolved, except the R5 rule in S3 below.
- **S7:** stat-red and week-opens are resolved. The werklijst flow has a new problem: S1 below.
- **N1:** resolved in the threat model, but Task 1 still contradicts it (S5 below).
- **N2, N3, N5, N7, N8:** resolved.
- **N4:** only partly resolved (Note below).
- **N6:** left in Review Focus (Note below).

## Blocking

None.

## Should fix

**S1. The werklijst-set flow asserts a stat that does not exist, and its taak may never show in the list (Task 7 werklijst-set and quick-create; G "a werklijst row action runs from the list, and the stat updates after").**
- Plan, Task 7: "make an open taak; 'Gedaan' in the Te doen list removes it, and the Werklijst count drops."
- The seeded "Nu" stats are Conflicten, Open plaatsen (werklijst `open_slot`) and Onbeantwoord (werklijst `onbeantwoord`), plus progress (Task 3). A `set` writes only taak rows: `taak_id` is NULL on every other werklijst branch (`packages/theatre/src/queries/werklijst.sql:13-48`). So no stat on the page changes, and "the Werklijst count" is not a number the plan puts on screen. Task 4's list tile shows rows, "Alles tonen" and `set`, and no total.
- The list shows 8 rows sorted by `deadline` ascending (`seed.ts:411-418`). Under the Global Constraint a flow's taak sits in 2028-06 or later, so it sorts behind every nearer row and can fall outside the 8. quick-create has the same problem: `newRow` fills `deadline` with today (`newRow.ts:36`, taak `date: 'deadline'`).
- Smallest change, in two parts:
  1. Name the on-screen number that drops. Either Task 4's list tile shows its view's `total` in its title, or Task 3 adds a Werklijst stat to Nu. Task 7 asserts that number before and after.
  2. Give the flows' taak no deadline, so it sorts first (SQLite puts NULLs first in an ascending sort), and state this as a second exception to the 2028 constraint.

**S2. Existing landing assertions break once the dashboard lands, and no task updates them (Task 4).**
- Task 4 changes the landing (`App.tsx:218`, `tables[0]?.views[0]`).
- `e2e/rail-tree.spec.ts:25-35` (dagplanning-is-gone) waits for `/api/rows/activiteit` on `goto('/')` and asserts that the landing heading is "Planning".
- `rail-tree.spec.ts:9` (tree-scrolls-in-rail) expects Activiteiten to be expanded on landing.
- Task 3 runs `rail-tree` only "to fix counts". Task 4's steps run grid unit tests and take a screenshot, but no e2e.
- Smallest change: Task 4 names these two specs and the `App.test.tsx` landing cases, and runs `bunx playwright test e2e/rail-tree.spec.ts` before committing.

**S3. R5's "shows only on rows whose write key is set" has no test (Task 4).**
- Werklijst's open_slot, onbeantwoord and optie rows have `taak_id` NULL. Clicking `set` on one reaches `updateThrough`'s `read_only` throw (`apps/grid/src/api.ts:281`).
- Smallest change: add to Task 4's `Dashboard.test.tsx` "a list row whose write key is null shows no set button". Also say that the tile passes `row` to `update(model, id, data, row)`. `update` already sends a query through `updateThrough` (`api.ts:264`), and without `row` it throws (`api.ts:279`).

**S4. The copy's `shared` value is unstated, and under the ruling it decides everyone's landing (Task 5b).**
- Plan, Task 5b: "saves a copy through `createView` with the layout and `shared`".
- If the copy is `shared: false` (as the cited pattern `useSavedViews.ts:180` does), an administrator's composition lands only for that administrator. "Administrators compose the dashboard" then reaches no one else.
- If it is `shared: true`, then the first editor who saves a shared copy becomes "the first dashboard shared by someone else" for every other user. "Bewerken toggles edit mode on any dashboard" does not limit who can do this, and `POST /views` accepts any `views.write` actor (`views.ts:269-283`).
- Smallest change: state the value. For example, the copy keeps `shared: true` when an administrator saves it and `false` for anyone else. Add one test per case.

**S5. Two tasks name the dashboard publish refusal two ways (Task 1 Files vs. threat 2).**
- Task 1: "The share-token and for-owners routes refuse a dashboard with 400 `bad_view`."
- Threat 2: "No new guard is needed", because the existing checks answer 400 `not_query` (`views.ts:334`, `views.ts:360`).
- `findings.md:104` asks for `bad_view`. Task 1 Step 1's test ("… are 400") passes either way.
- Smallest change: pick one. If it is `bad_view`, keep the Task 1 bullet, correct threat 2, and assert the code in the test. If it is `not_query`, delete the Task 1 bullet.

**S6. The existing seeded-view test will post the dashboard seed with names, and stored layouts take ids (Task 3).**
- `packages/theatre/test/step3-queries.test.ts:376-385` posts every `theatre.views` entry as it is.
- Task 1 says "A seed names views by name (string). A stored layout names them by id (number)." So the Overzicht seed gets 400 and the existing test fails. Task 3's "extend it to the dashboard" does not say how.
- Smallest change: Task 3 says that the test resolves the dashboard seed's names to the ids from `GET /views` (or through `resolveSeedLayout`) before posting.

## Note

- **N1. `statOf` "uses `rows()` with `limit=1`".** `rows(view, window, scope, layout)` (`api.ts:108`) and `rowsQuery` (`engine.ts:442`) take no limit. Either `rows()` gains one, or `statOf` calls `rowsOf` directly. The plan should say which, or accept a full read for a count.
- **N2. Previous period for a month.** "shifted back by its own length (`windowOf` + `shift`)" does not give the previous calendar month. `shiftMonth` exists (`Window.tsx:48`). The test "for a week and a month" will need it.
- **N3. Timeline grouping (first review N4).**
  - Task 6 says "Task 1's `groupOf` restricts a timeline's `group_by`", but Task 1's Files never list `groupOf` (`views.ts:132`).
  - Move the line into Task 1 or Task 2, with one T2 test: "a timeline grouped on a non-lane is 400".
- **N4. Review Focus is stale (first review N6).** "An editor cannot share-token a dashboard" proves nothing (`access.ts:31`). Threat 2 already points at the administrator test. Delete the line.
- **N5. A list tile's `rows` has no cap.** Threat 6 caps sections, tiles, actions and labels, but `rows: number` is unbounded. Add a bound to `layoutOf`'s caps, for example 1–50.
- **N6. Rail placement.** The rail renders through `sectionsOf` (`ui/tables.ts:40-48`), which puts any table no section lists in a trailing unlabelled section. A synthetic Dashboard table therefore lands last unless Task 4 special-cases it. Its node actions (rename display through `setDisplay`, and `+`) also need a ruling for a non-source group.
- **N7. A simpler route for the quick-create dialog.** `madeFrom` (`App.tsx:540-544`) already builds the `View`, applies the scope where the dataset is scoped, and calls `newRow`. Exporting it is simpler than rebuilding it in `QuickCreate.tsx`.
- **N8. Spanning reads.** When `App.tsx` sends the overlap filter in place of from/to, it must also drop the view's own date condition on `day`. Otherwise the stored `between` still cuts rows that start before the window. `rowsQuery` drops that condition only when it sends from/to (`engine.ts:444-445`).
- **N9. PATCH on a non-dashboard.** `outOf` will now carry `layout: null`, and the PATCH path rebuilds from it (`views.ts:293`). `viewBody`'s "takes no layout" must treat null as absent.
- **N10. "Conflicten reads 1".** One overlap between two activities may give one row per assignment. If the stat reads 2, the flow should assert "at least 1, red" before the fix, and "0, neutral" after it.

## Premises checked

- `viewBody(input, domain, creating)` at `views.ts:155`, callers at :282 and :293 → holds
- `ownedView` 403 `read_only_view` for `SYSTEM_OWNER`, 403 `not_owner` for another user's shared view → `views.ts:183-186` → holds (the source of Task 5b)
- `editable` = mine, and not published unless the caller is an administrator → `views.ts:69-70` → holds
- `listViews` drops a view whose source is unknown → `views.ts:249-258` → holds (Task 1 special-cases it)
- `seedOrdered` keys on `name\0source` → `views.ts:261-267` → holds
- `checkSize` 16 KB → `views.ts:141-145` → holds
- `groupOf` restricts lanes only for calendar → `views.ts:132` → holds (N3)
- `checkPublishable` and `forOwnersProblem` answer `not_query` for a source-less view → `views.ts:334,360` → holds (S5)
- `/public/views/:token` requires `source_type = 'query'` → `views.ts:434` → holds
- `seedDomain` inserts seeds with `owner_id: SYSTEM_OWNER, shared: true` → `migrate.ts:144-152` → holds
- `adoptUnowned` compares `seed.source === v.source` → `migrate.ts:121` → holds
- `seedViews` uses `source = ?` → `seed-missing.ts:148` → holds
- `removeUndeclared` → `seed-missing.ts:169-172` → holds
- `nameOrphans` → `seed-missing.ts:200` → holds
- `DECLARED` → `seed-missing.ts:42` and `storedView` → `seed-missing.ts:88-101` → hold
- `checkCalendar`: day = source date, start and end datetime → `validate.ts:80-85` → holds (Task 2 relaxes end under `spans`)
- Speelreeks has no `date`; `start_datum` and `eind_datum` are date columns → `datasets.ts:326-347` → holds (Task 3 adds the date)
- Beschikbaarheid `date: 'start_at'`, start_at and eind_at datetime → `datasets.ts:282-288` → holds
- Activiteit `date: 'plandag'`, start_at and eind_at datetime, `productie_id` and `speelreeks_id` are relations, attachments with kind `foto` → `datasets.ts:48,109-120,149` → holds
- Toewijzing `state` has options and is the lifecycle column → `datasets.ts:233-258` → holds
- `CalendarDecl` has no `spans`; `SavedViewSeed` skin is `table|matrix|calendar` → `declare.ts:120-125,178-187` → holds
- `declaredOf` holds the owner and `owner_visible` rule; `liveRecord` applies the scope → `attachments.ts:84-96` → holds
- `/attachments/file/:id` registered before `/attachments/:dataset/:id` → `attachments.ts:291,307` → holds
- `servedColumn` inherits a `writes` target's options → `app.ts:105-112` → holds
- Werklijst `status` writes `taak.status` and declares no options; it is unscoped; it sorts by deadline → `queries.ts:218-223`, `seed.ts:411-418` → holds (S1)
- Conflicten is scoped by `productie_id`; overlap has no horizon → `queries.ts:84`, `conflicten.sql` → holds
- The existing test posts every seed through `/views` → `step3-queries.test.ts:376-385` → holds (S6)
- `toSavedViews` drops a source-less view → `engine.ts:370-374` → holds (Task 4 changes it)
- `tableDefOf` types are only `grid` and `calendar` → `engine.ts:243-255` → holds
- `createView` and `updateView` call `sourceOf(view.table)` → `api.ts:319-330` → holds
- `update` sends a query through `updateThrough`, which needs `row` → `api.ts:261-288` → holds (S3)
- `rows()` takes a limit → `api.ts:108`, `engine.ts:442` → does not hold (N1, minor)
- `awayRows` overlap with `T23:59:59` → `api.ts:192-195` → holds
- `App.tsx:218` landing, `:229-232` scope, `:341` `createThrough`, `:540` `madeFrom` → hold
- Copy pattern → `useSavedViews.ts:177-186` → holds (it saves `shared: false`, see S4)
- `groupTables` declared only; rail goes through `sectionsOf` → `ui/tables.ts:25-48`, `Rail.tsx:56` → holds (N6)
- `kinds()` blocks Bord as later → `Rail.tsx:86-95` → holds
- `TypedInput` is unexported in `grid/Drawer.tsx:177`; `RelationPicker` is in `grid/cells` → holds
- `newRow` returns needs and offers, the scope, and fills the date → `grid/newRow.ts:24-49` → holds
- `placeEvents` keeps only an event's own day; `calendarWindow` gives a week or month as it is, else the starting week → `calendar/layout.ts:65-73,145-149` → holds
- `windowOf` → `conditions.ts:177`, `shift` and `shiftMonth` → `Window.tsx:28,48` → hold
- Landing assertions in `rail-tree.spec.ts:9,31-35` → hold (S2)
- `@worktable/grid`, `bun run gate`, `bun run check` → `apps/grid/package.json:2`, `package.json:13-17` → hold
- `ARCHITECTURE-INVARIANTS.md` → absent → no invariant checks to name

## The cut

One plan, so there is no cross-plan cut. Inside the plan, the composer is now its own task (5b), and the order holds: Tasks 1 and 2, then Task 3, then Tasks 4 through 6, then Task 7.
