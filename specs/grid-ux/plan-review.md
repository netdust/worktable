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
