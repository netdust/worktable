# Review: feature/step-3d part 2 (075c25a..55f33a6)

Reviewed in three passes: (1) shell + seed + e2e edits, (2) dashboard/matrix/grid/drawer, (3) board/gallery/timeline/calendar plus a targeted scan of the 1,612 added lines of app.css (hard-coded colours, focus rules, domain words, drawer-slot media queries). No tests or gates were run.

## Strengths

- **Scope held.** `git diff --stat -- packages/engine` is empty. Theatre changes are confined to `seed.ts` and its three test files, as the Global Constraints require. No domain word appears in the new generic code in `apps/grid` (only one comment mentions "optie") or in the added CSS.
- **Generic heuristics instead of theatre names.** Tone comes from "the first select with tones", place from "the first relation that is not a lane", and hatch/strike from the `warn`/`bad` tone (`TONE_CLASS`), never from `optie`/`geannuleerd`. That respects AGENTS.md's one rule.
- **The drawer-slot portal is the smallest form of the change.** `SidePanel` portals into a context slot when there is one and renders inline otherwise, so tests and auth pages are unaffected. The matrix keyboard hand-off got the slot-aware query the plan named (`Matrix.tsx:318`), backed by two App tests, one of them for the History-open case.
- **Bijstellen is clean.** `useLook` generalises the old density toggle. The settings hooks sit in `RailFoot`, not in the folded rows, so they still apply while the card is closed (with a comment saying why). Storage keys are kept, and blocked storage is handled.
- **Test edits are justified, not loosened.** The Rijhoogte rename, `openLooks()` and the chip-order swaps all follow approved visual changes. The `Status is Optie` matcher was tightened to the chip element rather than weakened. New behaviour tests were added: the board card's lines, gallery placeholder/tone/picture count, the unlaned calendar tone, the matrix tone classes and legend, list-tile kind and late day, and RailFoot.
- **The seed is DST-safe.** Tourstop dates are anchored on Monday at noon. "Repetities" (20 days) stays under the 31-day `max_speelreeks_dagen` cap the writer would enforce.
- **Colours go through tokens.** Dark mode follows because new CSS uses tokens throughout. The only literals are `#fff` on the `--today` pill, copied verbatim from the prototype, and two shadows. Every focusable element still gets the global `:where(button, a, [tabindex]):focus-visible` ring.
- **Compare pairs exist** for all seven skins, light and dark, under `specs/step-3d/compare/`.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

1. **Query-sourced calendars now show a dead "Nieuw …" button with an "Alleen lezen" note.**
   - **Where:** `apps/grid/src/ui/App.tsx:289` and `:506-507`.
   - **What's wrong:** `quickAdd` is true for every calendar (`Boolean(calendar)`), including the three seeded query calendars: Persoonskalender, Locatiekalender and Bedrijfsweek. For those, `addBlocked` becomes `t('readOnly')` while `onAdd` is still set. The Toolbar (`Toolbar.tsx:100-102`) therefore renders a disabled primary button plus a hint where there was nothing before. The same happens on any query timeline, board or gallery, and for viewers on any skin.
   - **Why it matters:** this is chrome bound to no behaviour, against the plan's Global Constraint "A control appears only where it binds to an existing behaviour". The approved addition was quick create on dataset skins, not a disabled button on read-only views.
   - **Fix:** gate the quick-create path on `!model?.query`, falling through to `onAdd={undefined}` otherwise. For example, `const quickAdd = (board || timeline || gallery || calendar) && !model?.query`, then keep the existing `matrix || dashboard || quickAdd-ineligible ? undefined` path. Add one App test: a query calendar shows no add button.

2. **The title-row summary pill goes stale on the dashboard (and during loads).**
   - **Where:** `apps/grid/src/ui/App.tsx:181` and `:502`.
   - **What's wrong:** `shown` is never reset on a view switch, and the Dashboard never calls `setShown`. This branch made four more skins call it (Board, Gallery, Calendar with a `label`, Timeline). So opening Overzicht after the calendar shows the calendar's period ("Week 42 · 12–18 okt") as the dashboard's summary, and after a board "12 rijen · 4 kolommen". The compare pair hides this because it opens the dashboard first.
   - **Why it matters:** the summary states wrong facts about the page. Spec §8 asks for "{space} · week 42" on the dashboard, and neither the plan nor the ledger accounts for it.
   - **Fix:** call `setShown(null)` in `setActiveKey` (or key the state by view). Then either have the Dashboard report its own label or leave it empty and add the item to the ledger.

