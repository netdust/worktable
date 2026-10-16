**G2 audit of grid ui/: 29 deletions, 3 conflicts, 24 rewrites, 13 keeps across 29 files**

I ran no tests and no builds. One mistake you need to know about: early on I ran a filesystem-wide `find /` to locate react-aria's source. It hit the 300 s tool timeout, was moved to the background, and I killed it with `pkill`. That added disk load while the shake-out in /home/ntdst/Sites/worktable was running, so its timing may be void. Nothing else ran outside reads and greps of /home/ntdst/Sites/worktable-prune. I never read or touched the live tree, so react-aria's own source was not available.

## Totals
- **Examined:** all 29 files, 6,037 lines, read in full. 414 `it` blocks and 5 `it.each` blocks, about 430 runtime cases.
- **DELETE:** 29 blocks (34 runtime cases). About 345 test lines go, plus about 75 lines of dead production code (ViewPanel).
- **DELETE-CONFLICT:** 3 blocks, about 46 more lines if you grant them.
- **REWRITE:** 24. Together they drop about 25 lines.
- **KEEP (rows for tests that look suspect):** 13.
- CHECKS.md registers only e2e and smoke files, so no unit test in this slice is a CHECKS conflict. All three conflicts come from plan files.

**Scanned.** Besides the slice I read the production files under test: App.tsx (outline plus the lines cited), every component the slice exercises, useSavedViews.ts, i18n.ts and biome.json. For duplicate checks I read only the cited parts of Grid.test.tsx, Drawer.test.tsx, space.test.ts and Matrix.test.tsx (titles), and the cited e2e flows.

Paths: UI = /home/ntdst/Sites/worktable-prune/apps/grid/src/ui/ and SPECS = /home/ntdst/Sites/worktable-prune/specs/.

