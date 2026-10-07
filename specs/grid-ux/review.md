# grid-ux review (2f6cc9b..7159198)

Whole-branch review (most capable model) and security-sentinel, then one fix pass.

## Fix pass
- I1, a colleague's team view shown as Standaardweergave, with a team hint promising edits: fixed in b84150d. RED→GREEN in apps/grid vitest.
- M1, regraded to Important: a cut group's count and the summary looked exact. Fixed in 8dabf4e: "N+", totals "…", "N+ rijen". RED→GREEN.
- I2, the docs/SPEC.md diff was missing engine lines: added to the uncommitted diff (source_display, PUT /sources/:name/display, the Administrator row, tones, icon, creates, reserved name).
- Gate after the pass: `bun run gate` exit 0. vitest 696, packages 1045, e2e 77/77.
- Deferred minors: L1–L3, M2–M6 (below).

---

# Final whole-branch review: grid-ux (2f6cc9b..7159198)

Reviewer: fresh context, read-only. One pass over the engine and theatre source, then the grid source, then tests and e2e, reading the review package in chunks and the working tree where context was needed.

Verification run on HEAD 7159198:
- `bun run check`: exit 0 (2 Biome warnings, both in pre-existing test files; the engine vocabulary check and all four typechecks pass).
- `bun test packages scripts`: 1045 pass, 0 fail.
- `cd apps/grid && bunx vitest run`: 38 files, 694 pass.
- e2e was not run, as instructed.

## Strengths
- **The engine/domain boundary holds.** The new engine words are generic: `space`, `scoped`, `sections`, `group_facts`, `inherited`, `tones`, `ICONS`, `creates` and `new_label`. Theatre declares every domain word (`packages/theatre/src/index.ts`, `datasets.ts`, `queries.ts`). In `apps/grid/src`, theatre words appear only in doc comments, never in logic or strings.
- **The `PUT /sources/:name/display` route is sound.**
  - The role check runs before the source lookup (`display.ts:83-85`).
  - It refuses unknown keys, bounds labels and refuses control and format characters. Icons must come from the closed set.
  - It runs inside the write guard, in one immediate transaction, and is revised in a batch.
  - The route matrix covers 401/403/403/200 (`route-matrix.test.ts`).
  - Undo of that batch fails closed in `touchedBy`, because `source_display` is not a domain dataset. That matches the ledger's ruling.
- **`/schema` filters by what the caller may read.**
  - `space` is served only when the space dataset is readable.
  - Sections drop sources the caller cannot read, and drop empty sections.
  - `creates` and a mapped column's target options and tones are served only when the target is readable (`app.ts:68-102`).
  - `declarations.test.ts:326` and `grid-ux.test.ts:59,141` test the owner cases.
- **Group facts are correct under the read limit.**
  - The engine sorts by the group column first (`rows.ts:44`), so only the group holding the last loaded row can be short.
  - `cutAt` and `factsOf` key the "…" on that row's group as loaded, so a search or a write that moves the row does not hide the marker (`group.ts:38-41,87-96`).
  - The draft row is kept out of the facts.
- **Folding meets Review Focus 4.**
  - Folded rows leave `ordered`, and the row numbers and `data-cell` indices follow it.
  - Counts and totals use `group.rows`, so they still include folded rows.
  - A group that holds the draft never folds (`Grid.tsx:104-107`).
- **Tests check behaviour.** The new engine tests hit real routes on a real SQLite database. The grid tests check rendered output and the URLs requested. `scripts/grid-icons.test.ts` keeps the grid's icon map in step with the engine's `ICONS`, without importing across the boundary. None of the new test files has a case without an assertion.

## Issues

### Critical
None.

### Important

**I1. A colleague's shared ("Het team") view is labelled "Standaardweergave", and the dialog promises that the team can change it. The engine lets only the owner change it.**
- Where:
  - `apps/grid/src/ui/ViewList.tsx:33-35` (`locked = !editable(view)` → `readOnlyView`);
  - `apps/grid/src/ui/App.tsx:344` (title-line lock with `readOnlyTitle`);
  - `apps/grid/src/i18n.ts:94-95,147,150`;
  - `apps/grid/src/ui/NewViewDialog.tsx:23,67`.
