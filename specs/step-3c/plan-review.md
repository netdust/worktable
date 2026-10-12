# Plan review: step 3c, skins and the dashboard

Reviewed-plan: a818f348aa95d83bea2da7d1f91019d6981ae0fe specs/step-3c/plan.md
Verdict: not ready

Two premises are false in the source. Both are small to fix in the plan. Everything else is Should fix or Note.

## Blocking

**B1. Speelreeks has no `date`, so its calendar need fails validation (Task 2 and Task 3, R8).**
- Plan, Task 3: "Beschikbaarheid and Speelreeks: `calendar` with `spans` (R8)". Plan, Task 2 `checkCalendar`: "`day` stays the source's date".
- Source: `packages/engine/src/validate.ts:80` refuses with `if (cal.day !== source.date) throw at(cal.day, …)`. `packages/theatre/src/datasets.ts:325-347` (speelreeks) declares no `date`. Activiteit (`date: 'plandag'`, line 109) and Beschikbaarheid (`date: 'start_at'`, line 282) already match.
- Effect: `validateDomain` throws at migrate, so Task 3 cannot boot.
- Smallest change: Task 3 adds `date: 'start_datum'` to speelreeks. The task should also say that this gives Tourstops a dated grid: the window, and `newRow` filling the day. Or the plan makes a ruling that, with `spans`, `checkCalendar` drops the day = date rule. That would contradict Task 2's own line, so adding `date` is the smaller change.

