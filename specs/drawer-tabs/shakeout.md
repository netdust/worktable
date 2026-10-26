# Shake-out: drawer-tabs

Driven on 46634c7 (branch feature/drawer-tabs), 2026-10-26, on the repo harness's fresh invented instances: studio
(grid on 127.0.0.1:5176, engine on :4313) signed in as the seeded administrator, and theatre (grid on :5174, engine
on :4311) signed in as the seeded administrator. Flows from the plan's Test map, E2E flows column:
drawer-opens-on-fields, notes-in-their-tab, more-menu-holds-the-rest, drawer-tabs-at-1280. Each was driven in light
and dark (Bijstellen, Thema), the theme put back to Licht in a finally. Edges added to those tests: two icons at
392 px beside the address and Inloggen and three widened, the title keeping 96 px; j and k back to an earlier record
open on Gegevens; a pane chosen from … marks … with data-current; Escape in … closes only the menu; a note still
being typed is saved when the tab changes. Three more flows drive the keyboard, a theatre drawer and a drawer with
only fields.

Re-driven, registered surfaces the diff touches, all green on 46634c7 and their verified cells bumped in
specs/CHECKS.md: step-3e drawer-anatomy and matrix-cell-drawer, step-3f notities-block, attachments
upload-open-delete-undo, refusals-in-dutch and bijlagen-on-tourstop-and-assignment, drawer-actions link-item-button
and press-in-related-drawer-then-close-then-undo, selection link-opens-record, step-2 fill-splits-slot-and-undo and
invite-in-outbox, and step-3 candidates-picker (the last three for the picker's new label). The whole of
e2e/studio.spec.ts, e2e/drawer-tabs.spec.ts and e2e/smoke ran green afterwards: 82 passed.

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | drawer-opens-on-fields: a site drawer opens on Gegevens with its fields and action row; title and tabs on one head line, no "N van M" and no dataset label; no Notities or Geschiedenis in the body; at 392 px with the address and Inloggen two icons plus …, the title at least 96 px; Volledig openen gives three icons, still on Gegevens (edges: boundary of the icon count, empty pane absent) | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/drawer-tabs-gegevens-licht.png · also shakeout/drawer-tabs-gegevens-donker.png, shakeout/drawer-tabs-breed-licht.png, shakeout/drawer-tabs-breed-donker.png · test e2e/studio.spec.ts "drawer-opens-on-fields @e2e" |
| 2 | notes-in-their-tab: the Notities icon shows the long texts (Notities, Beheerders) and no fields, the title stays; a note typed and left unsaved is written when the person clicks Gegevens, and reads back in Notities; the note is put back in a finally (edges: mid-flow failure, the pane unmounting under an edit) | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/drawer-tabs-notities-licht.png · also shakeout/drawer-tabs-notities-donker.png · test e2e/studio.spec.ts "notes-in-their-tab @e2e" |
| 3 | more-menu-holds-the-rest: … lists Onderhoudslog, Taken, Geschiedenis, Bijlagen; Escape closes only the menu; Geschiedenis chosen shows its region, marks … with data-current and leaves no icon checked; Vorige opens the other record on Gegevens with … unmarked; j back to the first record opens on Gegevens, not Geschiedenis; Notities, then k and j, opens on Gegevens again (edges: re-entry, review S1) | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/drawer-tabs-meer-licht.png · also shakeout/drawer-tabs-meer-donker.png, shakeout/drawer-tabs-geschiedenis-licht.png, shakeout/drawer-tabs-geschiedenis-donker.png · test e2e/studio.spec.ts "more-menu-holds-the-rest @e2e" |
| 4 | drawer-tabs-at-1280: at 1280 by 720 with testmans-winkel open the head is one row under 60 px, the bar and Sluiten fully in view, neither the drawer nor its head scrolls sideways, light and dark (edge: boundary) | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/drawer-tabs-1280-licht.png · also shakeout/drawer-tabs-1280-donker.png · test e2e/studio.spec.ts "drawer-tabs-at-1280 @e2e" |
| 5 | drawer-tabs-by-keyboard: Tab from Volgende lands on the open pane's icon; ArrowRight moves focus without choosing; Enter chooses Notities, ArrowLeft and Space choose Gegevens; arrows reach …, Enter opens it, ArrowDown and Enter choose a pane, focus comes back on … marked current; Shift+Tab from widen enters the bar on …, a second leaves it; the bar is one tab stop | browser | pass | Browser: http://127.0.0.1:5176/#view=1 · shakeout/drawer-tabs-toetsenbord.png · test e2e/studio.spec.ts "drawer-tabs-by-keyboard @e2e" |
| 6 | theatre-drawer-tabs: a person's drawer in the other domain has the same kinds of tabs, icons only: Gegevens, Beschikbaarheden, Taken, with Geschiedenis under …; Beschikbaarheden shows its rows and no fields; j opens the next person on Gegevens; Geschiedenis then k back to the first person opens on Gegevens (edges: re-entry, other domain) | browser | pass | Browser: http://127.0.0.1:5174/#view=4 · shakeout/drawer-tabs-theatre-persoon-licht.png · also shakeout/drawer-tabs-theatre-persoon-donker.png · test e2e/drawer-tabs.spec.ts "theatre-drawer-tabs @e2e" |
| 7 | theatre-only-fields-no-bar: a voorstelling's drawer has only fields; its fields show, and the head has no Onderdelen bar, no icon and no … (edge: empty) | browser | pass | Browser: http://127.0.0.1:5174/#view=7 · shakeout/drawer-tabs-theatre-alleen-velden-licht.png · also shakeout/drawer-tabs-theatre-alleen-velden-donker.png · test e2e/drawer-tabs.spec.ts "theatre-only-fields-no-bar @e2e" |
| 8 | without a session: the grid answers 200 with the sign-in form and serves the tab bar's rules (group, selected icon, … marked current) and no rule for the old position text; a record's history, which the Geschiedenis tab reads, answers 401 unauthenticated with no entries | wire | pass | test e2e/smoke/drawer-tabs.spec.ts (both @smoke), 2 passed; shakeout/smoke-tabbladen.png |

Hunt: 5 charters · 0 confirmed · 1 not ours · 5 rejected
Charter 1, numbers and copy, the head line of every studio site drawer at 392 px and widened, at viewports from 1440 down to 800, with an invented 100-character name and a one-letter name: two icons with address and Inloggen, three without Inloggen or widened, never more than three, the title at 96 px or more, one head row, no sideways scroll, the count stable over ten samples; tooltips and the … menu in Dutch.
Charter 2, state after reload and re-entry, a pane from … then widen and narrow, close and reopen, reload, and the dashboard drawer moving across a feature, an agenda item and back: the chosen pane becomes a checked icon when widened and goes back under … marked when narrowed; reopening, reloading and changing record all open on Gegevens.
Charter 3, keyboard only, in the site drawer and from inside the … menu: arrows, Enter and Space choose; Escape in the menu closes the menu only; k pressed with focus on … steps the record and lands it on Gegevens.
Charter 4, odd input, a note typed and not saved when the tab is clicked away or Vorige is pressed: both writes reach the server.
Charter 5, error paths and the other domain, every theatre and studio model's first drawer, watching the console: theatre Personen, Tourstops, Organisaties and Toewijzingen carry the same tab kinds; Voorstellingen shows no bar. The Opdrachten table logs a console error, below.
not ours: opening the Opdrachten table logs a React error. Steps: sign in to the studio harness as the administrator, open Opdrachten under Logboek, view Opdrachten; the console reports "[Table] Column with id 'id' does not exist." once, before any drawer opens. A scratch Playwright check asserting no console error on that view went RED on its assertion. It renders through the table view, which this diff changes only in comments and CSS.
rejected: a person's Beschikbaarheden pane read empty right after it was chosen; its rows load a moment later (async read), and an empty list says Geen beschikbaarheden.
rejected: j on voorbeeld-site did nothing; it is the last row of the Sites view.
rejected: Shift+Tab from widen skips the tab icons and lands on …; the bar is one tab stop (react-aria Toolbar, the toolbar pattern) and the arrows reach every icon.
rejected: the dashboard's agenda item drawer shows no tab bar; Agenda is a query, so it has no history and only read-only fields, the same sections as before this feature.
rejected: testmans-winkel's title is cut at 392 px (114 of 122 px); Stefan's ruling keeps the title at 96 px and gives the icons the rest.
Spent about 110 browser actions over the five charters.