- What happens:
  1. Planner A opens `+` → Grid, keeps the default "Wie mag ze aanpassen: Het team" and reads the hint "Iedereen in het team ziet ze en kan filters en kolommen aanpassen". A creates the view.
  2. Planner B opens it. The tree shows a lock named "Standaardweergave, alleen te kopiëren", and the title line says "Standaardweergave: maak een kopie om aan te passen".
  3. B's Save is off: `ownedView` answers 403 `not_owner` (`views.ts:161-162`, `editable = mine && …` at `views.ts:63`).
- Why it matters:
  - The dialog states a permission the engine does not grant.
  - B is told that a colleague's view is a system default, which misstates who owns it. B has no way to learn who to ask.
  - The old rail separated these cases: a Users icon meant "shared", and nothing was shown for a starting view. Task 4 dropped the shared mark (the ledger notes it as a concern, not as a ruling).
  - The `create-team-and-personal-view` e2e checks only the author's own view, so it cannot catch this.
- This is partly a spec issue. R2's wording "Wie mag ze aanpassen: Het team" itself promises team editing.
- Fix:
  - Tell a seeded view (`owner_id === -1`, which `EngineView` already carries) apart from a colleague's shared view. For example, a Users mark with "Gedeeld door een collega · kopie maken om aan te passen", and the "Standaardweergave" lock only on seeded views.
  - Reword the team hint to what the engine does: "Iedereen ziet ze; alleen jij past ze aan, anderen maken een kopie". The owner may prefer to change R2's label instead.

**I2. The docs/SPEC.md diff leaves out half of what this branch adds to the engine contract.**
- Where: `docs/SPEC.md` working-tree diff: the Skin needs row at :46, the Sidebar paragraph, the "Five tables" paragraph at :48, and the Administrator row at :72.
- What is missing: the diff adds space, sections, group_facts, inherited and new_label, but leaves out:
  - (a) the engine table `source_display` (now six generic/engine tables), and the reserved name it adds;
  - (b) the authenticated write route `PUT /sources/:name/display`, which is administrator-only, revised, and not undoable (ledger ruling);
  - (c) the Administrator row, which should gain "rename a source or change its icon";
  - (d) per-column `tones` from a fixed palette, and the mapped query column now taking its target's tones as well as its options (the Query row says "options and relation");
  - (e) per-source `icon` from a fixed set;
  - (f) a query's `creates: <dataset>`.
- Why it matters:
  - AGENTS.md makes docs/SPEC.md the contract, and scope changes go into it first.
  - The owner is about to approve this diff as the record of the feature. A new write route and a new engine table would then exist in code and nowhere in the contract.
  - The next agent who checks the routes against the spec will find an endpoint the spec does not know.
- Fix: add the lines for (a)–(f) to the uncommitted diff before the owner reviews it, wording R9 generically ("an administrator's display name and icon per source").

### Minor

**M1. A group the read limit cut short still shows exact-looking counts, totals and a summary.**
- Where: `apps/grid/src/grid/GridBody.tsx:113` (count badge), `GridBody.tsx` Band totals, `Grid.tsx:115-119` (title summary).
- What happens:
  - The read limit cuts the rows (total > loaded).
  - The cut group's band reads, for example, "38 · ● voorstelling … · … zonder tijd" with a totals figure. The 38 and the totals are as short as the facts, but carry no marker.
  - The title line says "5000 rijen", with no hint that more exist.
- R6 asks for "…" on facts only, so this is not a spec breach. It is a wrong-number risk that sits right beside the marker, though; the old group foot had the same blind spot.
- Fix: mark the cut group's count, for example "38+" or "…", and let the summary say "5000+ rijen" when `cut` is set.

