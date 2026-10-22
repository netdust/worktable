# Plan review (round 3): selection-actions
Reviewed-plan: 97af71ed160c7838cbbf1e7c92c29031e6bb1246 specs/selection-actions/plan.md

Checked against spec blob fd69b449035fb0df76736814a67b7990060e58ed, `main` at 8545b1d, and `feature/studio-domain` (for one premise about studio).

All four round-2 findings are fixed, and the source backs each fix. One edit adds a new problem. The round-2 N3 fix sends everything `made` filled in as `preset`, and that stops the dialog asking the space and the required fields. Spec R6 says the dialog asks them.

## Blocking
None.

## Should fix

**S1. Task 4 sends all of `made.fields` as `preset`, so the dialog stops asking the space and the required fields. Spec R6 says it asks them.**
- **Plan:**
  - Task 4 Step 3 (plan.md:238): "The fields `made` already filled, the calendar's day among them, go in as `preset`."
  - E2E add-from-query (:243): "+ Nieuw asks the title (the date comes from the calendar)".
- **Spec:** R6 (spec.md:34): "The dialog asks title, required fields and space, as the dashboard's does."
- **Source:**
  - A `preset` value is "not asked, always sent" (`dashboard/QuickCreate.tsx:80`). The dialog drops every preset key from what it asks: `askedOf(...).filter((key) => !(key in preset))` (`QuickCreate.tsx:86`).
  - `made.fields` holds more than the day:
    - the space, as `[scope.id]`, when the target is scoped and a space is selected (`grid/newRow.ts:34`, `:51-53`);
    - every required date (`:35`);
    - the first option of a required select (`:38`);
    - `false` for a required yes/no field (`:39`).
  - The dashboard's dialog asks all of these, with those values filled in (`QuickCreate.tsx:69-72, 88`). The query path would send them silently instead.
  - Studio's Agenda is affected. `agendapunt` is `scoped: 'organisatie_id'` (`feature/studio-domain:packages/studio/src/datasets.ts:325`). With an organisation selected, the Agenda's dialog would never ask the organisation.
  - The selection fixture has no space, so no test in the plan catches this.
- **Smallest change:**
  - Step 3: only the fields `made` filled that the dialog does not ask go in as `preset`. In practice that is the calendar's day on an optional date field. The title, the required fields and the space stay asked, filled in by QuickCreate's own `madeFrom` (`QuickCreate.tsx:84, 88`).
  - Step 1: add "on a scoped target with a space selected, the query's dialog still asks the space".
  - :243: change to "asks the title, with the date filled in from the calendar".

## Note
- **N1. "The five checks" do not match the four listed.** Task 4 Step 4 (plan.md:150) says `validate.ts` gets five checks. Step 2 (:141) has four validation tests, and the mitigations (:46) name four places. Name the fifth, or say four.
- **N2. The checkbox would sit in a cell hidden from screen readers.**
  - Both `#` cells are `aria-hidden="true"` on the cell itself (`GridHeader.tsx:51`, `GridBody.tsx:145`). A labelled checkbox inside stays hidden from screen readers and from testing-library's `getByRole`.
  - So `aria-hidden` has to move to a span around the number, but only when the model has a selection action. `Grid.test.tsx:117-121` checks today's attributes on a model without one.
  - One sentence at Task 2 Interfaces (:169) would settle this before execution.
- **N3. The Global Constraint needs to exclude R5.** Line :19 says theatre's behaviour stays unchanged. Under R5 (as the spec intends), the link list in theatre's table drawers (`LinkSection` → `PlaceRow`) gains the clickable item too.
  - Show the button only when `RelationContext.openRelated` is set (`cells/Relation.tsx:12`). Then `drawer/Sections.test.tsx:71` stays green, and every drawer outside the grid stays as it is.
- **N4. The dagplanning line the flow copies does not remove the link.** `e2e/dagplanning.spec.ts:210` clicks × on a confirmed name, and :212 then cancels the question. The removals that complete are :205 (Backspace) and × followed by Verwijderen. The code path is right (`cells/Links.tsx:164-166, 182, 190`). Cite :205, or write "× (then Verwijderen if asked)".
- **N5. One Dutch string becomes unused.** The `pickFirst` string at `i18n.ts:81` is unused once `App.tsx:675` goes. `i18n.ts` is not in Task 4's Files, so either add it there or drop the string with the branch.
- **N6. The fixture lacks the long text field the flow reads.** link-opens-record (:214) reads "the link record's long text field", but the fixture row (:101) gives the link dataset no such field. Add it to the fixture line.

