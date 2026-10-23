# Checks registry

What the shake-outs left to re-run on a running instance. This repo has no Makefile, staging or
production: the runner is Playwright through the repo's own harness, which starts a fresh
invented instance (`playwright.config.ts`). `e2e` rows write and run only on that fresh instance:
`bunx playwright test --grep @e2e`. `smoke` rows are read-only and sessionless:
`bunx playwright test --grep @smoke`. Each row's entry narrows to its own title. MCP server rows run
with `bun test` instead, on an invented instance the test starts itself (the smoke row needs none).

| surface | tier | entry | test | first feature | verified |
|---|---|---|---|---|---|
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-template @e2e"` | e2e/step-1.spec.ts | step-1 | ff90908 2026-10-18 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-editor-rate-refused @e2e"` | e2e/step-1.spec.ts | step-1 | ff90908 2026-10-18 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-admin-rate @e2e"` | e2e/step-1.spec.ts | step-1 | ff90908 2026-10-18 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-double-submit @e2e"` | e2e/step-1.spec.ts | step-1 | ff90908 2026-10-18 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | ff90908 2026-10-18 |
| Dagplanning · redo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-redo-refused @e2e"` | e2e/step-1.spec.ts | step-1 | ff90908 2026-10-18 |
| Theme · density | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dark-and-density @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Production switcher | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "switch-production @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Owner · geen productiekiezer, geen query, geen dashboard | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "owner-has-no-switcher @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Fiche grid (no space, no facts) | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fiche-renders-as-before @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Rail tree | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "tree-fold-and-hover @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Rail tree | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "tree-scrolls-in-rail @e2e"` | e2e/rail-tree.spec.ts | grid-ux | ff90908 2026-10-18 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "create-team-and-personal-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "new-view-blank-and-double-submit @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| View menu | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "copy-rename-delete-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| View mark · colleague | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "colleague-shared-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "the-open-models-menu-exports @e2e"` | e2e/model-menu.spec.ts | grid-ux | ff90908 2026-10-18 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "rename-and-icon-a-model @e2e"` | e2e/model-menu.spec.ts | grid-ux | ff90908 2026-10-18 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-at-1280 @e2e"` | e2e/title-line.spec.ts | grid-ux | ff90908 2026-10-18 |
| Title line · met een open lade op 1280 leest de naam heel en blijft de periode staan | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-with-a-drawer-open"` | e2e/title-line.spec.ts | fix/title-line-at-1280 | ff90908 2026-10-18 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fold-day-band @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Dagplanning · inherited venue | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "inherited-venue @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Planning · details | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "planning-details @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Sign-in page (lang, Plex, meta, tokens, own colours, button) | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "the sign-in page is Dutch, Plex, unindexed and in its own colours @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | ff90908 2026-10-18 |
| Periode (Plandag-voorwaarde), volgende week | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-is-the-period @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-empty-result @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-tags @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-colours-and-overflow @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-box-fits-at-1280 @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-list-opens-up-to-its-size @e2e"` | e2e/dagplanning.spec.ts | virtual-columns | ff90908 2026-10-18 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-double-pick @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "new-row-people @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-by-keyboard @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ff90908 2026-10-18 |
| View · saves itself | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "autosave-own-view @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-builder @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Filter builder · yes/no | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-yes-no @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-or @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-link @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "link-to-a-view-not-yours @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-undo-own @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-other-has-no-undo @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Exporteren / delen | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "menu share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Exporteren / delen · Publiceren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "publish-from-share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Published view | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "published-view-stays-put @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Scrollbars | e2e | `bunx playwright test e2e/scrollbars.spec.ts --grep "minimal-scrollbars @e2e"` | e2e/scrollbars.spec.ts | grid-toolbar | ff90908 2026-10-18 |
| Focus · licht en donker: de cel van de grid, een filterchip, een bordkaart die het toetsenbord versleept, de knop Sluiten van de lade en het veld van een dialoog dragen één dunne lijn in de tekstkleur, zonder blauwe ring | e2e | `bunx playwright test e2e/focus-mark.spec.ts --grep "focus-mark"` | e2e/focus-mark.spec.ts | focus-ring | ff90908 2026-10-18 |
| Date cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-date-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Datetime cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-datetime-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Date and datetime calendar | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "calendar-clears-its-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Select cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-select-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| To-one picker | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-relation-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| To-many editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "add-and-remove-link @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| To-one open-panel icon | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| To-one open-panel icon · keyboard | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record-by-keyboard @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Matrix note | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-long-text @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Bool switch | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "toggle-bool @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Rail views list · order | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "reorder-views @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Theme · popovers, menus and dialogs | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "chrome-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "share-dialog-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Filter builder · own view | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "own-view-keeps-a-new-condition @e2e"` | e2e/react-aria.spec.ts | react-aria | ff90908 2026-10-18 |
| Select and to-one picker · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "select-and-picker-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | ff90908 2026-10-18 |
| Production switcher · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "space-switcher-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | ff90908 2026-10-18 |
| To-many editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "chips-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | ff90908 2026-10-18 |
| Date and datetime editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "date-editors-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | ff90908 2026-10-18 |
| Filter builder · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "filter-row-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | ff90908 2026-10-18 |
| Drawer picker · frame | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "drawer-picker-keeps-its-frame @e2e"` | e2e/ui-fit.spec.ts | react-aria | ff90908 2026-10-18 |
| Speelreeks · Sjabloon met plaatsen → matrix Open | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "apply-template-with-slots @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Matrix · Open-kolom | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "open-counts @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Matrix · open plek invullen | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "fill-splits-slot-and-undo @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Matrix · uitnodiging (outbox) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "invite-in-outbox @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| #/act · bevestigen zonder aanmelden | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "confirm-without-login @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| POST /api/act · token A niet B | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "token-a-not-b @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| #/act · weigeren → Geweigerd | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "decline-shows-geweigerd @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Matrix · uitnodiging zonder e-mailadres | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "no-email-no-invite @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Toewijzingen · verboden overgang | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "disallowed-transition @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Toewijzingen · persoon wisselen → Voorlopig | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "swap-pencils-back-in @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Toewijzingen · een persoon op een open plek ×2: die rij krijgt de persoon met aantal 1, een nieuwe open rij houdt de andere plek; één ⌘Z zet de open ×2 terug | e2e | `bunx playwright test e2e/slot-split.spec.ts --grep "fill-open-slot-splits @e2e"` | e2e/slot-split.spec.ts | slot-split-on-edit | ff90908 2026-10-18 |
| Matrix · verouderde status (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "stale-state-409 @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Exporteren / delen · Voor eigenaars + #/link | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "link-shows-own-projects-only @e2e"` | e2e/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| GET /api/record-links/:dataset/:id | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "a record link is copied only with a session, never cached @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | ff90908 2026-10-18 |
| Time cell editor (no source serves a time column yet) | auth | — | | react-aria | |
| Long text cell editor (no source serves a textarea column yet) | auth | — | | react-aria | |
| Activiteiten · nieuwe weergave · Kolommen (Tourstop, Locatie, Mensen) | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "new-view-offers-locatie-and-mensen @e2e"` | e2e/step-2b.spec.ts | virtual-columns | ff90908 2026-10-18 |
| Planning · Locatie overschrijven en wissen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "override-and-clear-venue @e2e"` | e2e/step-2b.spec.ts | virtual-columns | ff90908 2026-10-18 |
| Activiteiten · Locatie filteren, sorteren, groeperen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "filter-sort-group-on-locatie @e2e"` | e2e/step-2b.spec.ts | virtual-columns | ff90908 2026-10-18 |
| Filter builder · is vandaag, kept after a reload | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "filter-is-vandaag-kept-after-reload @e2e"` | e2e/period-today.spec.ts | period-today | ff90908 2026-10-18 |
| Tourstop drawer · Tourstop verschuiven | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-tourstop @e2e"` | e2e/action-inputs.spec.ts | action-inputs | ff90908 2026-10-18 |
| Tourstop drawer · refusal under the action | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-refused-in-dutch @e2e"` | e2e/action-inputs.spec.ts | action-inputs | ff90908 2026-10-18 |
| Activiteit drawer · Bijlagen (upload, openen, verwijderen, ongedaan maken) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "upload-open-delete-undo @e2e"` | e2e/attachments.spec.ts | attachments | ff90908 2026-10-18 |
| Activiteit drawer · Bijlagen · weigeringen (type, grootte) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "refusals-in-dutch @e2e"` | e2e/attachments.spec.ts | attachments | ff90908 2026-10-18 |
| Tourstop en Toewijzing drawer · Bijlagen; Organisatie zonder | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "bijlagen-on-tourstop-and-assignment @e2e"` | e2e/attachments.spec.ts | attachments | ff90908 2026-10-18 |
| Matrix · kandidaten in Open plek invullen | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "candidates-picker @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Conflicten · zes types | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "conflicten-six-types @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Per persoon per dag · badge; Afwezigheden · Soort | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "badge-clears @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Matrix · alleen afwezig is weg | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "away-only-afwezig @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Persoonskalender | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "person-calendar @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Persoonskalender · nacht, punt, venster | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "calendar-edges @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Persoonskalender · activiteit zonder einde | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "point-event-shows-its-name @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Bedrijfsweek · week, maand, drawer | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "company-week @e2e"` | e2e/step-3.spec.ts | step-3 | ff90908 2026-10-18 |
| Dashboard · landing | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "dashboard-landing @e2e"` | e2e/step-3c.spec.ts | step-3c | b08381e 2026-10-23 |
| Dashboard · Conflicten rood dan neutraal | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "stat-red-then-neutral @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · getal opent zijn view | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "stat-opens-view @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · weekstrook opent activiteit | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "week-opens-activity @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · Werklijst Gedaan | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "werklijst-set @e2e"` | e2e/step-3c.spec.ts | step-3c | b08381e 2026-10-23 |
| Dashboard · Nieuwe taak | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "quick-create @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · productie kiezen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "space-narrows @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · productie kiezen, elke tegel | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "space-narrows-every-tile @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · Geen toegang | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "tile-no-access @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Dashboard · samenstellen, teamdashboard, verwijderen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "composer-team-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Bord, tijdlijn, galerij, kalender over dagen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "skins-open @e2e"` | e2e/step-3c.spec.ts | step-3c | ff90908 2026-10-18 |
| Bijstellen · Rasterlijnen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "looks-gridlines @e2e"` | e2e/step-3d.spec.ts | step-3d | ff90908 2026-10-18 |
| Lade · derde kolom | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "drawer-in-slot @e2e"` | e2e/step-3d.spec.ts | step-3d | ff90908 2026-10-18 |
| Kalender · Nieuwe activiteit, leesbaar | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "quick-create-calendar @e2e"` | e2e/step-3d.spec.ts | step-3d | ff90908 2026-10-18 |
| Nieuwe tijdlijn · deze maand, rijen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "new-timeline-defaults @e2e"` | e2e/step-3d.spec.ts | step-3d | ff90908 2026-10-18 |
| Tijdlijn · naar vandaag eenmaal per venster | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "timeline-scroll-holds @e2e"` | e2e/step-3d.spec.ts | step-3d | ff90908 2026-10-18 |
| Planning · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Planning @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Bord · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Per status @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Galerij · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Galerij activiteiten @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Kalender · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Kalender activiteiten @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Tijdlijn · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Tijdlijn tourstops @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Matrix · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Toewijzingen per activiteit @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Chiprij · geen periode zonder datum | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "a view whose table has no date shows no period control @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Groep, rijen en Kolommen · elke weergave, bord hergroepeert | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "groep-everywhere @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Bord · + in kolom, week zonder vandaag: Status niet gevraagd, de optie van de kolom meegestuurd | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-column-plus-in-window @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Lade · kop, N van M, velden, toetsen, breed | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "drawer-anatomy @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Matrix · cellade, Kiezen, ⌘Z, Afwezigheden | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "matrix-cell-drawer @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Galerij · secties, S M L | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "gallery-sections @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Dashboard · titelpil, bijgewerkt, geen Groep of periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "dashboard-title-pill @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Rail · aantallen | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "rail-counts @e2e"` | e2e/step-3e.spec.ts | step-3e | ff90908 2026-10-18 |
| Bord · drop tussen kaart 2 en 3, na herladen; elke kaart past in haar kolom; buiten het bord losgelaten: geannuleerd, niets geschreven | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-drop-between @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · ongerangschikte kolom, kaart 1 naar plaats 3 | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-reorder-fresh @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · gesorteerd naar handmatig, gewijzigd, terugzetten | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-to-manual @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · gesorteerd naar handmatig met oude rangen in twee kolommen: alleen de gesleepte kaart beweegt, na herladen; één ⌘Z zet de rangen terug | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-to-manual-stale-ranks @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · gesorteerd, andere kolom: tint, plaats op datum; ⌘Z op de pagina zet kaart en status terug | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-cross-column @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · plek steeds verder in een volle kolom | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-slot-steady @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · een vaste kolomkop dekt de kaarten die eronder scrollen, licht en donker | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-heads-cover-scrolled-cards"` | e2e/step-3f.spec.ts | fix/board-sticky-heads | ff90908 2026-10-18 |
| Bord · één ⌘Z, pagina en lade | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-undo-both @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · toetsen: spatie, pijlen, Escape; ← naar de linkerkolom schrijft haar optie | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-keyboard @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Bord · geweigerde drop, volle kolom, muis en toetsen; op een handmatig bord laat ze geen ongedaan-stap: één ⌘Z neemt de bewerking ervoor terug | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-drag-refused @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Lade · notities als eigen blok, schrijven, na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "notities-block @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Planning · dagkop toont bezetting have/need | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "group-filled @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Tijdlijn tourstops · baan en balk in de kleur van de productie, volgt na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "production-tone @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Per status · dubbel geboekt: beide kaarten Conflict, titelregel 2 Conflicten opent Conflicten in dezelfde ruimte; geannuleerd: merken en telling weg zonder herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-marks-and-insight @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| Lade van Planning en van het bord Per status · Iemand anders kiezen: zoeker op de gemarkeerde persoon in Mensen, kandidaten, band weg; één ⌘Z zet de eerste terug met band; opnieuw gekozen, na herladen de nieuwe zonder band; op het bord eerst Conflict in de band en bij de persoon, Negeren verbergt de band tot de lade opnieuw opent | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-choose-other @e2e"` | e2e/step-3f.spec.ts | step-3f | ff90908 2026-10-18 |
| MCP server (stdio) | e2e | `bun test packages/mcp/test/instance.test.ts -t "mcp-lists-rows"` | packages/mcp/test/instance.test.ts | studio-mcp | e22c2b5 2026-10-22 |
| MCP server (stdio) | smoke | `bun test packages/mcp/test/smoke.test.ts -t "mcp-boots"` | packages/mcp/test/smoke.test.ts | studio-mcp | e22c2b5 2026-10-22 |
| Selection · select and run | e2e | `bunx playwright test e2e/selection.spec.ts --grep "select-and-run @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · select all in view | e2e | `bunx playwright test e2e/selection.spec.ts --grep "select-all-in-view @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · run from drawer | e2e | `bunx playwright test e2e/selection.spec.ts --grep "run-from-drawer @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Link item opens its record | e2e | `bunx playwright test e2e/selection.spec.ts --grep "link-opens-record @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Rail tree · unlisted dataset | e2e | `bunx playwright test e2e/selection.spec.ts --grep "tree-hides-link-table @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| + Nieuw on a query that creates | e2e | `bunx playwright test e2e/selection.spec.ts --grep "add-from-query @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| + Nieuw on a query · refusals | e2e | `bunx playwright test e2e/selection.spec.ts --grep "add-from-query-refusals @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection bar · reserved strip | e2e | `bunx playwright test e2e/selection.spec.ts --grep "bar-reserves-its-strip @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · keyboard tab stops | e2e | `bunx playwright test e2e/selection.spec.ts --grep "tab-stops @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · row numbers beside the box | e2e | `bunx playwright test e2e/selection.spec.ts --grep "three-digit-numbers @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · clear and empty input | e2e | `bunx playwright test e2e/selection.spec.ts --grep "selection-clear-and-empty-input @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · double submit | e2e | `bunx playwright test e2e/selection.spec.ts --grep "double-submit-run @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · refusal mid-run | e2e | `bunx playwright test e2e/selection.spec.ts --grep "refused-run @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · stale id | e2e | `bunx playwright test e2e/selection.spec.ts --grep "stale-id-run @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Drawer · Escape | e2e | `bunx playwright test e2e/selection.spec.ts --grep "drawer-escape @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · checkbox column aligned | e2e | `bunx playwright test e2e/selection.spec.ts --grep "checkbox-column-aligned @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection surface · sign-in page without a session | smoke | `bunx playwright test e2e/smoke/selection.spec.ts --grep "selection surface: a table view without a session shows the sign-in page, no selection column @smoke"` | e2e/smoke/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection surface · GET /api/schema without a session | smoke | `bunx playwright test e2e/smoke/selection.spec.ts --grep "selection actions are not declared to a visitor without a session @smoke"` | e2e/smoke/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Selection · transport failures | e2e | `bunx playwright test e2e/selection.spec.ts --grep "transport-failures-run @e2e"` | e2e/selection.spec.ts | selection-actions | 12de8aa 2026-10-22 |
| Drawer · declared buttons, Undo | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "press-a-button @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Drawer · link item button and detail | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "link-item-button @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Action opens its result | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "action-opens-its-result @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Drawer · follows an outside change (busy mark) | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "drawer-follows-an-outside-change @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Dashboard · list row opens its drawer | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "dashboard-row-opens-drawer @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | b08381e 2026-10-23 |
| Drawer · closed while a poll is outstanding | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "live-drawer-closed-mid-poll @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Dashboard drawer · Undo after close | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "press-then-close-then-undo @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Related drawer · Undo after close | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "press-in-related-drawer-then-close-then-undo @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Action result · Undo closes its drawer | e2e | `bunx playwright test e2e/drawer-actions.spec.ts --grep "undo-closes-the-opened-record @e2e"` | e2e/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Drawer surface · dashboard sign-in page without a session | smoke | `bunx playwright test e2e/smoke/drawer-actions.spec.ts --grep "drawer surface: the dashboard without a session shows the sign-in page, no drawer @smoke"` | e2e/smoke/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Drawer surface · rows (marks) without a session | smoke | `bunx playwright test e2e/smoke/drawer-actions.spec.ts --grep "drawer buttons and their marks are not served to a visitor without a session @smoke"` | e2e/smoke/drawer-actions.spec.ts | drawer-actions | 12de8aa 2026-10-22 |
| Studio · Overzicht, vier vragen, ergste site eerst | e2e | `bunx playwright test e2e/studio.spec.ts --grep "dashboard-opens-on-monday-questions @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Overzicht per klant | e2e | `bunx playwright test e2e/studio.spec.ts --grep "space-narrows-dashboard @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Sites, selectie en Gezondheid checken | e2e | `bunx playwright test e2e/studio.spec.ts --grep "request-health-check-for-selected-sites @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Sites, enkel sites buiten de registry | e2e | `bunx playwright test e2e/studio.spec.ts --grep "request-only-retired-sites-refused @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · actie uit de lade van een site | e2e | `bunx playwright test e2e/studio.spec.ts --grep "request-from-a-site-drawer @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · opdracht, preview per site | e2e | `bunx playwright test e2e/studio.spec.ts --grep "preview-opens-from-request @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · opdracht, Niet nu en Toch wel | e2e | `bunx playwright test e2e/studio.spec.ts --grep "drop-site-before-confirm @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Bevestigen vanuit Overzicht | e2e | `bunx playwright test e2e/studio.spec.ts --grep "confirm-update-from-dashboard @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Bevestigen, verlopen preview | e2e | `bunx playwright test e2e/studio.spec.ts --grep "confirm-refused-on-an-expired-preview @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Bevestigen, verzoek valt weg | e2e | `bunx playwright test e2e/studio.spec.ts --grep "confirm-survives-a-dropped-request @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · een service bevestigt nooit (wire) | e2e | `bunx playwright test e2e/studio.spec.ts --grep "service-cannot-confirm @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · een redacteur bevestigt nooit | e2e | `bunx playwright test e2e/studio.spec.ts --grep "editor-cannot-confirm @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Sites per gezondheid en Sites in beeld | e2e | `bunx playwright test e2e/studio.spec.ts --grep "sites-board-and-gallery @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Agenda, nieuw agendapunt en geplande opdracht | e2e | `bunx playwright test e2e/studio.spec.ts --grep "add-to-the-agenda @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Op tafel en Gedaan | e2e | `bunx playwright test e2e/studio.spec.ts --grep "op-tafel @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Opdrachten per status, slepen naar een stap van de worker | e2e | `bunx playwright test e2e/studio.spec.ts --grep "person-cannot-take-worker-steps @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · opdracht, sitelijnen na Bevestigen of Annuleren | e2e | `bunx playwright test e2e/studio.spec.ts --grep "decided-request-lines @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Op tafel, Nieuwe taak | e2e | `bunx playwright test e2e/studio.spec.ts --grep "op-tafel-offers-new-task @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Overzicht, recente dag niet te laat | e2e | `bunx playwright test e2e/studio.spec.ts --grep "recent-moment-not-late @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · opdracht, Verwijderen zegt Annuleren | e2e | `bunx playwright test e2e/studio.spec.ts --grep "delete-a-request-explains @e2e"` | e2e/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio · Overzicht, Vandaag met open lade op 1280 | e2e | `bunx playwright test e2e/studio.spec.ts --grep "today-keeps-its-titles @e2e"` | e2e/studio.spec.ts | studio-domain | RED at b08381e 2026-10-23 |
| Studio surface · sign-in page without a session | smoke | `bunx playwright test e2e/smoke/studio.spec.ts --grep "studio surface: the grid without a session shows the Dutch sign-in page, no dashboard @smoke"` | e2e/smoke/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
| Studio surface · GET /api/schema without a session | smoke | `bunx playwright test e2e/smoke/studio.spec.ts --grep "studio schema asks a visitor without a session to sign in @smoke"` | e2e/smoke/studio.spec.ts | studio-domain | b08381e 2026-10-23 |