## Table
| path::method | disposition | reason |
|---|---|---|
| UI/App.test.tsx:120 'renders the rail with the views from the schema' | DELETE | Duplicate: aria-current on the view and not the model is Rail.test.tsx:79-85, App-level aria-current is :1022/:1064, and every App test finds rail nodes. |
| UI/App.test.tsx:139 'opens a view named like its model…twice in a row' | DELETE | Duplicate of Rail.test.tsx:109-120 (onSelect twice, onTable never); a view click setting the hash is :1876-1877. |
| UI/App.test.tsx:161 'names the toolbar after the active view' | DELETE | :152-156 (landing heading) and :183-187 (retitle) assert the same. |
| UI/App.test.tsx:168 'shows the empty state when the window has no rows' | DELETE | Every App test already awaits 'Geen rijen' (e.g. :126, :134). |
| UI/App.test.tsx:205 "speaks the schema's strings once it loads" | REWRITE | Cannot fail: the overrides equal the defaults (i18n.ts:9, :13), and the asserted 'Geen rijen' is never overridden (i18n.ts:8). |
| UI/App.test.tsx:235 'focuses the search on Cmd/Ctrl+K' | DELETE | Search.test.tsx:77-84 is the lower seam; move the metaKey case there. |
| UI/App.test.tsx:271 'marks the facts of the group the read limit may have cut short' | DELETE | Grid.test.tsx:893-898 covers the band facts; e2e read-limit-cut (grid-ux.spec.ts:749-750, CHECKS:47) covers App's total-to-cut step. |
| UI/App.test.tsx:301 'sets data-density on the root…' | DELETE-CONFLICT | Wrong seam (RailFoot owns density, RailFoot.tsx:56); e2e dark-and-density covers it; but grid-ux plan names it. |
| UI/App.test.tsx:323 "lands in the app's third column" | DELETE-CONFLICT | Class and DOM-nesting pin; e2e drawer-in-slot (CHECKS:201) covers placement; but step-3d plan names it. |
| UI/App.test.tsx:381, :396, :411, :425 (production switcher list, keys, Escape/blur, no match) | REWRITE | SpaceSelect behaviour tested through App; SpaceSelect renders standalone (SpaceSelect.tsx:10-17). |
| UI/App.test.tsx:460 'puts the served sections first…asks a global view for every row' | REWRITE | The "global view" half cannot fail (no production is chosen, so scope is null for every view); the sections half duplicates Rail.test.tsx:44-52. |
| UI/App.test.tsx:491 'keeps the selection across a remount, per site' | DELETE | space.test.ts:44-53 (remembered across a new hook, key per host at :13) plus App.test.tsx:447-453 (stored choice scopes the rows on mount). |
| UI/App.test.tsx:596 'has no add button and a disabled export…' | REWRITE | Lines 600-601 cannot fail: the add button reads 'Nieuw …' (App.tsx:181), and no button is named exactly 'Exporteren'. |
| UI/App.test.tsx:607 'builds no grid store…' | REWRITE | Lines 612-613 expect no update/create when no input is given; the name pins an internal. |
| UI/App.test.tsx:632, :662, :1598, :1616, :1641 | REWRITE | Exact `api.rows` counts (:659, :679, :1605, :1613, :1621, :1625, :1645, :1658) pin effect structure; these break on the Workspace split. |
| UI/App.test.tsx:931, :1930 | REWRITE | Real-time negative waits (:937 700 ms, :1943 600 ms) tied to private delays (useSavedViews.ts:13, :16). |
| UI/App.test.tsx:979 "offers Publieke weergave bijwerken on one's own public view…" | DELETE | No autosave on a public view: useSavedViews.test.ts:47-58. The menu saves and clears: App.test.tsx:651-655. Same save path (App.tsx:583 to useSavedViews.ts:157-172), payload at useSavedViews.test.ts:44. Also e2e published-view-stays-put (CHECKS:89). |
| UI/App.test.tsx:1089 'closes the new view dialog on Escape, creating nothing' | DELETE | NewViewDialog.test.tsx:75-82 plus App.test.tsx:1101-1115. |
| UI/App.test.tsx:1117 'says nothing of a view this browser has not changed' | DELETE | Same setup as :1004, whose :1010 already rules out 'Opslaan'. |
| UI/App.test.tsx:1126 'reverts: the local copy is gone…' | DELETE | :1136 performs the same revert; move its single assertion there. |
| UI/App.test.tsx:1377 'moves a view up and down the list' | DELETE | App-level Omhoog reorder plus prefs is :1841-1852; menu to order is ViewList.test.tsx:135-136. |
| UI/App.test.tsx:1587 'shows the action on a Speelreeks row only' | DELETE | Drawer.test.tsx:428-443 and :499-505. |
| UI/App.test.tsx:1854, :1863 (query view keyboard drag with Home) | DELETE | Same key sequences at ViewList.test.tsx:242-254; prefs payload at :1851. Tighten :242 first (see moves). |
| UI/App.test.tsx:1896 'shows the period control on a dated view with no period set' | DELETE | period.test.ts:21-24, ChipBar.test.tsx:266-269 and App.test.tsx:2218 (radios unlit on a dated grid). |
| UI/App.test.tsx:573 'hands the keyboard to the panel in the drawer slot' | KEEP | Plan-required; focus is the outcome. |
| UI/App.test.tsx:2193, :2209 (footer hints and period keys) | KEEP | Plan-required (step-3e plan:61); keys are behaviour. |
| UI/App.test.tsx:244 'exports what is on screen' | KEEP | The export module is the seam. |
| UI/Window.test.tsx:87 'says only "Geen rijen" on a table with no date condition' | DELETE | :91 cannot fail ('Records will appear' exists nowhere in src); the rest is App.test.tsx:126 and :1957. |
| UI/ChipBar.test.tsx:128 'stays open while the sheet beside it scrolls' | DELETE | Cannot fail through project code: no scroll handler in ChipBar.tsx; the fixture scrolls a sibling, not an ancestor. |
| UI/ChipBar.test.tsx:199 'same slots in the same order on all six skins' | KEEP | Decided; lower seam than e2e one-chip-row. |
| UI/MoreMenu.test.tsx:12 'Escape closes the menu…' | REWRITE | Line 19 asserts React Aria's internal `data-trigger` (already flagged at react-aria/review.md:33). |
| UI/NewViewDialog.test.tsx:94 "sets its width on the scrim's direct child" | REWRITE | Pins class placement, not width; jsdom cannot measure. |
| UI/Rail.test.tsx:54 'shows a section label as text…' | REWRITE | `tagName === 'P'` is markup. |
| UI/Rail.test.tsx:158 'swaps the icon for the chevron and shows the tools…' | REWRITE | :173-174 cannot fail (tools always rendered, Rail.tsx:162-167); hover is e2e tree-fold-and-hover. |
| UI/Rail.test.tsx:177 'shows a query with its own icon' | DELETE | Lucide class pin on an icon no spec decides; the decided "computed" mark is :345-354. |
| UI/Rail.test.tsx:199 "opens a model's menus outside the tree…" | REWRITE | Scroll half (:205-206) duplicates MoreMenu.test.tsx:82-89. |
| UI/Rail.test.tsx:233 'holds Bijstellen in its foot…' | DELETE | Duplicates RailFoot.test.tsx:14-21; move its theme and order assertions first. |
| UI/Rail.test.tsx:302 'picks an icon from the grid of the set' | REWRITE | :309 `toHaveLength(ICONS.length)` is a tautology. |
| UI/Rail.test.tsx:318, Search.test.tsx:56, Toolbar.test.tsx:37, ViewList.test.tsx:58 (markup as text, threat 7) | KEEP | Look unable to fail, but they are the only guard. |
| UI/RailFoot.test.tsx:14 'is collapsed by default…' | KEEP | Plan-required inventory. |
| UI/Search.test.tsx:77 'takes focus on Ctrl+K and shows the hint' | REWRITE | `tagName === 'KBD'` is React Aria's `Keyboard`; also add the metaKey case. |
| UI/Share.test.tsx:47 'publishes a view not yet public…' | REWRITE | :58 `tagName === 'TEXTAREA'` is a proxy for e2e publish-address-reads-in-full. |
| UI/Spinner.test.tsx:9 'the spinner is a named progressbar' | REWRITE | `.className === 'nv-spinner'` is a class string. |
| UI/Toolbar.test.tsx:74 'holds the share menu…Exporteren is no longer in the ⋯' | DELETE | Finished-refactor check: `share` renders as passed (Toolbar.tsx:119), the ⋯ cannot hold Export (Toolbar.tsx:91-94), and :118-124 asserts the ⋯ list exactly. |
| UI/Toolbar.test.tsx:82 'has no ⋯ when there is nothing to put in it' | DELETE | Same code path as :157 (`local` absent or null, Toolbar.tsx:120). |
| UI/Toolbar.test.tsx:139 'opens on the keyboard, moves with the arrows…' | DELETE | React Aria Menu keys (not owned); Escape and focus return are MoreMenu.test.tsx:12. |
| UI/Toolbar.test.tsx:164 it.each "the heading's icon" (6 cases) | DELETE | Lucide class names read back from VIEW_ICONS; step-3d plan:103 decides only the glyph tile. |
| UI/ViewList.test.tsx:143 'is keyboard-operable…' | DELETE | Third copy of the MoreMenu keyboard test (MoreMenu.test.tsx:12, Toolbar.test.tsx:139). |
| UI/ViewList.test.tsx:256 'refuses a drop into another group…never offered a gap' | DELETE | Pins `.nv-view__drop[data-drop-target]` class and inline gridRow (ViewList.tsx:150); outcome is covered by :242-254 and landing() at :332-349. |
| UI/ViewPanel.test.tsx:16, :24, :35 | DELETE | Dead code: ViewPanel has no importer except its own test. |
| UI/LinkPage.test.tsx:87 'index.html sends no referrer…' | DELETE-CONFLICT | Source scan; the registered smoke covers it in the browser; but step-2 plan names it. |
| UI/FilterBuilder.test.tsx:70 'lists a row per condition, with the operators of its field' | KEEP | Looks like an OPERATORS read-back, but the lists are decided. |
| UI/Providers.test.tsx:23 'popovers render inside #root' | KEEP | Plan-required (react-aria plan:107, :31). |
| UI/tables.test.ts:36 "carries the table's view types and whether it is a query" | KEEP | Looks like a read-back, but App.tsx:348-351 (rail counts skip queries) and Rail.tsx:136 consume it. |

