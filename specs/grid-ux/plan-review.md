# Plan review: grid-ux (round 1)
Reviewed-plan: 0fb216c76baf218b4904761e809ff60e3997f347
Verdict: not ready (2 Blocking, 11 Should fix). Every finding was applied in the plan rewrite, and the review runs again.

## Blocking (applied)
1. **R3, the title line, had no task.** It is now Task 5, which changes `Toolbar.tsx` and `App.tsx` and updates the `h1` assertions.
2. **"Alle producties" was not buildable on today's `useSpace`.** Task 3 now:
   - changes `space.ts` to a `number | 'all'` selection, defaulting to `'all'` and stored as a sentinel;
   - makes `App.tsx` skip the unscoped state;
   - adds `space.test.ts`;
   - rewrites the two App tests that encode the old behaviour.

## Should fix (applied)
1. **The switcher would change what the existing e2e flows see.** Ruling: the default is "Alle producties", so they stay green.
2. **Every e2e opens a view by clicking its name in the rail.** Ruling: clicking a model's name opens its first or last-used view, and the hover chevron folds. This keeps that path and matches NocoDB. Review Focus 5 now lists it.
3. **The space field had two names.** It is now one `space.field`, and validation requires all scoped columns to share that name.
4. **An owner would be sent a space it cannot read.** `space` is served only to a caller who can read the space dataset, with an engine test.
5. **Section order did not follow from "declaration order".** Ruling: a domain-level `sections: [{ label, sources }]` fixes both orders, and unlisted sources go into a final unlabelled section.
6. **Not every readable source would appear in the tree.** No table is dropped for having no views, and `create` takes a table key and `shared`.
7. **The pill rule had no working basis.** Ruling: a pill only for a select column keyed `status`, a dot otherwise. `Select.test.tsx` is updated.
8. **Folding contradicted itself on keyboard and draft.** Folded rows leave `ordered`, and the draft's group never folds. Review Focus 4 is reworded.
9. **The `first` fact's format was unspecified.** It is formatted from the field type: a datetime in a day group shows `20:00`, with a test.
10. **The `docs/SPEC.md` diff had no task.** Task 2 now writes it, uncommitted.
11. **The Test map had gaps.** Commands are added, the dialog details are tested, and every task ends green.

## Notes (applied)
- The font imports are one per weight, and `bun.lock` is listed.
- `GridHeader.tsx` is named.
- The inherited cell's seam is `Display`; validation refuses `inherited` on a dataset column.
- The matrix is out of the band changes, and grid CSS is scoped under `.nv-grid`.
- `openTable` and `Prefs.last` stay, because clicking a model's name uses them.
- New strings are Dutch (ruling).

# Plan review: grid-ux (round 2)
Reviewed-plan: cffacc9159efbb0f62aa8d649b9e85e9baca6f8c
Verdict: not ready (1 Blocking, 3 Should fix). All 13 round-1 findings were confirmed fixed. Every round-2 finding was applied below.

## Blocking (applied)
- **The "Planning" section label and folded models broke the e2e "open a view by its name" path.**
  - The landing view stays `tables[0].views[0]` in today's `byFirstView` order.
  - Opening a model by its name also unfolds it.
  - The e2e helpers click rail buttons by role and exact name inside `navigation "Views"`, and are given the model for a view under another model.
  - step-0e:101 counts buttons.
  - Review Focus 5 is reworded, and a model's `…` is named `Meer voor <model>`.

## Should fix (applied)
1. **`sections` exposed sources an owner cannot read.** Sections now list only readable sources and drop empty ones, with an owner test.
2. **Task 5's list of `h1` assertions was incomplete.** It now covers every `heading level 1` assertion, including `:633` and `:744`, and rewrites the label test.
3. **Neither the landing view nor the label collision had a unit test.** Task 4 now has both.

## Notes (applied)
- The source key is `beschikbaarheid`, whose node reads "Beschikbaarheden". The spec is corrected.
- The engine fixture domain avoids fiche words too.