**M2. "Tijd" shows a range but edits only the start, and the end comes from an implicit adjacency rule.**
- Where: `apps/grid/src/grid/columns.ts:251-254` (`endOf`) and `:275` (label → `Tijd`).
- What happens:
  - In Dagplanning, a row reads 13:00–14:00. A planner edits the cell to 15:00.
  - The activiteit writer refuses with "Einde ligt voor de start." (`theatre/src/writers.ts:32`).
  - Einde is not a column in that view: it is folded into the range precisely because it is hidden. The planner has to know to show Einde through Kolommen first.
- Separately, any two datetime fields declared next to each other become a "start–end" range, and the header is renamed "Tijd". `created_at` followed by `updated_at` is one example. The rule is generic, but it is a convention no declaration states.
- Fix:
  - Either move the end by the same amount when the start moves, or say in the refusal that Einde can be shown under Kolommen.
  - Consider declaring the end explicitly, for example `range_end` on the column, instead of relying on adjacency.

**M3. A group band is a focusable `tr` with `aria-expanded` inside `role="grid"`.**
- Where: `apps/grid/src/grid/GridBody.tsx:104`.
- What happens:
  - `aria-expanded` on a row is defined for `treegrid`, not `grid`, so screen readers announce it inconsistently. The fold has no named control.
  - Every band is its own Tab stop: a week of Dagplanning adds 7 stops between the toolbar and the cells.
- Fix: put a `<button aria-expanded>` inside the row header, named by the group label, and drop `tabIndex` and `aria-expanded` from the `tr`.

**M4. Choosing a menu item drops keyboard focus to `<body>`.**
- Where: `apps/grid/src/ui/MoreMenu.tsx:112`.
- What happens: after a keyboard user picks an item such as "In-/Uitklappen", "Exporteren" or "Omhoog", the portal unmounts and focus lands on `<body>`. Focus returns to the trigger only on Escape. This is separate from the deferred "portal tab order" item.
- Fix: call `trigger.current?.focus()` in `onChosen`, unless the action opens something that takes focus itself (a dialog, or a rename field).

**M5. An administrator cannot give a model its declared name back from the UI.**
- Where: `apps/grid/src/ui/Rail.tsx` (`renamed`) and `RenameField`, where an empty value cancels.
- What happens: the API accepts `label: null`, but there is no menu path to it. Typing the declared label back stores an override equal to the declaration. That works, but it keeps a row in `source_display`.
- Fix: offer "Standaardnaam" in the model's `…` when a display row exists, sending `{ label: null }`.

**M6. While a model is being renamed, its treeitem has no accessible name.**
- Where: `apps/grid/src/ui/Rail.tsx:121`.
- What happens: `aria-labelledby` points at the name button's id, but that button is replaced by `RenameField` during a rename.
- Fix: keep the id on a wrapper span that holds either the button or the field.

## Review Focus: verdict per line

1. **Grid stays domain-free.** Holds. A grep of `apps/grid/src` (tests and `.test.data` excluded) for productie, voorstelling, dagplanning, activiteit, speelreeks, locatie, soort, zonder tijd and toewijzing finds only four doc comments (`types.ts:42`, `i18n.ts:208`, `GridBar.tsx:17`, `Grid.tsx:51`).
   - Facts, sections, inherited flags and labels, tones, icons, `creates` and `new_label` all come from `/schema`.
   - The two built-in rules are generic and were ruled on: the `status`-keyed pill, and the built-in English tone and icon keys in `tones.ts`.
   - The implicit datetime-adjacency rule (M2) is also generic, but undeclared.
2. **Space as a rows filter, served only to readers.** Holds.
   - `withScope` merges `{ field: { $eq: id } }` into the fixed filter (`engine.ts`), and the rows route is unchanged.
   - `spaceOf` serves it only when `readable(actor, space)`. An owner gets no `space`, and App renders `SpaceSelect` only when `served.space` exists.
   - A saved chip on the scoped column is stripped while scoped (`App.tsx` `layout`), so a chip cannot override the scope.
   - Engine tests and `grid-ux.test.ts:59` cover the owner case.