3. **Matrix heads show the first name only, so colleagues who share a first name can't be told apart.**
   - **Where:** `apps/grid/src/matrix/Matrix.tsx:782`.
   - **What's wrong:** `column.title.trim().split(/\s+/)[0]`. Two people named "Sien …" both read "Sien", and the matrix's own test fixture already has two Sien columns. The full name is available only as a hover `title`, and the header's accessible name is now the first name too (cells keep the full name in their `aria-label`). Matrix columns are also generic records: a venue or role column, e.g. "Zaal De Spiegel", becomes "Zaal".
   - **Note:** the orchestrator approved this. It is flagged for its effect on users, not as a plan deviation.
   - **Fix:** show the full title when first names collide within the visible columns, or when the column's model is not a person. Alternatively, put the full name in an `aria-label` on the `th`.

### Minor (Nice to Have)

1. **Gallery placeholder is not the prototype's initials.**
   - **Where:** `apps/grid/src/gallery/Gallery.tsx:22`.
   - **What's wrong:** `mark()` takes the title's first two letters ("opbouw Gent" → "Op"). The prototype's `mono()` (`design/gallery-prototype.html:820`) and spec §6 use word initials ("OG"), falling back to two letters for a one-word title. `ui/when.ts` already exports `initials`, and the test pins "Op".
   - **Fix:** use the prototype's rule and update the test.
2. **List tile treats every date column as a deadline.**
   - **Where:** `apps/grid/src/dashboard/ListTile.tsx:82`.
   - **What's wrong:** any `date` column before today is painted `--late` (red), whatever it means. The spec's amber "today" state is also missing.
   - **Fix:** accept it as the tile's convention and add the today class, or limit it to a date column the tile names.
3. **Calendar can colour by soort while its legend explains lanes.**
   - **Where:** `apps/grid/src/calendar/Calendar.tsx:51`.
   - **What's wrong:** "unlaned" is detected as `lanes.every(l => l.id === null)`. A laned calendar whose rows all lack the lane value therefore tints by soort, while the legend (shown because `lane` is set) explains lane colours.
   - **Fix:** pass `lane === null` into `lanePalette` instead.
4. **Timeline jumps back to today on every reload.**
   - **Where:** `apps/grid/src/timeline/Timeline.tsx` (effect deps `[shown.from, todayAt, rows]`).
   - **What's wrong:** any reload (for example after a quick create) resets the viewer's horizontal scroll to today.
   - **Fix:** depend on `shown.from` and `todayAt` only.
5. **Timeline `pin()` is heavy on scroll.**
   - **What's wrong:** it does a `querySelectorAll` and writes inline styles for every bar on every scroll event. That is fine at seed size and could jank at hundreds of bars.
   - **Fix:** wrap it in `requestAnimationFrame`.
6. **Timeline corner miscounts lanes.**
   - **What's wrong:** it reads `{n} rijen` using `t('lane')` ("Rijen"). That gives "1 rijen", and it reuses the word for rows, which the chip row also uses.
7. **`--today` pill fails contrast in dark mode.**
   - **What's wrong:** white text on `#ff8a4c` is about 2.3:1. This is copied from the prototype, so it is a design note for the owner rather than a code defect.
8. **Hard-coded 232px in the now line.**
   - **Where:** `Timeline.tsx:149`.
   - **What's wrong:** `calc(232px + …)` duplicates the lane-head width defined in CSS.
   - **Fix:** use a CSS custom property.
9. **Dead and duplicate i18n strings.**
   - `hintCancel`, `hintSearch` and `shortcuts` are now unused.
   - `hints` duplicates `shortcuts` ('Sneltoetsen').
10. **Inconsistent summary-callback prop name.** Board and Gallery call it `onShown`, while Calendar and Timeline call the same callback `onTitle`, because their `onShown` already means "change the window".
11. **Board cast.**
    - **Where:** `Board.tsx:62`.
    - **What's wrong:** `(view as Partial<SavedView>).arrangement` uses a cast. Also, a saved board with an empty `visible_fields` now shows title-only cards instead of "the first three". That is consistent with the grid but is a behaviour change worth knowing about.
12. **Questionable seed fixtures.** Some invented tourstop venues don't match their names: "Lier" and "Gent" at De Spiegel (Gent), "Leuven" at De Loods (Antwerpen, a partner rather than a venue). The archived production Zomerstorm also gets a confirmed tourstop this week. Harmless, but it reads oddly in the drawer and compare shots.