## KEEP: the bar, point by point
- **Threat-7 markup tests** (Rail.test.tsx:318, Search.test.tsx:56, Toolbar.test.tsx:37, ViewList.test.tsx:58)
  - Decided: step-0d/plan.md:48, "names rendered as React text only".
  - Expected value: no `<img>` element; it would disagree under innerHTML.
  - Outcome and seam: rendered DOM of each component, each a separate render path.
  - Can fail: yes. Biome lint is off for apps/grid (biome.json overrides), so nothing else guards this.
  - Lowest seam, no duplicate: one per surface.
- **RailFoot.test.tsx:14**
  - Decided: step-3d/plan.md:63 row ("collapsed by default; opening shows the radiogroups…").
  - Outcome: aria-expanded and radiogroups by role, at the component seam. Can fail if a look is dropped.
  - Lowest seam.
- **App.test.tsx:573**
  - Decided: step-3d/plan.md:66 ("Enter on a cell opens the panel in `.nv-drawer-slot`, with focus inside it").
  - Outcome: focus moves into the panel, which can fail.
  - Seam: App is the lowest seam where the matrix and the slot meet. The class line at :580 is plan-mandated; on the Workspace split, update it only if the slot markup moves.
- **App.test.tsx:2193, :2209**
  - Decided: step-3e/plan.md:61 ("Hints and period keys | render `App` per skin | component · `App.test.tsx`").
  - Outcomes: the pill steps and returns; grid arrows leave the period alone (:2217-2218). The hint copy is pinned by plan.
  - Can fail; App seam.