3. **A domain without the new shapes renders as before.** Holds by code and unit test.
   - fiche's `/schema` top-level keys are exactly `['sources']` (`fiche.test.ts`). `sectionsOf` with no sections gives one unlabelled section, and bands carry no facts.
   - The one visible change for fiche is new chrome, which is intended: bands can fold and every view has a row-number column.
   - The fiche e2e was not run here.
4. **Folded rows, totals, draft.** Holds.
   - `ordered` skips shut groups, and `GridBody` numbers rows only for open groups, so `data-cell` indices match `ordered`.
   - Band counts and totals use the full `group.rows`. `shut` excludes any group that holds `DRAFT`.
   - The tests at `Grid.test.tsx:545,559,570` exercise all three.
   - The known side effect, where the active index lands on another row after a fold, is in the ledger's deferred list. It needs a click back into the grid before any write, so I agree it is Minor.
5. **Kept contracts.** Holds.
   - These names are unchanged: `navigation "Views"` (`t('views')` = 'Views'), `More actions: <view>`, `group "View type"`, and the treeitem named via `aria-labelledby` on the name button.
   - The model's `…` is `Meer voor <model>`, and `+` is `Weergave toevoegen aan <model>`.
   - View buttons sit outside the `.nv-model` row, so a click on one never reaches the open or fold handlers.
   - Opening a model by name unfolds it (`openModel`). Landing order is still `byFirstView`; sections order only the tree.
   - The deliberate changes (h1 = view name, group foot → badge, `.nv-group__label`) are as planned.
   - Gap (M6): the treeitem loses its name while it is being renamed.

## Rulings weighed
- **Undo of a model rename is not possible.** It fails closed, as the ledger says, and nothing in the UI offers it. No worse than stated.
- **The tree's menus render in a portal.** Acceptable as stated. The focus-after-select gap is M4, which is new rather than a re-report.
- **Cut marker after Task 6's fix.** It is exact for facts. M1 covers the numbers right beside it.
- **The scope chip uses the field label.** It reads better than the spec's wording. Fine.
- **`dagplanning.eind_at` writes through.** Consistent. M2 is about how the combined cell edits, not about the ruling.
- I re-read every other `Ruling:` line and none needs flagging. Every `minor (deferred)` line was left out of this report.

## Declined to judge
- Visual fidelity to `design/grid-prototype.html`, including spacing, 13.5px type and colours: the owner judges it.
- Theatre section names and order: a draft pending the owner.
- The dialog's "· in Nachtwacht" scope hint, which suggests the new view is bound to the production when the scope is a runtime filter: R2 asks for it.
- "Het team" as the dialog's default audience, rather than "Alleen ik": a product choice. Whether the label's promise is accurate is I1.
- The pre-existing copy and paste of a datetime cell, where the text pasted is a display form that `momentOf` does not parse: unchanged by this branch except that the copied text is now "13:00–14:00".
- The 5,000-row read limit itself, and missing whole groups beyond the cut: pre-existing engine behaviour, and the plan accepts it.
- The e2e flows: not run (ports in use, per the brief). I read them for assertions and found none vacuous.