## Production readiness: seed changes on a live database

`seed-missing` (`packages/engine/src/seed-missing.ts:136-176`) does update system-owned, unpublished views to the new declarations. On the next `--seed-missing`, a live client database therefore gets all of these:
- Planning's new column order;
- "Per status" added;
- Tijdlijn on this month;
- Galerij restricted to this week, with its new fields;
- Kalender activiteiten unlaned;
- the Vandaag tile's columns.

Published or owner-shared views are left alone. That is intended, but these are visible changes for existing users (for example, Galerij no longer shows all activities) and should be in the release note.

The seven tourstops are not inserted into existing databases (`speelreeks` is not a config dataset), so live data is untouched. A client whose own tourstops don't start or overlap this month will open an empty Tijdlijn. Spans are read by overlap (`spanRows`), so tourstops running into the month do show.

## Declined to judge

- **Pixel fidelity of each skin against its prototype:** judged by the owner through the compare pairs. I looked at one pair (dashboard) and did not re-judge styling.
- **The ledger's "out" items** (drag, overlap warning, bezetting, conflict badge, S/M/L, Week/Maand on the timeline, drawer position/up/down): deliberately not built, per spec.
- **Quick create on board, timeline, gallery and calendar dataset views:** approved by the orchestrator. Only the query and read-only spill-over is flagged (Important 1).
- **Footer hints on skins where the arrow keys and ↵ do nothing** (board, gallery, dashboard): the spec asks for the line "at the bottom of every skin".
- **Esc and ⌘K dropped from the visible hints:** approved by spec row 31 and plan Task 1 Step 8.
- **"Geen" board lane hidden when empty:** the prototype has no such lane. It is a display choice consistent with "Matches".
- **Toolbar order (history before share), the GridBar filter-before-Groep order and 16px cells:** these follow the spec's rows.
- **`#fff` on `--today`:** copied from the prototype (noted under Minor for contrast only).
- **Biome's exhaustive-deps on the new `useEffect`s:** the gate's Biome run is the authority; not re-run here.
- **E2E and shake-out coverage of the new quick-create entry points:** that is the close's job (`/shakeout`), not this diff review.

## Recommendations

- Fix Important 1 and 2 in the one fix pass; each is a few lines with one RED→GREEN App test.
- For Important 3, a collision fallback (full name when first names repeat) keeps the approved look in the common case.
- Mention the seed-driven view updates in the promote note.

## Assessment

**Ready to merge?** With fixes

**Reasoning:** The branch keeps to its styling scope: no engine change, no domain words in the generic grid code, and test changes that follow approved renames. But quick create leaks a disabled add button onto read-only query skins, and the summary pill shows stale facts on the dashboard; both should be fixed before promotion.

## Fix pass (one, each fix RED→GREEN)

| Finding | Outcome | Commit |
|---|---|---|
| Important 1: dead add button on query calendars | fixed: quick create only off a query; App test | 6166f25 |
| Important 2: stale summary pill on the dashboard | fixed: the summary is kept with the view that told it; App test from a calendar to a dashboard | 6166f25 |
| Important 3: matrix first names collide | fixed: the whole name where two first names meet; matrix test. Place columns still read by their first word ("Zaal"), flagged to the orchestrator | 6166f25 |
| Minor 1: gallery placeholder initials | fixed: word initials, one-word titles their first two letters (the prototype's rule) | e20ccfb |
| Minor 2: amber today in a list day | fixed | e20ccfb |
| Minor 3: laned calendar falling back to soort tones | fixed | e20ccfb |
| Minor 4: timeline scroll reset on reload | fixed: scrolls to today once per window | 5615666 |
| Minor 6: "1 rijen" in the timeline corner | fixed: the lane count as a pill | 5615666 |
| Minor 9: dead i18n strings | fixed | e20ccfb |
| Minor 5, 7, 8, 10, 11, 12 | not changed: 7 is the prototype's own colour (owner's note); 10 is gone with the shared chip row (skins tell App through onShown/onTitle only); 5, 8, 11, 12 left as notes | — |

Also in this pass, from the owner through the orchestrator: new timeline views open on this month in lanes (5615666); an unlaned timeline packs its bars into one lane (5615666); one chip row for every view (and its spec section, 9d47b38). The gate's 21 real e2e failures were fixed in bcdaa68 (one regression, the date column's width; the rest old contracts).