- **App.test.tsx:244**
  - Decided: R4 Excel (grid-toolbar spec).
  - The `exportSheet` arguments are the seam to the export module, so they are the outcome. They can disagree: hidden column, order, groups.
  - No lower seam composes layout plus rows.
- **ChipBar.test.tsx:199**
  - Decided: "one chip row, one order" (step-3d/3e; ChipBar.tsx:115).
  - Slot order and presence, through barOf plus ChipBar (the component seam). Can fail.
  - Lower than e2e one-chip-row (step-3d.spec.ts:228). The class probes are incidental.
- **FilterBuilder.test.tsx:70**
  - Decided: grid-toolbar spec R8 and R5, plus period-today ("is vandaag").
  - The expected words can disagree with OPERATORS (FilterBuilder.tsx:14-20). Options by role at the component seam; can fail.
- **Providers.test.tsx:23**
  - Decided: react-aria plan:107 and :31.
  - Outcome: the popover sits inside #root. Project wiring (Providers.tsx:11), can fail, lowest seam.
- **tables.test.ts:36**
  - Contract of groupTables (tables.ts:33) consumed by App.tsx:348-351 and Rail.tsx:136. It can fail if `query` or `types` is dropped.
  - Lowest seam. Rail.test builds its fixture through groupTables but never asserts the passthrough.

## REWRITE: the bar and the replacement
- **App.test.tsx:205**
  - Decided: App.tsx:228 `setStrings(s.strings)`.
  - Fails the bar: the expected value cannot disagree (the overrides equal i18n.ts:9 and :13; the assertion reads i18n.ts:8). It passes with :228 removed.
  - Replacement: App seam, `strings: { new: 'Toevoegen' }`, expect a button named 'Toevoegen Activiteit' (App.tsx:181).
- **App.test.tsx:381, :396, :411, :425**
  - Decided: the space switcher (SPEC Sidebar). Outcomes are fine and can fail.
  - Fails the lowest-seam rule: these exercise SpaceSelect through App.
  - Replacement: a new SpaceSelect.test.tsx rendering `<SpaceSelect label="Producties" records=[…] selected={null} onSelect={fn}>`, same actions and assertions. Keep :381's `records('production','')` only if wanted; useSpace already reads records (space.test.ts:37).
- **App.test.tsx:460**
  - Decided: a global view is never scoped (App.tsx:260-262).
  - Can fail: no, nothing is selected. The sections half duplicates Rail.test.tsx:44-52.
  - Replacement: same App seam. `choose('Alle producties','Glimworm')`, open Afwezigheden, expect `api.rows` last called with `(spaced.views[1], {}, null, …)`. Drop lines 463-468.
- **App.test.tsx:596**
  - Decided: no add on a matrix; Excel blocked with a reason.
  - Can fail: lines 600-601 cannot.
  - Replacement: `queryByRole('button', { name: /^Nieuw/ })` is null; drop line 601.
- **App.test.tsx:607**
  - Outcome-only part: no sheet title column (:611).
  - :612-613 expect no update/create without any input; the name pins "grid store".
  - Replacement: rename to "a matrix view draws no sheet beside it", keep :611, drop :612-613.
