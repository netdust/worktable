# Plan review: drawer-actions
Reviewed-plan: 28bb83e5e93ac556df7affb005c46db7595d6104 specs/drawer-actions/plan.md

Verdict: not ready

Two Blocking findings. Both have small fixes. Premises were checked against /home/ntdst/Sites/worktable-selection at e991993, read-only. Main at 7a1679d has the same drawer hosts.

## Blocking

**B1. A condition on a lookup cannot be judged where the plan judges it: on link items and in the action route.**
- **Plan lines.** Files table rows.ts (l.105). Task 1 Step 5 (l.152: "available.ts (pure: … the condition on the served row)"). Threat model attack 3 (l.46: "`runAction`/`runSelection` evaluate `when` on each record read as the caller").
- **Source, link items.** `linksOf` reads link rows through `pointingAt` with a bare `db.select().from(table)` (rows.ts:200-219, 279-281). rows.ts:106 says it outright: "a raw read with SELECT * (link rows, history) carries none". So a link item's served row has no lookup values.
  - R2's own example cannot show: "Niet nu", whose condition reads the parent's state through a lookup on actie_id. Its condition is evaluated against `undefined` and never matches.
- **Source, action route.** `readRecord` (actions.ts:101-108) reads through `contextOf(...).find`, which is `finder` (writes.ts:205-211). That returns `decodeAll`: declared columns only, no lookups (writes.ts:194-197).
  - The mark (computed on a GET /rows row, which has lookups) and the 422 (computed on a record without them) then disagree for any action `when` on a lookup. R6 allows exactly that.
- **Why the tests miss it.** Task 1 Step 2 puts the lookup `when` only on the parent. The link dataset gets "one button" with no condition. No test exercises either path.
- **Smallest change:**
  - Task 1 Step 5: link rows are read with `lookupSelect(linked, scope)`. Keep `cellsOf` unchanged so the matrix payload does not grow.
  - The action route judges `when` on `rowOf(store, dataset, id, scopeOf(actor, source))` (writes.ts:717-726, which already selects lookups), inside the transaction.
  - Use the same `availableOf` function for the marks and the route.
  - Step 2: the link dataset's button carries a `when` on a lookup to the parent's state, and one action carries a `when` on a lookup.
  - Step 3: add "a link item's button whose when reads the parent through a lookup is marked only in the matching parent state", and "an action whose when names a lookup is marked and run alike".

**B2. The calendar's drawer is its own host, not `useOpenRow`.**
- **Plan lines.** Files table l.113 ("`Grid.tsx`, `useOpenRow.tsx`, `dashboard/Dashboard.tsx`, `dashboard/ListTile.tsx` | every drawer host wires `DrawerButtons` and `useLive`"). Task 2 Files (l.158) and Task 3 "every drawer host" (l.180).
- **Source.** `useOpenRow` is used only by Board.tsx:62, Timeline.tsx:77 and Gallery.tsx:106. Calendar.tsx:255 renders its own `<Drawer row={open} …>` from its own `useState` snapshot.
- **Effect.** R1 names the calendar's drawer, and Task 2's test "the board's, calendar's, related and dashboard drawers show the buttons too" would fail against the files the plan lists.
- **Smallest change.** Add `apps/grid/src/calendar/Calendar.tsx` to the Files table and to Tasks 2 and 3. Its re-read is `setOpen(found)`.

## Should fix

**S1. `act` has no drawer to open; Grid already owns the code that does it.**
- **Plan lines.** Task 3 Interfaces l.184. Threat 6 l.49. Mitigations l.56 ("App.tsx `act`: `opens` through `rowOf`").
- **Source.** App's `act`/`actOnSelection` (App.tsx:549-561) only push history and reload. The table's drawers are Grid state (Grid.tsx:149-151). `Grid.openRelated` (Grid.tsx:318-326) already does `rowOf`, shows the `recordGone` notice on a miss, and calls `setRelated`. That is threat 6's mitigation, already written.
- **Fix.** `onAction`/`onSelection` resolve to `{dataset, id} | null` (`created[0]`, or the acted-on record). Grid calls `openRelated` on it, from the selection bar and from the drawer. Move mitigation 6's home to Grid.tsx `openRelated`.

**S2. A link item's press has no current state to send as `expect`.**
- **Plan lines.** Task 2 Interfaces l.162: `press(model, row: Row, to)` calling `api.update(..., row, { [lifecycle]: row[lifecycle] })`.
- **Source.** A link item is a `LinkItem` (types.ts:57-63: id, target, title, state, places), not a `Row`. Its `state` is `link.state`, which validation does not require to be the link dataset's lifecycle column (validate.ts:272). Even on a `Row`, the value is `row.fields[...]`, not `row[...]`.
- **Effect.** Without an explicit expect, `api.update` derives none for a link item (api.ts:285-290). The press goes out with no compare-and-swap, contrary to R1/R2.
- **Fix.** Put the state the marks were computed against into the mark, e.g. `available: { state, buttons, actions }`. `press` sends `{ [lifecycle]: available.state }` for rows and link items alike.

