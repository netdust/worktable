# Shake-out: action-row

Driven 2026-10-25 on `feature/action-row` at f424eb4, after the review's fix pass. The shake-out adds tests, screenshots, registry rows and this file. It changes no product code.

The artifact is the harness's fresh invented instances (`playwright.config.ts`, every run `--fresh`):
- studio: engine 4313, grid 5176, `packages/studio/src/seed.ts`;
- theatre: grid 5174;
- the engine's selection fixture: grid 5177.

Every flow ran in a real Chromium at 1440 by 900, unless the row says otherwise. The actor was the seeded studio administrator. The editor appears where a row names it. Every Playwright run held the machine-wide e2e lock.

**The flows.**
- The plan's Close and its Test map list five: totals-clear-of-the-panel, one-size-in-a-row, confirm-from-the-row, site-actions-in-the-row and open-the-address. They are rows 1 and 3 to 6. open-the-address is new.
- Row 2 is the review's N4, the short table pinned at the pane's bottom, now with its own test.
- Rows 7 and 8 are the hunt's two confirmed bugs. Each repro was committed RED at f424eb4, was fixed at bc90937 and has been re-driven green.
- Rows 9 to 18 re-drive the registered surfaces this branch touched, then the smoke checks.

No flow was left out.

**Results of the re-drive.** Two runs:
- Run A: `e2e/studio.spec.ts`, `e2e/table-look.spec.ts` and `e2e/smoke`. 65 of 66 passed. open-the-address failed once on a timeout, and its trace holds 25 `net::ERR_NETWORK_CHANGED`, the WSL network flake. It passed in the isolated runs before and after, and in run B.
- Run B: `action-inputs` 6, `drawer-actions` 9, `grid-ux` 13, `selection` 17, `step-3d` 5 and `studio` 49. All 99 passed.

The two repro tests (rows 7 and 8) then failed on their `expect`, never on a timeout.

**Re-drive after the fix pass (bc90937).** bc90937 changed `app.css` in three places:
- link names get padding 0 again;
- an off switch gets a darker track on the hovered row;
- the pills in the drawer's head and fields take the text size.

Re-driven at bc90937, 9 tests, all green (11 runs; the two repros ran twice): both repros, drawer-reads-right, confirm-from-the-row, site-actions-in-the-row, open-the-address and the three table-look flows. Their screenshots were retaken. The drawer's Status and Gezondheid pills now read at the fields' size (opdracht-rij-licht.png, site-adres-icoon-licht.png), which settles the 12px question put to Stefan. The repro for row 7 now also shoots dark.

**A test fix.** `table-look`'s `finally` called `DELETE /api/rows/site/:id`. That route answers 405 for a site (sites are the worker's), so the 28 invented sites were never removed. The test never checked the status. `e2e/forget.ts` now takes invented sites, and their history, out of the instance's database. Both `table-look` and open-the-address use it. After table-look, the short-table test again counts the 4 seeded sites.

