# Review — feature/grid-toolbar (56240dd..14efda3)

Whole-branch review (opus) and security-sentinel (opus), 2026-10-08. Verdict: ready to merge with fixes.

## Code review

**Important**
1. The yes/no filter does nothing: a new bool condition starts at `[]` while the select shows "ja"; "nee" is `['']`, which `complete` treats as unfilled; `$eq: ''` would match nothing on a boolean column; a stored `false` loads hidden and the next autosave drops it.
2. A link merges its conditions into the receiver's own (`put` over `layout.filters`) instead of replacing them, and `j=or` then joins the receiver's kept conditions; a sender with no conditions sends no `f`, so the receiver keeps the view's stored ones.
3. Link kopiëren on a private view: the receiver cannot list it, lands on another view, and the conditions are dropped without a word.

**Minor**
1. A stored `$or` the builder cannot show is replaced when the user picks Of; plain keys beside a stored `$or` are folded into the Of.
2. A stale or tampered link sticks: `readConditions` checks shape only; a removed field or a wrong operator stores a layout `/rows` answers 400 until Terugzetten.
3. The history panel's key lacks `reloads`: a cell edit with the panel open shows only on reopen.
4. A related value outside the caller's scope reads as "leeg" in the panel.
5. History reads at most 5000 ids (MAX_LIMIT), silently.
6. Link kopiëren throws without feedback where `navigator.clipboard` is undefined (http on a LAN address).
7. A reversed "ligt tussen" (from after to) gives the matrix an inverted window.
8. docs/SPEC.md: the working-tree diff carries earlier features' lines too; the Sidebar line omits `&j=or`.

Rulings weighed: 23 superseded by R10; 18 (matrix columns follow the server's rows) is a visible change Stefan should know; 20, 28 and 13 sound.

## Security review

No Critical or High. Threats 1–7 verified, each with a denial test.

- **Medium M1:** `ics.ts` escapes only `\r?\n`: a lone CR (and other C0 controls) in a title or column passes into SUMMARY/DESCRIPTION, injecting properties or events in a lenient parser.
- **Low L1/L2:** history assumes a query's `id` is its `creates` dataset's id (true of dagplanning, not enforced); `recordTitles` reads the query unscoped.
- **Low L3:** a record moved into an owner's scope shows its earlier plain-text history.
- **Low L4:** = code review Minor 2 (no XSS path; React escapes, no innerHTML).