**S3. The write reply strips the marks from the grid store.**
- **Source.** PATCH/POST answer `reply`, which is writes.ts `rowOf`: no `links`, and under this plan no `available` (app.ts:44-48). The store replaces the row with that reply (store.ts:260).
- **Effect.** After any inline cell edit or board drop, the table's and board's drawers (which read the store row) show no buttons until a reload. This breaks Review Focus 4.
- **Fix.** Task 1 also adds `available` to `reply` in app.ts, through the same `availableOf`. Add one engine test: "a PATCH reply carries the same available as GET /rows".

**S4. R6's grid half has no task for the drawer's actions.**
- R6 says "the grid shows only what the server marked".
- Drawer.tsx:214 renders every action, single or selection, with no filter. Task 3 filters only the selection bar.
- **Fix.** Task 3 Step 2: the drawer hides an action missing from `row.available.actions`, when `available` is present. Add the test "the drawer leaves out an action its row is not marked for".

**S5. The plan drops a spec constraint without saying so.**
- The spec's Constraints (spec l.85) say `/schema` serves "the labelled transitions a viewer may make". "Left to the builder" also assumes `/schema` serves them.
- The plan serves only `live`, `detail` and `opens` (Task 1 Interfaces).
- **Fix.** Either serve role-filtered `{from, to, button}` per dataset in `/schema`, or add one explicit ruling line (the marks carry the labels, so `/schema` does not), in the plan and in Task 1 Step 1's SPEC.md commit.

**S6. `available` is a new key on every served row, but is not reserved.**
- validate.ts reserves the keys the engine adds: `OVERWRITTEN` for columns (validate.ts:229-234) and `LOOKUP_RESERVED` for lookups (validate.ts:282-296).
- `toRow` puts any unknown key into `fields` (engine.ts:444-451).
- **Fix.** Task 1 adds `available` to both lists, with a validation test "a column or lookup named available is refused". Task 2 takes `available` out in `toRow`.

**S7. `detail` to an owner.**
- Interfaces l.130 says link items carry `detail` "the same way". The engine serves `count` to an owner only when owner_visible (rows.ts:258-262; SPEC.md:53), and rows.ts:244 says no other column leaves.
- **Fix.** Serve `detail` under `servedCount`'s rule. Add "an owner gets a link item's detail only when its column is owner_visible" to Task 1 Step 3.

**S8. Test map row 5 points at a test file that does not exist.**
- `apps/grid/src/dashboard/ListTile.test.tsx` "(extended)" does not exist. The list tile is tested in Dashboard.test.tsx:94 (`describe('a list tile')`).
- `-- ListTile` would find no test file.
- **Fix.** Row 5 and Task 4 should use `Dashboard.test.tsx` with `-- Dashboard`, or say the file is created.

## Note

- **Threat 2 should name the stale-press race.** `expect` compares only the record's own lifecycle column, so it never covers a lookup in `when`.
  - A "Niet nu" pressed from a drawer that has not yet re-read after Bevestigen succeeds: the opdracht is already bevestigd, and only the polling (≤3 s) hides the button.
  - So Review Focus 4's "never a stale button that the server would refuse" is true for role and state but not for `when`.
  - Say this in the declare.ts doc. Hand studio's plan the rule that a writer must mirror any `when` that matters. Studio's own section only mentions "Toch wel".
- **Threat 4 wording.**
  - "Refused at validation" cannot be per viewer: validation knows the domain, not the viewer.
  - Owners already read every column of their own rows through GET /rows; only lookups are owner-gated (SPEC.md:53; rows.ts:160-169).
  - So "owners' marks use only owner-visible columns" (l.47, l.146) is stricter than the read path, and would make an owner's marks disagree with the route.
  - Say instead: marks use the row as read in the caller's scope, a key absent from that row never matches (not even `null`), and the route uses the same read.
- **Threat 5.**
  - "The server's existing limits apply": user sessions have no read limit on `/rows`. Only service accounts are limited, at 600 a minute (rate-limit.ts).
  - A gone or out-of-scope record is not a 404: grid `rowOf` answers `null` from a 200 (api.ts:304-306). `useLive` must stop on `null`, and its test should drive that, not only a 404.