**Edges met:**
- empty: a search with no hits; a site with no address; an opdracht with no actions, stepped to one with actions;
- denied actor: the administrator and the editor PATCHing `adres` (403 `service_only`);
- re-entry: widen, narrow and widen again; step away and back;
- concurrent: the worker preparing three runs while two sites are ticked (the tall dock);
- boundary: the 392 px drawer, viewports of 1024, 1280 and 800 px, a 430 px-high window, and 28 extra rows;
- mid-flow failure: an empty address or one with a leading space is refused `bad_url`; the new tab's request is aborted;
- delivery seam: the new tab opens with `rel="noopener noreferrer"`, and the head gets a normalised href.

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | totals-clear-of-the-panel (R3), boundary edge: Sites with 28 invented rows overflows its pane. At the top and at the end, "Totaal · 32 rijen" ends within 16 px of the pane's bottom, and the space above it is empty, 100 px or more under the last row. With 2 ticked, the pane keeps its height. Scrolled to the end, the panel ends above the totals and the last row ends above the panel. Scrolled to an eighth, rows pass visibly under the panel. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/tabel-einde-paneel-donker.png · light: shakeout/tabel-einde-paneel-licht.png · rows under the panel: shakeout/tabel-midden-paneel-licht.png, shakeout/tabel-midden-paneel-donker.png · Test: e2e/table-look.spec.ts "totals-clear-of-the-panel @e2e" |
| 2 | totals-pinned-on-a-short-table (new; review N4), empty edge: the seeded Sites, 4 rows, does not scroll. The totals' bottom is within 16 px of the pane's bottom, and they start more than 100 px below the last row. The hunt also checked a search with no hits ("Geen rijen voor deze zoekterm of filters"), Storing and Let op (1 row each), SLA-sites (2), grouped by Gezondheid, and a 430 px-high window: the foot ends at the pane's bottom every time. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/tabel-kort-licht.png · dark: shakeout/tabel-kort-donker.png · Test: e2e/table-look.spec.ts "totals-pinned-on-a-short-table @e2e" |
| 3 | one-size-in-a-row (R2, R2a): every text-bearing element in Sites' first row computes 13px in one face, pills included. The row is 32 px, and the muted cell's middle sits within 2 px of the title's. The hunt read the first row of Sites, Opdrachten, Taken, Projecten, Features and Organisaties in light and dark. Every toned choice is a pill: Gezondheid, Status (Voorbereid and Klaar) and Fase, at 13px and weight 500, 22 px high. Untoned choices are plain 13px text: Soort, Bron, Taken's Status and Organisaties' Soort. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/tabel-kort-licht.png · Test: e2e/table-look.spec.ts "one-size-in-a-row @e2e" |
| 4 | confirm-from-the-row (R4, R5, Review Focus 3): a Bijwerken on voorbeeld-site, prepared as the worker does, opens with Bevestigen as a filled button directly under Sites, before Annuleren (quiet). No menu is open, and the head holds neither. The hunt also drove a cancelled opdracht (no row at all), then ↓ to a prepared one: the row appears with Bevestigen first. It stays one line widened and narrowed again, and ↑ back to the cancelled one leaves no row. | browser | pass | Browser: http://127.0.0.1:5176/#view=9 · shakeout/opdracht-rij-licht.png · dark: shakeout/opdracht-rij-donker.png · Test: e2e/studio.spec.ts "confirm-from-the-row @e2e" |
| 5 | site-actions-in-the-row (R4, Review Focus 5 and 6), boundary edge. At 392 px the row is one line: Gezondheid checken, Malware scannen, then ⋯ "Meer" holding Bijwerken and Smoketest draaien. Nothing overflows the row or the body. Widened, all four show on one line and Meer is gone. The order is the same at both widths. The hunt re-measured at 1280 and 1024 (same fold), widened to 1012 and 756 px (all four), and widened at 1440 then resized to 800 (folds to 3 + Meer) and back (4). On the selection fixture a record shows four actions and Meer (row 14). | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/site-rij-licht.png · dark: shakeout/site-rij-donker.png · widened: shakeout/site-rij-breed-licht.png, shakeout/site-rij-breed-donker.png · Test: e2e/studio.spec.ts "site-actions-in-the-row @e2e" |
| 6 | open-the-address (new; R7, threat-model attacks 1 to 3), denied actor and delivery seam edges. voorbeeld-site's drawer head shows the icon link "Openen in nieuw tabblad": href https://voorbeeld-site.test/, target `_blank`, rel `noopener noreferrer`. A site has no ⋮ (no record link, no delete), so the icon is the first of the head's tools, before "Volledig openen". A click opens a new tab whose request is for exactly that address; the test catches and aborts it, so nothing leaves the machine. The drawer stays. A site the worker made without an address shows no icon. A PATCH of `adres` by the administrator and by the editor is 403 `service_only`, and the address is unchanged. The hunt also drove the head by keyboard: on the last record (Volgende disabled), Tab goes from Vorige to the icon, then Volledig openen, then Sluiten. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/site-adres-icoon-licht.png · dark: shakeout/site-adres-icoon-donker.png · head, cropped: shakeout/site-adres-icoon-kop-licht.png, shakeout/site-adres-icoon-kop-donker.png · Test: e2e/studio.spec.ts "open-the-address @e2e" |
| 7 | Hunt bug 1, link-names-keep-their-commas: in a links cell every name carried 10 px of pill padding, so each comma floated away from its name ("testmans-bestel  ,  voorbeeld-site" on Opdrachten' "Bijwerken · 2 sites"). This branch's `.nv-grid:not(.nv-mx) .nv-td .nv-pill { padding: 2px 10px }` outranked the links cell's `padding: 0`. RED at f424eb4 on `expect(look.padding).toEqual(['0px 0px', '0px 0px'])`, which received `['10px 10px', '10px 10px']`. **Fixed at bc90937** (`.nv-grid:not(.nv-mx) .nv-td .nv-names .nv-pill { padding: 0 }`). Re-driven: both names compute 0px padding and each comma sits against its name. The cell reads "testmans-bestel, voorbeeld-site" in light and dark. | browser | pass | Browser: http://127.0.0.1:5176/#view=9 · shakeout/opdrachten-sites-namen-licht.png · dark: shakeout/opdrachten-sites-namen-donker.png · Test: e2e/studio.spec.ts "link-names-keep-their-commas @e2e" (RED at f424eb4, green at bc90937) |
| 8 | Hunt bug 2, off-switch-shows-on-a-hovered-row: on the row under the pointer, a switch that is off showed only its thumb. Its track (`--color-bg-muted`) sat on `--color-bg-hover` at a contrast of 1.03 in both themes (voorbeeld-site's SLA Nee). RED at f424eb4 on `contrast ≥ 1.1`, which received 1.026 in light. **Fixed at bc90937**: on a hovered row an off track takes `color-mix(in srgb, var(--color-fg-muted) 24%, var(--color-bg-hover))`. Re-driven: the assertion holds in light and dark, and in both screenshots the hovered row's Nee switch shows its track and thumb. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-schakelaar-hover-licht.png · dark: shakeout/sites-schakelaar-hover-donker.png · Test: e2e/studio.spec.ts "off-switch-shows-on-a-hovered-row @e2e" (RED at f424eb4, green at bc90937) |
| 9 | Re-drive, the studio drawer: drawer-reads-right (Bevestigen filled in the action row, Annuleren beside it, no live mark while it waits on Bevestigen; a site's four actions in its row), request-from-a-site-drawer, confirm-update-from-dashboard, editor-cannot-confirm and decided-request-lines. All green. | browser | pass | Browser: http://127.0.0.1:5176/#view=9 · shakeout/opdracht-drawer-bevestigen.png · site: shakeout/site-drawer-acties-boven.png · Test: e2e/studio.spec.ts "drawer-reads-right @e2e" and the other `@e2e` tests of studio-domain and studio-polish |
| 10 | Re-drive, the keyboard walk: actions-row-by-keyboard. In voorbeeld-site's row, Tab steps from Gezondheid checken to Malware scannen. Enter on Meer focuses its first item, ↓ moves on, Escape returns to Meer, and a second Escape closes the drawer. The hunt added End and Home in the menu, Shift+Tab from Meer, and Tab past Meer into the body. All work. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/site-acties-toetsen.png · Test: e2e/studio.spec.ts "actions-row-by-keyboard @e2e" |
| 11 | Re-drive, delete-asks-twice, re-entry edge: a task's ⋮ › Verwijderen shows "Zeker?". Escape keeps the task, and the second press deletes it and closes the drawer. | browser | pass | Browser: http://127.0.0.1:5176/#view=16 · shakeout/taak-verwijderen-zeker.png · Test: e2e/studio.spec.ts "delete-asks-twice @e2e" |
| 12 | Re-drive, the selection panel and the dock, concurrent edge. These are tick-and-run-from-the-panel, tall-dock-leaves-the-last-row (three prepared runs plus the panel at 1440 by 480: the last row ends above the whole dock), waiting-line-and-panel-leave-the-last-row, twenty-runs-leave-the-table-reachable, and `e2e/selection.spec.ts` (17, among them bar-reserves-its-strip). All green. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/hoge-dock-laatste-rij.png · waiting: shakeout/wacht-en-selectie-onderaan-licht.png, shakeout/wacht-en-selectie-onderaan-donker.png · fixture: shakeout/selectie-paneel-fixture.png · Test: e2e/studio.spec.ts "tall-dock-leaves-the-last-row @e2e" and e2e/selection.spec.ts, its 17 `@e2e` tests |
| 13 | Re-drive, the row lines and the table lines (R1): row-lines-at-125 and row-lines-at-150, table-lines-in-both-themes (Sites lists only the 4 registry sites, every cell with its column line in dark and light), and looks-gridlines (Bijstellen › Rasterlijnen still turns the column lines off) in `e2e/step-3d.spec.ts` (5). All green. | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/sites-kolomlijnen-donker.png · light: shakeout/sites-kolomlijnen-licht.png · panel lines: shakeout/sites-panel-lines-dark.png, shakeout/sites-panel-lines-light.png · 125%: shakeout/rijlijnen-125.png · Rasterlijnen: shakeout/looks-gridlines.png · Test: e2e/studio.spec.ts "row-lines-at-125 @e2e", "table-lines-in-both-themes @e2e"; e2e/step-3d.spec.ts "looks-gridlines @e2e" |
| 14 | Re-drive, `e2e/drawer-actions.spec.ts` on the selection fixture, 9 green. Ann's drawer at 1280 shows Start, Park, Settle and Sweep, then ⋯ Meer, on one line. Undo after close, the live drawer and the action's result drawer all work. | browser | pass | Browser: http://127.0.0.1:5177/#view=1 · shakeout/drawer-buttons.png · Test: e2e/drawer-actions.spec.ts, its 9 `@e2e` tests |
| 15 | Re-drive, the inputs panel: `e2e/action-inputs.spec.ts`, 6 green. inputs-panel-under-the-row opens Tourstop verschuiven under the row with focus in Dagen, and Escape returns to the action's button. Also keys-in-the-inputs-panel-stay-there, escape-after-the-picker, focused-input-shows-its-mark, shift-tourstop and shift-refused-in-dutch. | browser | pass | Browser: http://127.0.0.1:5174/#view=10 · shakeout/invoerpaneel-licht.png · dark: shakeout/invoerpaneel-donker.png · Test: e2e/action-inputs.spec.ts "inputs-panel-under-the-row @e2e" and its 5 other tests |
| 16 | Re-drive, `e2e/grid-ux.spec.ts`, 13 green (its helpers learned the row on this branch); dark-and-density among them. | browser | pass | Browser: http://127.0.0.1:5174/#view=1 · shakeout/looks-gridlines.png · Test: e2e/grid-ux.spec.ts, its 13 `@e2e` tests |
| 17 | Smoke (new): without a session, the studio grid answers 200 with the Aanmelden form and no error text. Its stylesheets carry `.nv-dw-actions__row`, `.nv-grid__foot` and the end space `tbody::after`. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/smoke-actierij.png · Test: e2e/smoke/action-row.spec.ts "action row: the grid serves the drawer’s action row and the table’s pinned totals before sign-in @smoke" |
| 18 | Smoke (new): GET /api/rows/site on 4313 without a session answers 401 `unauthenticated`, so no address is served to a visitor. | wire | pass | Test: e2e/smoke/action-row.spec.ts "action row: a site’s address is not served to a visitor without a session @smoke" |
| 19 | Smoke, re-driven: the 12 other sessionless checks, all green. They cover studio's sign-in and schema, studio-polish's row-line token, views-and-actions' dock, selection, drawer-actions, step-2 and grid-ux. | browser | pass | Browser: http://127.0.0.1:5176/ · shakeout/smoke-rijlijn-token.png · dock: shakeout/smoke-aanmelden.png · Test: e2e/smoke/, every `@smoke` test |

Hunt: 5 charters · 2 confirmed · 0 not ours · 6 rejected

The hunt ran once, at f424eb4, in the harness's Chromium on the same fresh instances. It ran from a scratch spec under the gitignored `e2e/.tmp`, which is now deleted. It took about 115 browser actions. Each confirmed finding then went RED on its own `expect` in a committed test (rows 7 and 8), never on a timeout. Both surfaces render through `apps/grid/src/ui/app.css`, which is in this branch's diff, so both are ours.

Charter 1, odd input, the action row at several drawer widths and by keyboard, about 25 actions. Covered: a site's four actions at 1440, 1280 and 1024, each at 392 px and widened; a live resize from 1440 to 800 and back with the drawer widened; the selection fixture's four actions plus Meer; an opdracht with one quiet action (Annuleren) and with two (Bevestigen, Annuleren); Tab, Shift+Tab, Enter, Home, End and Escape through the row and Meer. The fold always matched the room, and focus always came back to Meer. No bug.

Charter 2, state after a step, a record with no actions then one with, about 20 actions. A cancelled Gezondheidscheck has no row. ↓ to the prepared "Bijwerken · 2 sites" shows Bevestigen and Annuleren, and widening and narrowing keep one line. ↑ back shows no row, and ↓ again brings the row back widened. Sites without the registry filter, oud-archief to testmans-bestel and back, then widened: all four show. A task's drawer has no row. No bug.

Charter 3, first-time visitor, the pinned totals, about 20 actions. Checked: a search with no hits, the one-row and two-row seeded views, grouped by Gezondheid, and a 430 px-high window. The totals end at the pane's bottom in each, and the empty state reads "Geen rijen voor deze zoekterm of filters". No bug.

Charter 4, numbers and copy, the pills in every choice column of Sites, Opdrachten, Taken, Projecten, Features and Organisaties, light and dark, about 25 actions. Toned options are 13px pills; untoned ones are plain text (row 3). The Sites cell of Opdrachten led to confirmed bug 1. The hovered row in the drawer screenshots led to confirmed bug 2.

Charter 5, odd input, the open icon with odd and missing addresses, about 25 actions. As the worker, an empty address and one with a leading space are refused 400 `bad_url`, and so is a PATCH to an empty value. These were stored: a path with query and fragment, an upper-case scheme and host (the link reads lower case), a userinfo look-alike, plain http, a punycode host and a non-ASCII host (the link carries the punycode), and a path holding a quote and a script tag (the link carries it percent-encoded, and no markup is injected). Each shows the icon with that href. A null address shows none. Stepping from a site without an address to one with, and back, brings the icon and takes it away. No bug.

rejected: in the drawer's fields the Status pill is 12px beside 13.5px values. R2's one size is the table's ("the table only"), and the drawer's field pill keeps the pill's own 12px, which this branch did not change. bc90937 made them take the text size all the same.

rejected: `https://bank.test@kwaad.test` is accepted and offered as a link. This is the review's N13, deferred because only the service writes `adres` (threat model, attack 2).

rejected: the worker cannot clear an address to an empty value (400 `bad_url`). This is the review's N2, deferred; null clears it.

rejected: an empty dataset (Onderhoudslog, 0 rows) shows "Geen rijen" with no table and so no totals. That is the empty state from before this branch; R3 is about a table's end.

rejected: a site's drawer head has no ⋮, so the icon is not "next to ⋮" (R7). R6 puts only Link kopiëren, Nieuwe link and Verwijderen there, and a site has none of the three.

rejected: removing Sites' "In registry is Ja" chip as the administrator saved the seeded view for everyone. That is views-and-actions' R8 ruling; every run starts fresh.

## For Stefan to confirm

- The drawer's field pills now take the fields' text size (bc90937); see shakeout/opdracht-rij-licht.png.
- Seen, not pursued and not counted: with focus on a button in the action row, ↓ does not step to the next record (it does from the head). It has gone to the reviewer and is left as it is.

## Notes for the fix pass

- Done at bc90937. Rows 7 and 8 are green and re-driven; nothing is owed.

## The registry

`specs/CHECKS.md`:
- **Added**, with first feature action-row: 6 e2e rows and 2 smoke rows. The e2e rows are totals-clear-of-the-panel, totals-pinned-on-a-short-table, one-size-in-a-row, open-the-address and the two repro rows. The two repro rows read "RED at f424eb4 2026-10-25, owed by the fix pass" in `verified` until bc90937. They now read `bc90937 2026-10-25`. The smoke rows come from `e2e/smoke/action-row.spec.ts`.
- **Updated, not duplicated:** site-actions-in-the-row (action-row's own row, `verified` was "-") and confirm-from-the-row (first feature views-and-actions, kept).
- **Bumped to bc90937 2026-10-25:** the 9 rows re-driven after the fix pass. These are the two repros, drawer-reads-right, confirm-from-the-row, site-actions-in-the-row, open-the-address and the three table-look flows.
- **Bumped to f424eb4 2026-10-25:** 109 rows, every row whose test is `studio`, `table-look`, `selection`, `drawer-actions`, `action-inputs`, `grid-ux`, `step-3d` or `e2e/smoke/`. Each was green again here.

`bun run check` exits 0 ("check-checks: every registered check runs a test").

## Bite check

By reading the assertions. No product line was hand-broken.

- A `javascript:` or `data:` address never becomes a link (attack 1): `href.test.ts` and `OpenLink.test.tsx` hold the wire and the render. Row 6 fails if the head's href is anything but the seeded https address.
- A person cannot write the address (attack 2): row 6 fails if either PATCH is not 403 `service_only`, or if the address changed; `adres.test.ts` holds the same at the wire.
- Reverse tab-nabbing (attack 3): row 6 asserts `rel="noopener noreferrer"` and `target="_blank"` on the live link.
- Bevestigen visible without a menu (Review Focus 3): row 4 fails if it is not a filled button under Sites, if any menu is open, or if the head holds it.
- The totals never cover a row (Review Focus 4): rows 1 and 2 pin the foot at the pane's bottom. Row 1 and tall-dock-leaves-the-last-row (row 12) fail if the last row ends under the panel or the dock.
- No action lost in the move (Review Focus 5): row 5's `offered()` must equal all four site actions, in order, at both widths.
- One line at 392 px and widened (Review Focus 6): row 5 checks the middles of the row's children within 3 px, and no overflow in the row or the body.
- R2's one size: row 3 fails on any second font size or face in a row, or a row that is not 32 px.
- R1's quieter lines: table-lines-in-both-themes (row 13) pins the column line's exact colour in dark and light (the row-line token at 60%), so a revert to louder lines fails it.