- **App.test.tsx:632, :662, :1598, :1616, :1641** (Workspace split)
  - The behaviours are decided: undo kept through a save, re-read after a refusal, the view reloads after an action and after its undo. They are App-seam outcomes.
  - Exact counts pin how many effects fire.
  - Replacements:
    - Drop :659; the cell '✓' at :656 and the undo at :658 already prove survival.
    - Drop :679; the text at :680 only arrives on the second answer.
    - At :1605, :1613, :1621, :1625, :1645 and :1658, capture `before = reads('speelreeks')` and `waitFor(reads > before)`, as :1521 already does.
- **App.test.tsx:931, :1930**
  - Decided: no prefs write on landing; a link landing does not autosave (R4).
  - The waits stop being able to fail if PREFS_DELAY (useSavedViews.ts:13) or AUTOSAVE_DELAY (:16) grows past 700 or 600 ms.
  - Replacement: `vi.useFakeTimers()` and advance by the imported AUTOSAVE_DELAY (export PREFS_DELAY), as useSavedViews.test.ts:42 does.
- **MoreMenu.test.tsx:12**: plan-required (react-aria plan:185). Drop line 19, the internal `data-trigger`.
- **NewViewDialog.test.tsx:94**
  - The behaviour (the dialog keeps its width, fix 5ac9232) cannot be measured in jsdom. The assertion is the class on Modal (NewViewDialog.tsx:44-45).
  - Replacement: one `boundingBox().width` assertion in the existing dialog step of e2e/grid-ux.spec.ts:237. No new e2e test.
- **Rail.test.tsx:54**: drop :57 (tagName); keep :58 (no button).
- **Rail.test.tsx:158**
  - Keep only the focus case: `fireEvent.focus(name)` gives `row.dataset.hot === 'true'`. No e2e covers keyboard focus. Better still, add `focus()` plus tools opacity 1 to grid-ux.spec.ts:203.
  - Drop the hover and lucide-class lines (covered by e2e at :198-205) and :173-174, which cannot fail.
- **Rail.test.tsx:199**: drop :205-206 (the MoreMenu.test.tsx:82 duplicate); keep the portal assertions.
- **Rail.test.tsx:302**: drop :309.
- **Search.test.tsx:77**: drop the `tagName` check; add `it.each` over `{ctrlKey}` and `{metaKey}` (Search.tsx:36).
- **Share.test.tsx:47**: drop :57-58.
- **Spinner.test.tsx:9**: keep the role and name, drop `.className`.

## DELETE-CONFLICT: governing lines
- **App.test.tsx:301.** SPECS/grid-ux/plan.md:86: "`App.test.tsx`: the density choice sets `data-density` and survives a re-render;". It belongs in RailFoot.test.tsx (seam RailFoot.tsx:56): Compact gives `#root[data-density=compact]` and survives a remount.
- **App.test.tsx:323.** SPECS/step-3d/plan.md:64: "unit · `apps/grid/src/ui/App.test.tsx` (one case). Asserts: the open drawer's `aside` is a child of `.nv-drawer-slot`, a sibling of `main.nv-main`". e2e drawer-in-slot (CHECKS:201) covers it in the browser. It is markup-only; on the Workspace split this is the test most likely to need edits.
- **LinkPage.test.tsx:87.** SPECS/step-2/plan.md:491: "`index.html` holds both meta tags." (mitigation 15 at :82). The registered smoke e2e/smoke/step-2.spec.ts:6-13 ("the page sends no referrer and asks not to be indexed @smoke", CHECKS:139) asserts both metas in a real browser. `nofollow` is the only extra the unit asserts, and no spec decides it. A grep invariant would suit, but there is no ARCHITECTURE-INVARIANTS.md.

## Assertions to move before a DELETE
- App.test.tsx:239 (metaKey) to Search.test.tsx:77.
- App.test.tsx:1133 `expect(local('planning')).toBeNull()` to App.test.tsx:1136, right after the Terugzetten click.
- Rail.test.tsx:241 (the five radiogroups in order) and :244-245 (Thema Donker gives `#root[data-theme=dark]`, the only theme test) to RailFoot.test.tsx:14.
- App.test.tsx:1854 and :1863 to ViewList.test.tsx:242:
  - make the loop strict: `expect(run.order).toHaveBeenCalledWith('dagplanning', ['perweek','dagplanning'])`;
  - add `drag('Per week','Home','Enter')` with the same expectation. As written, the loop at :249-252 passes even if no dagplanning call happens.