- **A transition from `'*'` includes the current state.** `availableOf` must drop `to === current`, as R1's "leads out of" says. Otherwise studio's `* → geannuleerd`-style button shows on an already cancelled record as a no-op. One test.
- **Undo after a press.** The history entry should carry `refresh: onDone`. Otherwise Undo from the related or dashboard drawer reloads only the view (store.ts:315-322) and the drawer stays stale.
- **Matrix drawers.** Matrix.tsx:644 and Panel.tsx:144 receive the same rows. Render `DrawerButtons` only when the host passes `onDone`, so the matrix stays out by construction.
- **Vocabulary check scope.** `check-vocabulary` scans `packages/engine` (fixtures included) and `packages/mcp` only, against theatre and fiche names (package.json `check`; check-vocabulary.ts default root). It covers neither apps/grid nor studio's words. Global Constraint l.26 reads as if it covered the grid. The new engine words (available, live, detail, opens, button, when) collide with no declared name.
- **Fixture.** Add the `when`/`opens` action as a new action, not on `gather`. `gather` is run on members 1–3 by selection-actions.test.ts:78-94 and packages/mcp/test/tools.test.ts:194-201.
- **e2e second account.** "drawer-follows-an-outside-change" needs a second account on the 4314 instance. e2e/auth.ts:32 has one editor. Say so in Task 3, with a role the transition lists.
- **Task 3 Files** lack `i18n.ts`, needed for "Past niet op N rijen" and the busy mark.
- **Studio fit without engine changes.** It works once B1 is fixed, with two rulings for studio's plan:
  - Each Site selection action must make the actie its first top-level create, so `created[0]` is the opdracht. Writer.ts:489-494 orders the parent first, then its children. A groep created first would open instead.
  - The Te bevestigen tile must read an actie dataset view. `op_tafel` is a query (studio spec S11, l.136), and R7 leaves query tiles alone.
- **Simplest design.** The rejection holds, but for a sharper reason than "a second rule engine": equality and `$in` in the grid is small. The real reasons are that link items carry no columns (rows.ts:244), and the action route needs the server-side evaluator for the 422 anyway. State those two.

## Premises checked
- LifecycleDecl `{from, to, roles, label?}` → declare.ts:281-287 → holds
- Transitions judged by role, from and to; `expect` is a compare-and-swap on the lifecycle column; undo by exact inverse → writes.ts:275-303, 305-314 → holds
- Theatre labels uitgenodigd→bevestigd/geweigerd for editor, administrator and owner → packages/theatre/src/datasets.ts:285-286 → holds (the opt-in `button` is justified)
- `api.update(model, id, data, row?, expect?)` → apps/grid/src/api.ts:295-300 → holds
- Served rows carry lookups in the caller's scope → rows.ts:160-169, lookups.ts:71-87 → holds
- Link items carry the link record's lookups → rows.ts:200-219, 279-281 → does not hold (B1)
- Action route reads a record on which a lookup `when` can be judged → actions.ts:101-108 via writes.ts:194-211 → does not hold (B1)
- A lookup through a relation to an options column (studio's actie_site → actie.state) → validate.ts:299-313 → holds
- Drawer hosts are Grid, useOpenRow, Dashboard and ListTile → useOpenRow only in Board.tsx:62, Timeline.tsx:77, Gallery.tsx:106; Calendar.tsx:255 is its own → does not hold (B2)
- Table and related drawers in Grid → Grid.tsx:364-371 → holds
- Dashboard drawer for the week tile → Dashboard.tsx:105 → holds
- ListTile rows open nothing today; ListTile.test.tsx exists → ListTile.tsx; tests at Dashboard.test.tsx:94 → partly holds (S8)
- App `act` can open the result's drawer → App.tsx:549-561 has no drawer; Grid.tsx:318-326 does → does not hold as stated (S1)
- One history entry per press → App.tsx:539-548, ui/history.ts → holds
- The write reply has the GET /rows row shape → app.ts:44-48, store.ts:260 → does not hold (S3)
- Selection bar can disable per action → Selection.tsx `SelectionBar` plus `ActionInputs` `disabled` → holds (needs the ticked rows passed in)
- PlaceRow renders a link item and opens its record → grid/drawer/PlaceRow.tsx → holds
- Link `count` owner rule (the model for `detail`) → rows.ts:258-262, SPEC.md:53 → holds
- Fixture instance on 4314/5177 → playwright.config.ts:50-63 → holds; one account (e2e/auth.ts:32)
- check-vocabulary covers the engine and its fixture → package.json `check`, scripts/check-vocabulary.ts → holds; the grid is not covered
- Engine words collide with declared names → checked with a one-off bun script against the theatre and fiche declarations → no collision