## Round-2 findings against source
- **B1: resolved.**
  - Threat 4 (:40) now runs from the parent row's links cell, through `links.remove`, to `removeRow` on the link dataset. That matches `App.tsx:499-506` and `cells/Links.tsx:152-207`.
  - The drawer test step (:207-209) no longer claims a remove. The flow (:214) removes the link in the cell.
  - Spec lines :20, :32 and :68 are corrected.
  - The opened record is read-only in the source too. The related drawer gets no `onWrite` and no `onLink` (`Grid.tsx:349-350`), so `LongSection` gets no writer (`Drawer.tsx:208`).
- **S1: resolved.**
  - :233 rewrites `App.test.tsx:1540-1548`, and :239 removes `App.tsx:674-675`. `App.test.tsx` is now in Task 4's Files.
  - The rewritten test holds. `productie_id` is a required single relation, so `newRow` lists it as a need (`newRow.ts:37-40`). The dialog keeps it (`QuickCreate.tsx:72`) and asks it with a select (`:35`).
  - `App.test.tsx:1524` (`title_required: false`, no fields) still creates at once.
  - Real theatre declares no query with `creates`, so the dagplanning e2e is unaffected.
- **S2: resolved.**
  - The validation test is at :141, and `record` is optional at :168.
  - The refusal fits `checkActions` (`validate.ts:559-565`).
  - The drawer's `Action` uses `record` only for `options_from` (`Drawer.tsx:388`).
- **S3: resolved.** The Files row (:104) matches the interface (:167).
- **N1–N7: all applied.**
  - App.test is in Test map row 4.
  - The flow notes that `openRelated` closes the parent drawer (:214; `Grid.tsx:315`).
  - N3's edit introduced S1 above.
  - The batch push into history is limited to the query path (:240).
  - The checkbox placement is stated (:169).
  - The App-level causes have their test (:186).
  - "Selectie wissen" has its test (:183), and both `{}` and `{ ids: [] }` are named (:135).

## Premises checked
- `#` cell outside the tanstack columns → `GridHeader.tsx:44, 51`; `GridBody.tsx:145`. The keyboard handler is guarded by `fromCell` (`Grid.tsx:74-76, 277`), and copy and paste use `visible[active.col]` (`:288-308`) → holds; screen-reader caveat in N2.
- The links cell's remove → `cells/Links.tsx:164-166, 182, 190, 198`; `App.tsx:499-506` (`removeRow(link.dataset, item.id)`) → holds.
- `dagplanning.spec.ts:210` removes a link → clicks × and then cancels (:212) → holds only in part (N4).
- `openRelated(target, id)`, read-only and reached through `RelationContext` → `Grid.tsx:310-318, 333, 349-350`; `cells/Relation.tsx:9-12` → holds.
- `LinkItem.id` and `Link.dataset` are available in `PlaceRow` → `types.ts:46-63`; `drawer/PlaceRow.tsx:29` → holds.
- `createBlocked` `pickFirst` at `App.tsx:674-675`; `quickAdd` :390; `onAdd` :578; `made` :416 → hold.
- The `App.test.tsx:1540` pick test → `App.test.tsx:1540-1548` → holds.
- The calendar's day as `preset` → `madeFrom` fills the target's date from `conditionDays`. A calendar's `day` must equal its source's `date` (`validate.ts:102`), so `dated` is true on a query's calendar view (`App.tsx:258, 416`; `engine.ts:271`) → holds. What else goes into `preset` is S1.
- `QuickCreate` preset semantics → `QuickCreate.tsx:80, 86, 95` → holds; consequence in S1.
- The `options_from` refusal in `checkActions` → `validate.ts:552-567` → holds.
- `inputsOf` already refuses `{ ids }` on a single action (no `id`) → `actions.ts:64-66` → holds.
- `contextOf(store, actor, current)` takes a single record or null → `writes.ts:260-272` → holds; the selection context passes `null`.
- The tree skips `listed: false` → `ui/tables.ts:40-48` → holds. `Table` and `TableDef` gain `listed`, and both files are in Task 4.
- Studio's `agendapunt` is scoped → `feature/studio-domain:packages/studio/src/datasets.ts:325` → holds (that is why S1 matters).

## Verdict
**Ready with fixes.** There is nothing blocking. Fix S1 by narrowing the `preset` sentence in Task 4 Step 3, adding the scoped-target test and rewording one e2e line. The notes can be decided during execution.

## Applied after this review (Claude, 2026-10-22)

S1 and notes N1–N6 are applied to the plan:
- S1: `preset` takes only the fields the dialog does not ask, plus a test for the scoped target and the reworded e2e line.
- N1: four checks.
- N2: `aria-hidden` moves to a span.
- N3: the Global Constraint names R5's exception.
- N4: × then Verwijderen, citing :205.
- N5: `i18n.ts` added.
- N6: the fixture's link dataset carries a long text field.

The plan's blob after these edits is f8d527060a662dd228bd44eb227660ada41e22b2, and the spec is unchanged at fd69b449035fb0df76736814a67b7990060e58ed. With nothing blocking, no further round was run.