- Optional, since this is React Aria's behaviour: "Enter on the trigger opens and focuses the first item" (Toolbar.test.tsx:143-147, ViewList.test.tsx:149-153) to MoreMenu.test.tsx:12.

## Dead support code
- **Production, already dead:**
  - UI/ViewPanel.tsx (only ViewPanel.test.tsx imports it).
  - Its string `viewName` at apps/grid/src/i18n.ts:207.
  - The CSS `.nv-viewpanel__*` at UI/app.css:4165-4190 and :4369-4378.
- **Test support, dead once the deletes apply:**
  - ChipBar.test.tsx:29 `data-testid="scroller"`.
  - LinkPage.test.tsx:1-2 (`readFileSync`, `join`).
  - Rail.test.tsx:5 `ICONS`, after the :302 rewrite.
  - App.test.tsx:299 afterEach, and the describes at :298, :322 and :1895 empty out.

## Workspace split: tests that break with no behaviour change
- The exact read counts at App.test.tsx:659, :679, :1605, :1613, :1621, :1625, :1645 and :1658.
- The markup in the slot tests at :323-331 and :580, if the slot moves.

Everything else renders `<App/>`, mocks only `../api` and `../export/download`, and asserts DOM or the api seam, so it survives a hooks split. `toHaveBeenLastCalledWith` on `api.rows` assumes the view read comes last; it holds while no test schema declares `flags`, because useFlags also calls `rows`.

## Cross-tier duplicates (unit vs registered e2e, for whoever audits e2e)
| unit test | registered e2e |
|---|---|
| RailFoot.test.tsx:23 | looks-gridlines (CHECKS:200) |
| Rail.test.tsx:133 | tree-fold-and-hover, grid-ux.spec.ts:208-222 |
| ChipBar.test.tsx:199/:243 and App.test.tsx:751 | one-chip-row (CHECKS:202) |
| ViewList.test.tsx:292 | reorder-views, react-aria.spec.ts:747-752 |
| App.test.tsx:1715 and Rail.test.tsx:264 | name-and-icon-are-for-administrators (CHECKS:42) |
| App.test.tsx:1686 | rename-and-icon-a-model (CHECKS:41) |
| useSavedViews.test.ts:86 | new-timeline-defaults (CHECKS:208) |
| Act.test.tsx:40 and :100 | confirm-without-login, cancelled-invite-offers-no-answer (CHECKS:123, :126) |
| Share.test.tsx:47 | publish-from-share-menu, publish-address-reads-in-full (CHECKS:88, :109) |

The unit side is the lower seam in each case. The time cost is on the e2e side.

## Findings outside the brief
- **Lines that cannot fail:** App.test.tsx:205-212, :600-601, :612-613, :460-473 (global half); Window.test.tsx:91; Rail.test.tsx:173-174; ChipBar.test.tsx:128-135.
- **ChipBar.test.tsx:128 reasoning is inferred, not checked against react-aria's source** (unavailable here). MoreMenu.tsx:42 has no scroll code, yet MoreMenu.test.tsx:82 shows its menu closing when an ancestor box scrolls, so that close comes from the library. ChipBar's Panel uses the same non-modal Popover (ChipBar.tsx:53), and the test scrolls a sibling.
- **Stale test name:** App.test.tsx:616 "says Saved" asserts the opposite (:629, 'Opgeslagen' absent, per R1).
- **Unfixed review note:** react-aria/review.md:33 flagged MoreMenu.test.tsx:19; it is still there.
- **Lint gap:** Biome lint is disabled for apps/grid (/home/ntdst/Sites/worktable-prune/biome.json overrides), and no production code uses innerHTML. When Biome is turned back on (the next feature, per memory), `noDangerouslySetInnerHtml` could replace the four threat-7 tests, since step-0d/plan.md:48 only requires "names rendered as React text only".
- **Untested order:** step-3d/plan.md:103 orders "history before share", but Toolbar.test.tsx:17 checks history before ⋯; nothing pins history before share.