**B2. Administrators cannot "compose in place" the only dashboard there is (Task 5 Composer, R7, G).**
- Plan, Task 5: the Composer is "shown for an administrator, or the view's owner when it is their own … 'Opslaan' calls `updateView(view, { layout })`".
- Source: `packages/engine/src/views.ts:183`. `ownedView` throws 403 `read_only_view` for `owner_id === SYSTEM_OWNER`. The seeded Overzicht is inserted with `owner_id: SYSTEM_OWNER` (`migrate.ts:150`, `seed-missing.ts:105`).
- `views.ts:184-186` also throws 403 `not_owner` when an administrator PATCHes another person's shared view. So "shown for an administrator" does not match the engine. Only `view.editable` (`outOf`, `views.ts:69-70`) can save.
- `findings.md` (F4, Composition) says: "A system-seeded dashboard is changed by saving a copy, as any system view is." Task 5 has no copy path. Its tests ("the composer … sends the layout") would pass with a mocked `updateView` and fail in the artifact.
- Linked question: `seedOrdered` (`views.ts:261-267`) lists system seeds first. A copy therefore never becomes "the first dashboard view the caller can read". An administrator's composition never lands, which affects the G landing.
- Smallest change:
  - gate "Bewerken" on `view.editable`;
  - on a non-editable dashboard, "Opslaan" saves a copy through `createView` with `layout` and `shared` (`useSavedViews.ts:177-182` is the existing copy pattern);
  - get a ruling from Stefan on which dashboard lands when a copy exists (for example: the caller's own first, then shared, then system).

## Should fix

**S1. Werklijst `status` declares no options, so the seeded `set` fails `layoutOf` as written (Task 1 and Task 3, R5).**
- Task 1 checks that "a `set` column is an options column that writes … and `value` is one of its options".
- `packages/theatre/src/queries.ts:218-223` declares `status` with `writes` and no `options`. The options are inherited only when `/schema` serves the column (`app.ts:105-112`, `servedColumn`).
- If `layoutOf` reads `source.columns`, it refuses the seed `set: { column: 'status', value: 'gedaan' }`, and seeding fails.
- Fix: Task 1 says `layoutOf` resolves a `writes` column's options from its target, as `servedColumn` does. Or Task 3 declares the options on werklijst.status.

**S2. Dashboard tiles get no space scope (Task 4, R7 "the space switcher narrows every tile", G space-narrows).**
- Task 4: `<Dashboard>` "takes … `scope`", and `statOf(view, layout, scope, …)`.
- `App.tsx:229-232` computes `scope` only for `view?.space === 'scoped'`. A dashboard view is built from no source, so `space` is unset and `scope` is null. Every tile would read unscoped, and quick creates (`newRow(…, scope)`) would get no space either.
- Fix: pass the `useSpace` state to `<Dashboard>`. Apply `space.scope` per tile, only where that tile's view has `space === 'scoped'`. The quick-create dialog does the same for its dataset.

**S3. A null source breaks every `name\0source` key, not only `seedViews` (Task 1).**
- Task 1 names `migrate.ts:150` and `seedViews`, "keyed by name and the empty source". The source has four more places that break, plus missing fields in the stored shape:
  1. `seed-missing.ts:148` uses `source = ?`, which never matches NULL. Each `--seed-missing` run would add another dashboard.
  2. `removeUndeclared` (`seed-missing.ts:169-172`) compares `Overzicht\0undefined` (seed) with `Overzicht\0null` (row). It would soft-delete every system dashboard on each run.
  3. `seedOrdered` (`views.ts:262-263`) has the same mismatch, so the seeded dashboard does not sort first.
  4. `adoptUnowned` (`migrate.ts:121`) and `nameOrphans` (`seed-missing.ts:200`) report the view as "has no source any more".
  5. `DECLARED` (`seed-missing.ts:42`) and `storedView` (`seed-missing.ts:88-101`) do not carry `layout`, so a changed seed layout is never brought up to date.
  6. `viewOf` (`views.ts:48-60`) and `stored()` (`views.ts:204-208`) do not carry `layout`. `PATCH /views/:id` rebuilds the input from `outOf(current)`, so a rename of a dashboard would reach `viewBody` without its layout.
- Fix: list these places in Task 1's Files. State the key: `source IS ?` with NULL, and one normalised key helper. Add a T1 test that runs `--seed-missing` twice and asserts exactly one live dashboard.

**S4. `viewBody`'s signature has to change, and the plan does not say so (Task 1 Interfaces).**
- `layoutOf(domain, sqlite, raw, actor)` needs `sqlite` and `actor`.
- `viewBody(input, domain, creating)` at `views.ts:155` has neither. Its callers are `views.ts:282` and `views.ts:293`.
- Fix: state the new signature in Task 1.

**S5. Review Focus lines with no test in their task.**
- T4/T5 "Empty": no sections shows the empty state with "Bewerken"; a stat over an empty view reads 0, neutral; a list over an empty view says so. None is in Task 4's or Task 5's test list.
- T4 "Re-entry": "an action that fails shows its refusal and leaves the stat as it was" is not in Task 4's tests.
- T6 "a timeline over 92 days falls back to the first week" is not in Task 6's tests.
- T2: the positive path is not tested ("answers each readable id's newest live file of that kind", including the kind filter). Step 1 lists only refusals.
- Fix: add one named test per line to the task that owns the row.

**S6. The owner denial test for the batched read can pass vacuously (Task 2, threat 4).**
- The owner rule lives in `declaredOf` (`attachments.ts:84-89`), not in `servedAttachments`. Without `owner_visible` an owner gets nothing whatever the scope, so the test never reaches `liveRecord`.
- The single read answers 404 `unknown_source` there (`recordOf`, `attachments.ts:98-100`). The plan's `{ files: {} }` contradicts R3's "same scope as the single read".
- Fix: reuse `declaredOf` and answer as the single read does. The scope test's fixture declares `attachments.owner_visible`, and the owner asks for ids both in and out of its scope.

**S7. The G flows as written cannot prove the gate (Task 7).**
- *stat-red-then-neutral:* "when it is 0, neutral" is conditional. The seed holds conflicts ("four from seeded data", `docs/SPEC.md:346`), so the stat never reaches 0 unscoped and neutral is never asserted. `conflicten` is scoped (`queries.ts:84`). Fix: build a production of its own, select it in the space switcher, then assert red, fix it, and assert 0 and neutral.
- *week-opens-activity:* "clicking this week's seeded activity" relies on fixed 2026-10 seed dates (`seed.ts:88`). It breaks after this week. The week strip shows only the current week, which contradicts the Global Constraint "rows in 2028-06 and later". Fix: create the activity relative to today, as step 3's gate did for open_slot (state the exception).
- *skins-open:* the seeded views carry no date condition, so they open on this week (`calendarWindow(null)`, `calendar/layout.ts:145-149`). Rows built in 2028 will not show. Fix: navigate the window to the rows' week, or seed with a condition.

**S8. Timeline window premise (Task 6).**
- Task 6: "a range of up to 92 days, else the first week, as `calendarWindow` normalises".
- `calendarWindow` (`calendar/layout.ts:145-149`) returns a week or a month as it is, and any other range as the week it starts in. It never passes a 92-day range.
- Fix: Task 6 adds its own `timelineWindow` with that rule and its test.

## Note

- **N1. Simpler design for threat 2.** Both share-token and for-owners already refuse a source-less view: `checkPublishable` (`views.ts:334`) and `forOwnersProblem` (`views.ts:360`) answer 400 `not_query`. The only new code is the `bad_view` code that findings asks for. Say so instead of presenting it as a new guard.
- **N2. Quick-create inputs need more than `TypedInput` (Task 5).**
  - `TypedInput` (`Drawer.tsx:177`) handles action-input types only: integer, date, text and boolean. A quick create needs select, datetime and real fields, and relations.
  - `newRow` needs a `View` (`newRow.ts:24`), and the dashboard has none for the dataset.
  - The step says what without showing how: the `FieldInput` type map, and building a `View` from the dataset's `TableDef`.
- **N3. Name resolution can be ambiguous.** `resolveSeedLayout` resolves by name alone. Seed names are unique today. Say that it refuses a name two seeds share.
- **N4. Timeline grouping.** `groupOf` (`views.ts:132`) restricts lanes only for `skin === 'calendar'`. Timeline should take the same rule, because the seeded Tijdlijn groups on `productie_id`.
- **N5. Layout size against the view cap.** `checkSize` caps a stored view at 16 KB (`views.ts:141-145`). A layout at the caps (6×12 tiles with 80-character labels, plus 8 actions) can exceed that and fail as `view_too_large`. Either accept this as the effective cap or say it.
- **N6. Review Focus "an editor cannot share-token a dashboard".** An editor can share-token nothing (`access.ts:31`), so that test proves nothing about dashboards. The meaningful one, an administrator's share-token on a dashboard returning 400, is already in Task 1 Step 1.
- **N7. The cut.** Seven tasks is reasonable.
  - Task 4 is large (types, engine.ts, api.ts, tables, Rail, App and three components), but it is the first working version and holds together.
  - Task 6 is one reviewable unit.
  - Task 5 bundles four things, and the composer is the largest and is held by B2's ruling. Split the composer into its own task so that week, progress and quick create can land without it.
  - Order holds: Task 3 needs Tasks 1 and 2, and Tasks 4–6 need Task 3's seeds.
- **N8. Coverage.**
  - R7's "keyboard reachable" quick create has no test.
  - The stat's change against the previous period is computed in `tiles.test.ts`, but the rendered value is never asserted.
  - All of R1–R9 and G have tasks.
  - Every threat-model mitigation has a row. Threat 4's row needs the S6 fix.

## Premises checked

- `saved_view` `source_type` and `source` NOT NULL; skin options `table…board` → `saved-view.ts:10-17` → holds.
- Changing nullability rebuilds and keeps the ids → `schema-diff.ts:65,89-90,104-119` → holds.
- `layout` json nullable is added by ALTER → `schema-diff.ts:78` → holds (the rebuild happens anyway).
- `SavedViewSeed` skin is `table|matrix|calendar` and its source is required → `declare.ts:178-187` → holds (the plan changes it).
- `CalendarDecl` has no `spans` → `declare.ts:120-125` → holds.
- `checkCalendar` requires `start` and `end` to be datetime → `validate.ts:81-85` → holds (Task 2 relaxes it).
- `checkCalendar` requires `day === source.date` → `validate.ts:80` → holds. It is the source of B1.
- Speelreeks declares a `date` → `datasets.ts:325-347` → does not hold (B1).
- `listViews` drops a view whose source is unknown → `views.ts:251-254` → holds (Task 1 must special-case the dashboard).
- `listViews` is at `views.ts:249` and `changing` at `views.ts:269` → hold.
- Owners cannot write views → `access.ts:30` → holds.
- `/public/views/:token` requires `source_type = 'query'` → `views.ts:434` → holds.
- Share-token and for-owners already refuse a source-less view (`not_query`) → `views.ts:334,360` → holds (N1).
- Administrators can PATCH the seeded dashboard → `views.ts:183-186` → does not hold (B2).
- `migrate.ts:150` seed path → `migrate.ts:144-152` → holds.
- `seedViews` is keyed by name and source → `seed-missing.ts:148` → holds. A NULL source breaks it (S3).
- `removeUndeclared`, `seedOrdered` and `adoptUnowned` use `name\0source` → `seed-missing.ts:169`, `views.ts:262`, `migrate.ts:121` → hold. None is in the plan (S3).
- `liveRecord` applies the scope → `attachments.ts:91-96` → holds.
- The owner attachment rule is in `servedAttachments` → `attachments.ts:84-89` (`declaredOf`) is the route's rule → partly holds (S6).
- The `/attachments/file/:id` route is registered before `/attachments/:dataset/:id` → `attachments.ts:290-307` → holds.
- `/schema` serves `calendar` and attachments by spread → `app.ts:285,295` → holds.
- `$exists` on `rol_id` → `filter.ts:133-134` → holds.
- `$period` on the `datum` lookup of toewijzing → `filter.ts:36,104-107`, `datasets.ts:248` → holds.
- Lookups are allowed on toewijzing (a dataset with owners) → `datasets.ts:247-252` → holds.
- Werklijst `status` is an options column that writes → `queries.ts:218-223` → partly holds: `writes` is declared, options are inherited only in `/schema` at `app.ts:105-112` (S1).
- Taak, activiteit and speelreeks have create writers → `theatre/index.ts:58-70` → holds.
- Bedrijfsweek is a calendar view → `seed.ts:400-409` → holds.
- `toSavedViews` drops a source-less view → `engine.ts:370-374` → holds (Task 4 changes it).
- `EngineView` skin and source types → `engine.ts:89-96` → holds.
- `createView` and `updateView` call `sourceOf(view.table)` → `api.ts:319-331` → holds.
- `updateThrough` at `api.ts:276`, not exported, reached through `update` → `api.ts:264` → holds.
- `App.tsx:218` landing default → `App.tsx:218` → holds.
- `createThrough` → `App.tsx:341` → holds.
- App's `scope` reaches a dashboard → `App.tsx:229-232` → does not hold (S2).
- `groupTables` lists only declared tables, so a dashboard needs a synthetic group → `tables.ts:25-37` → holds (Task 4 says so).
- Rail `+` "Bord" is blocked as later → `Rail.tsx:94` → holds.
- `TypedInput` is unexported and handles action inputs only → `Drawer.tsx:177` → holds as "unexported"; the plan's reuse is underspecified (N2).
- `newRow` needs/offers and its scope argument → `newRow.ts:24` → holds.
- `placeEvents`, `calendarWindow`, `windowOf` and `shift` exist → `calendar/layout.ts:65,145`, `conditions.ts:177`, `Window.tsx:28` → hold.
- `calendarWindow` shows up to 92 days → `calendar/layout.ts:145-149` → does not hold (S8).
- `awayRows` overlap filter with `T23:59:59` → `api.ts:192-195` → holds.
- `bun run gate` and `bun run check` → `package.json:13-17` → hold.
- `ARCHITECTURE-INVARIANTS.md` → absent → no "never/only" checks to name.

## The cut

One plan, so there is no cross-plan cut. Inside the plan, split the composer out of Task 5 (N7).