## Assessment
**Ready to merge: With fixes.** I1 (a false permission promise, and colleagues' views called system defaults) and I2 (the spec of record misses a new admin write route and an engine table) should be fixed before the owner approves the SPEC diff. Neither touches data integrity or the engine boundary, which both hold.

---

# Security report: feature `grid-ux` (2f6cc9b..7159198)

Auditor: security-sentinel (read-only). Date 2026-10-07. Suite: `bun test packages scripts` 1045 pass / 0 fail.
Behaviour was also checked with a temporary probe test (run, then deleted; tree unchanged).

## Executive summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |
| Info | 4 |

The new authorization surface (`PUT /sources/:name/display`) is admin-only. The role is checked before the source is looked up, so a refused caller cannot use it to probe which sources exist. It sits behind the global write guard (JSON-only, `Sec-Fetch-Site` / Origin refusal, 64 KB cap) and the session middleware. Keys come from an allow-list. The icon is an enum, and the label is trimmed, 1–60 characters, with Cc/Cf rejected. The SQL column names come from the allow-list only, and values are bound. Each write is revised in one batch. `/schema` lays display overrides only over sources the actor can already read. Space and sections are filtered the same way, and so are inherited options/tones and `creates`. Create-from-query goes through the normal `POST /rows/<dataset>` path (`writableOf` → writer.create → owner scope forced). It does not bypass anything. The grid uses no `dangerouslySetInnerHTML` / `innerHTML`, labels render as React text, icons resolve through a fixed lucide map, and export only writes what the grid already shows (pre-existing formula-escaping).

## Findings

### Low

**L1. The decided ruling "a display batch is not undoable" is not asserted by a test**
- Where: packages/engine/src/display.ts:63,76 (`recordBatch(..., 'write', ...)`); packages/engine/src/writes.ts:470-476 (`touchedBy` refuses an entity not in `domain.datasets`).
- Behaviour (probed): the admin undoing their own display batch gets 422. An editor undoing it gets 403 (actor check). Both are correct.
- Risk: the refusal comes about by accident. The batch kind is `write` (undoable), and only the fact that `source_display` is an engine table (absent from `domain.datasets`) blocks it. A future refactor that resolves engine tables in `touchedBy` would make the batch undoable through `POST /batches/:id/undo` → `planUndo` → `writableOf` (that would still 404 for an engine table today, but the guard is indirect). No test pins it.
- Fix: add an engine test where `POST /batches/<display batch>/undo` returns a refusal and `source_display` is unchanged, for both the admin and an editor. Optionally, give it a distinct non-undoable batch kind (already noted in the ledger as a later tidy-up).

**L2. The label check lets invisible and line-separator characters through**
- Where: packages/engine/src/display.ts:27 (`/[\p{Cc}\p{Cf}]/u`).
- Probed: `'A B'` → 200; `'ㅤ'` (Hangul filler, category Lo, renders blank) → 200. U+2029 is likewise Zp. U+200B and U+202E are Cf and are refused as they should be.
- Attack path: admin-only, so this is self-inflicted or a compromised admin account. It allows a blank-looking or spoofed model name in the tree, and odd line breaks in tooltips/aria. It cannot cause XSS (rendered as text).
- Fix: also reject `\p{Zl}\p{Zp}` and require at least one visible character (for example `/[\p{L}\p{N}\p{P}\p{S}]/u` after removing fillers like U+3164/U+115F/U+1160/U+FFA0), or normalise whitespace (`\s+` → ' ').

**L3. A no-op first write creates an all-null row, a batch and revisions**
- Where: packages/engine/src/display.ts:58-64 (the `!current` branch does not check for an empty or all-null patch).
- Probed: `PUT /sources/plat/display {icon:null}` → 200 and a stored row `{label:null, icon:null}`, plus a batch.
- Risk: audit-trail noise only (admin-only). This was already logged as a deferred minor in progress.md.
- Fix: in the `!current` branch, return `null` when every patch value is null.

### Info

- **I1** packages/engine/src/app.ts:72: `space.field` comes from the first scoped source whatever the actor can read. It is served only when the space dataset is readable, and every scoped source shares one field (validate.ts checkSpace), so at most a column name is exposed. Acceptable.
- **I2** packages/engine/src/app.ts:98-101: `creates` is served when the target is readable, not when the actor may create in it. This is UX only: the server enforces create through `writableOf` + the writer + forced owner scope (writes.ts:304-335). The grid also checks `served.writable`.
- **I3** Pre-existing (not in this range): query `columns[].writes.dataset` is served raw in `/schema`. A query that is readable and writes to an unreadable dataset would name that dataset. `servedColumn` correctly withholds the target's options/tones (app.ts:87-94), but not the `writes` reference itself. Worth a later check if owners ever get such a query.
- **I4** The threat model's "an unknown or unreadable source gets 404" cannot be reached for the unreadable case. Only administrators pass the role check, and they read everything. Owners get 403 before lookup on readable, unreadable and non-existent names alike, and the message does not echo the name (display.test.ts "an owner gets 403 ..."). Engine tables (`saved_view`, `source_display`) are 404 for the admin. `__proto__` / `toString` are 404 (probed).

## Mitigation-by-mitigation (threat model, plan.md:276-290)

| Mitigation | Implemented at | Denial asserted by a test | Status |
|---|---|---|---|
| Only an administrator changes display | access.ts `'sources.display': ['administrator']`; display.ts:83 | display.test.ts editor 403 + nothing stored; owner 403 on readable/unreadable/unknown; route-matrix.test.ts two rows (none 401, owner 403, editor 403, admin 200) | Met |
| Session-less → 401 | auth middleware before displayRoutes (app.ts registration order) | display.test.ts "a caller without a session gets 401"; route matrix | Met |
| Through the write guard (JSON, same-origin) | app.ts `app.on(['POST','PUT','PATCH','DELETE'], '/*', writeGuard())`; write-guard.ts | display.test.ts: form-encoded → 415, cross-site → 403, nothing stored | Met |
| Icon from the fixed set | display.ts:32-37 (`ICONS`); declare.ts ICONS; validate.ts checkIcon for declared icons | display.test.ts unknown icon / non-string → 400 | Met |
| Label 1–60 | display.ts:23-29 | empty, 61 chars, control char, non-string → 400; 60 accepted | Met (see L2 for character classes) |
| Unknown keys refused | display.ts:39-41 | unknown key, empty object, array → 400; `__proto__` key → 400 (probed) | Met |
| Unknown source → 404 | display.ts:84 `visibleSource` | unknown, `saved_view`, `source_display` → 404 for admin | Met |
| Write is revised | display.ts:55-78 (one transaction `.immediate()`, revise + recordBatch) | display.test.ts revision rows + batch keys; unchanged write → no revision | Met |
| Not undoable (ledger ruling) | indirect: writes.ts:475-476 | **none** (probed 422 / 403) | Behaviour met, test missing (L1) |
| Owner never learns about unreadable sources | app.ts:149-151 filter; overlay only on readable; sectionsOf/spaceOf/servedColumn/createsOf check `readable` | display.test.ts "an owner sees the display of a source it reads" (`plat` undefined after an admin override); declarations.test.ts:145 (space/sections for owner), :307-308 (creates), :327 (columns) | Met |
| Display name is plain text in the grid | Rail.tsx renders `{table.label}` and attributes as React props; no dangerouslySetInnerHTML/innerHTML in apps/grid/src; icons via `iconNamed` lookup (icons.ts) | grid unit tests on menu by role; probe: `<img onerror>` label stored and served as JSON text only | Met |

## Surface notes

1. **PUT /sources/:name/display**: see the table. A query name is accepted on purpose (displays apply to any source). Errors use the uniform `ApiError` with no stack or SQL.
2. **/schema**: overlays come from `displaysOf` for every row, but are applied only inside the readable-filtered map. `new_label` is withheld once a dataset is renamed. Unreadable overrides do not leak (tested).
3. **creates / new_label**: no bypass. `createThrough` (App.tsx:267) calls `create(dataset, fields)` → `POST /rows/:dataset` with the full server-side checks. `checkCreates` at declaration time requires a dataset with a create writer.
4. **Grid**: no unsafe sinks. Export (`export/download.ts`, `xlsx.ts`) writes the visible snapshot only, escapes formulas as before (xlsx.ts:12), and sanitises the sheet name from the title.

## Remediation roadmap
1. (L1) Add the undo-refusal test for a display batch; optionally a non-undoable batch kind.
2. (L2) Tighten the label character classes; require a visible character.
3. (L3) Skip the create and batch when a first write is all-null.
