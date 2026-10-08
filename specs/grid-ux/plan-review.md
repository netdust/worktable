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

# Plan review: grid-ux (round 3)
Reviewed-plan: 83a1351cf7c0997e7cb96f38b58e9a5298917bfd
Verdict: not ready (1 Blocking, 1 Should fix). All round-2 findings were confirmed fixed. Applied below.

## Blocking (applied)
- **An exact-name helper would hit two buttons when a view has its model's name (10 of 14 seeded views).**
  - A model node is now a `treeitem` named by its label alone.
  - Its views are buttons inside that node's own `group "View type"`.
  - The helpers take `(view, model = view)`: they click the treeitem, then the view inside that node.
  - A unit test checks that a same-named view opens twice in a row.

## Should fix (applied)
- **The helper list missed some call sites.** It now includes step-0c's `open` and the direct opens at step-0a:117 and step-0e:170. step-0d:324 now asserts a button.

## Notes (applied)
- Test line numbers corrected.
- The matrix example is added.
- The model's accessible name is its label alone.

# Plan review: grid-ux (round 4)
Reviewed-plan: 47a1a6b872817f57d2af4c14313d1ca6c1fdcac0
Verdict: ready with fixes (0 Blocking, 2 Should fix, 2 Notes). Applied without a further round, since no Blocking finding remained.

## Should fix (applied)
1. **The tree's markup was not decided.**
   - The treeitem gets `aria-labelledby` on its label.
   - The open and fold handlers sit on the row.
   - The views' group is nested inside the treeitem, and a view click never reaches the row.
   - The helper locator is spelled out, with a unit test that a view click opens that view.
2. **The unit-test call sites were not listed.** They are now: `App.test.tsx` `tableEntry`, `entry` and `types()`, and `Rail.test.tsx` `:20` and `:22`. `aria-current` moves to the active view's button.

## Notes (applied)
- A `role="tree"` named "Views" now wraps the sections.
- The "General" group goes. Its tests are rewritten for sections, with undeclared sources in the final unlabelled section.
