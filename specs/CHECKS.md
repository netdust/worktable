# Checks registry

What the shake-outs left to re-run on a running instance. This repo has no Makefile, staging or
production: the runner is Playwright through the repo's own harness, which starts a fresh
invented instance (`playwright.config.ts`). `e2e` rows write and run only on that fresh instance:
`bunx playwright test --grep @e2e`. `smoke` rows are read-only and sessionless:
`bunx playwright test --grep @smoke`. Each row's entry narrows to its own title.

| surface | tier | entry | test | first feature | verified |
|---|---|---|---|---|---|
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-template @e2e"` | e2e/step-1.spec.ts | step-1 | 1e3309c 2026-10-16 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-editor-rate-refused @e2e"` | e2e/step-1.spec.ts | step-1 | 1e3309c 2026-10-16 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-admin-rate @e2e"` | e2e/step-1.spec.ts | step-1 | 1e3309c 2026-10-16 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-double-submit @e2e"` | e2e/step-1.spec.ts | step-1 | 1e3309c 2026-10-16 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | 1e3309c 2026-10-16 |
| Dagplanning · redo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-redo-refused @e2e"` | e2e/step-1.spec.ts | step-1 | 1e3309c 2026-10-16 |
| Theme · density | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dark-and-density @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Production switcher | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "switch-production @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Production switcher · owner | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "owner-has-no-switcher @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Fiche grid (no space, no facts) | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fiche-renders-as-before @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Rail tree | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "tree-fold-and-hover @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Rail tree | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "tree-scrolls-in-rail @e2e"` | e2e/rail-tree.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "create-team-and-personal-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "new-view-blank-and-double-submit @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| View menu | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "copy-rename-delete-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| View mark · colleague | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "colleague-shared-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "the-open-models-menu-exports @e2e"` | e2e/model-menu.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "rename-and-icon-a-model @e2e"` | e2e/model-menu.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-reads-in-full @e2e"` | e2e/title-line.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-at-1280 @e2e"` | e2e/title-line.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Title line · met een open lade op 1280 leest de naam heel en blijft de periode staan | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-with-a-drawer-open"` | e2e/title-line.spec.ts | fix/title-line-at-1280 | 072eb10 2026-10-16 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fold-day-band @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "band-facts @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut-bar-and-foot @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Dagplanning · inherited venue | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "inherited-venue @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Planning · details | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "planning-details @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Sign-in page (lang, Plex, meta, tokens, own colours, button) | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "the sign-in page is Dutch, Plex, unindexed and in its own colours @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | 85024bc 2026-10-17 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 1e3309c 2026-10-16 |
| Rail tree · Tourstops | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "tourstop-first-in-planning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-is-the-period @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-empty-result @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-tags @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-colours-and-overflow @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-box-fits-at-1280 @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-list-opens-up-to-its-size @e2e"` | e2e/dagplanning.spec.ts | virtual-columns | 1e3309c 2026-10-16 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-double-pick @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "new-row-people @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-by-keyboard @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-enter-on-annuleren @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-tab-to-verwijderen @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-buttons-styled @e2e"` | e2e/dagplanning.spec.ts | dagplanning | 1e3309c 2026-10-16 |
| View · saves itself | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "autosave-own-view @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-builder @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "builder-fits-at-1280 @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Filter builder · yes/no | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-yes-no @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-or @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "or-with-period-narrows @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-link @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "link-to-a-view-not-yours @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-undo-own @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-other-has-no-undo @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Exporteren / delen | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "menu share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Exporteren / delen · Publiceren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "publish-from-share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Published view | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "published-view-stays-put @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Scrollbars | e2e | `bunx playwright test e2e/scrollbars.spec.ts --grep "minimal-scrollbars @e2e"` | e2e/scrollbars.spec.ts | grid-toolbar | 1e3309c 2026-10-16 |
| Focus · licht en donker: de cel van de grid, een filterchip, een bordkaart die het toetsenbord versleept, de knop Sluiten van de lade en het veld van een dialoog dragen één dunne lijn in de tekstkleur, zonder blauwe ring | e2e | `bunx playwright test e2e/focus-mark.spec.ts --grep "focus-mark"` | e2e/focus-mark.spec.ts | focus-ring | a9d407f 2026-10-17 |
| Date cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-date-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Datetime cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-datetime-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Date and datetime calendar | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "calendar-clears-its-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Select cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-select-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Select cell editor · not nullable | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "not-nullable-select-offers-no-leeg @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| To-one picker | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-relation-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| To-many editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "add-and-remove-link @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| To-one open-panel icon | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| To-one open-panel icon · keyboard | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record-by-keyboard @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Matrix note | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-long-text @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Bool switch | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "toggle-bool @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Rail views list · order | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "reorder-views @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Theme · popovers, menus and dialogs | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "chrome-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "share-dialog-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "publish-address-reads-in-full @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Filter builder · own view | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "own-view-keeps-a-new-condition @e2e"` | e2e/react-aria.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Select and to-one picker · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "select-and-picker-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Production switcher · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "space-switcher-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | 1e3309c 2026-10-16 |
| To-many editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "chips-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Date and datetime editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "date-editors-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Filter builder · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "filter-row-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Drawer picker · frame | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "drawer-picker-keeps-its-frame @e2e"` | e2e/ui-fit.spec.ts | react-aria | 1e3309c 2026-10-16 |
| Speelreeks · Sjabloon met plaatsen → matrix Open | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "apply-template-with-slots @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Matrix · Open-kolom | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "open-counts @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Matrix · open plek invullen | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "fill-splits-slot-and-undo @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Matrix · uitnodiging (outbox) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "invite-in-outbox @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| #/act · bevestigen zonder aanmelden | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "confirm-without-login @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| POST /api/act · token A niet B | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "token-a-not-b @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| #/act · weigeren → Geweigerd | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "decline-shows-geweigerd @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Matrix · uitnodiging zonder e-mailadres | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "no-email-no-invite @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Toewijzingen · verboden overgang | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "disallowed-transition @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Toewijzingen · persoon wisselen → Voorlopig | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "swap-pencils-back-in @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Toewijzingen · een persoon op een open plek ×2: die rij krijgt de persoon met aantal 1, een nieuwe open rij houdt de andere plek; één ⌘Z zet de open ×2 terug | e2e | `bunx playwright test e2e/slot-split.spec.ts --grep "fill-open-slot-splits @e2e"` | e2e/slot-split.spec.ts | slot-split-on-edit | 3709837 2026-10-17 |
| Matrix · verouderde status (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "stale-state-409 @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| PATCH /api/rows/toewijzing · race (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "planner-and-person-race-409 @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Exporteren / delen · Voor eigenaars + #/link | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "link-shows-own-projects-only @e2e"` | e2e/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| GET /api/record-links/:dataset/:id | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "a record link is copied only with a session, never cached @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | 1e3309c 2026-10-16 |
| Time cell editor (no source serves a time column yet) | auth | — | | react-aria | |
| Long text cell editor (no source serves a textarea column yet) | auth | — | | react-aria | |
| Activiteiten · nieuwe weergave · Kolommen (Tourstop, Locatie, Mensen) | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "new-view-offers-locatie-and-mensen @e2e"` | e2e/step-2b.spec.ts | virtual-columns | 1e3309c 2026-10-16 |
| Planning · Locatie overschrijven en wissen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "override-and-clear-venue @e2e"` | e2e/step-2b.spec.ts | virtual-columns | 1e3309c 2026-10-16 |
| Activiteiten · Locatie filteren, sorteren, groeperen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "filter-sort-group-on-locatie @e2e"` | e2e/step-2b.spec.ts | virtual-columns | 1e3309c 2026-10-16 |
| Filter builder · is vandaag | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "filter-is-vandaag @e2e"` | e2e/period-today.spec.ts | period-today | 1e3309c 2026-10-16 |
| Own view · is vandaag after a reload | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "vandaag-kept-after-reload @e2e"` | e2e/period-today.spec.ts | period-today | 1e3309c 2026-10-16 |
| Tourstop drawer · Tourstop verschuiven | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-tourstop @e2e"` | e2e/action-inputs.spec.ts | action-inputs | 1e3309c 2026-10-16 |
| Tourstop drawer · refusal under the action | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-refused-in-dutch @e2e"` | e2e/action-inputs.spec.ts | action-inputs | 1e3309c 2026-10-16 |
| Activiteit drawer · Bijlagen (upload, openen, verwijderen, ongedaan maken) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "upload-open-delete-undo @e2e"` | e2e/attachments.spec.ts | attachments | 1e3309c 2026-10-16 |
| Activiteit drawer · Bijlagen · weigeringen (type, grootte) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "refusals-in-dutch @e2e"` | e2e/attachments.spec.ts | attachments | 1e3309c 2026-10-16 |
| Tourstop en Toewijzing drawer · Bijlagen; Organisatie zonder | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "bijlagen-on-tourstop-and-assignment @e2e"` | e2e/attachments.spec.ts | attachments | 1e3309c 2026-10-16 |
| Matrix · kandidaten in Open plek invullen | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "candidates-picker @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Matrix · geen kandidaten, Iedereen tonen | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "candidates-none @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Conflicten · zes types | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "conflicten-six-types @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Conflicten · randen en per productie | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "conflicten-edges @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Per persoon per dag · badge; Afwezigheden · Soort | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "badge-clears @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Matrix · alleen afwezig is weg | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "away-only-afwezig @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| GET /api/rows/conflicten, kandidaten, persoon_dag, locatie_dag, werklijst · owner | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "owner-denied-queries @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Persoonskalender | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "person-calendar @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Persoonskalender · nacht, punt, venster | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "calendar-edges @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Persoonskalender · activiteit zonder einde (test.fail tot de fix) | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "point-event-shows-its-name @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Bedrijfsweek · week, maand, drawer | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "company-week @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Bedrijfsweek · maand die op zondag begint | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "month-starting-sunday @e2e"` | e2e/step-3.spec.ts | step-3 | 1e3309c 2026-10-16 |
| Dashboard · landing, licht en donker | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "dashboard-landing @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · Conflicten rood dan neutraal | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "stat-red-then-neutral @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · getal opent zijn view | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "stat-opens-view @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · weekstrook opent activiteit | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "week-opens-activity @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · Werklijst Gedaan | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "werklijst-set @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · Nieuwe taak | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "quick-create @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · Nieuwe activiteit | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "quick-create-activiteit @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · productie kiezen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "space-narrows @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · productie kiezen, elke tegel (test.fail tot de fix) | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "space-narrows-every-tile @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · lege productie | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "dashboard-empty-space @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · Geen toegang | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "tile-no-access @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Dashboard · samenstellen, teamdashboard, verwijderen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "composer-team-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| POST/PATCH /api/views dashboard shared · editor | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "editor-cannot-share-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| GET /api/views · owner, geen dashboard | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "owner-no-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Bord, tijdlijn, galerij, kalender over dagen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "skins-open @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| GET /api/attachments/activiteit?ids · 200 en 201 | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "gallery-batch-boundary @e2e"` | e2e/step-3c.spec.ts | step-3c | 1e3309c 2026-10-16 |
| Bijstellen · Rasterlijnen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "looks-gridlines @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Lade · derde kolom | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "drawer-in-slot @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Chiprij · elke weergave | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "one-chip-row @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Kalender · Groep (rijen) | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "calendar-lanes-in-groep @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Planning · periode stappen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "grid-period-steps @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Kalender · Nieuwe activiteit | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "quick-create-calendar @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Kalender · Nieuwe activiteit leesbaar (test.fail tot de fix) | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "quick-create-calendar-readable @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Persoonskalender, Bedrijfsweek · geen Nieuw | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "no-add-on-query-calendar @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Nieuwe tijdlijn · deze maand, rijen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "new-timeline-defaults @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Tijdlijn · Groep geen, één rij | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "unlaned-timeline-one-lane @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Tijdlijn · naar vandaag eenmaal per venster | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "timeline-scroll-holds @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Matrix · koppen en legende | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "matrix-heads-and-legend @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Galerij · initialen, met beeld | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "gallery-placeholder @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Titelregel · samenvatting per weergave | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "summary-per-view @e2e"` | e2e/step-3d.spec.ts | step-3d | 1e3309c 2026-10-16 |
| Planning · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Planning @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Bord · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Per status @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Galerij · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Galerij activiteiten @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Kalender · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Kalender activiteiten @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Tijdlijn · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Tijdlijn tourstops @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Matrix · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Toewijzingen per activiteit @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Chiprij · geen periode zonder datum | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "a view whose table has no date shows no period control @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Groep · elke weergave, bord hergroepeert | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "groep-everywhere @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Bord · slepen, muis en toetsen, ⌘Z | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-drag @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Bord · + in kolom | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-column-plus @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Bord · + in kolom, week zonder vandaag | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-column-plus-in-window @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Lade · kop, N van M, velden, toetsen, breed | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "drawer-anatomy @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Matrix · cellade, Kiezen, ⌘Z, Afwezigheden | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "matrix-cell-drawer @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Galerij · secties, S M L | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "gallery-sections @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Dashboard · titelpil, bijgewerkt | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "dashboard-title-pill @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Rail · aantallen | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "rail-counts @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Titelregel · inzicht Optie | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "title-line-insight @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Planning · ⌘Z op de pagina, zonder cel met de focus | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "undo-from-the-page @e2e"` | e2e/step-3e.spec.ts | step-3e | 1e3309c 2026-10-16 |
| Bord · drop tussen kaart 2 en 3, na herladen; buiten het bord losgelaten: geannuleerd, niets geschreven | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-drop-between @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · volgorde in een kolom, na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-reorder @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · ongerangschikte kolom, kaart 1 naar plaats 3 | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-reorder-fresh @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · gesorteerd naar handmatig, gewijzigd, terugzetten | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-to-manual @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · gesorteerd naar handmatig met oude rangen in twee kolommen: alleen de gesleepte kaart beweegt, na herladen; één ⌘Z zet de rangen terug | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-to-manual-stale-ranks @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · gesorteerd, andere kolom: tint, plaats op datum | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-cross-column @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · plek steeds verder in een volle kolom | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-slot-steady @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · een vaste kolomkop dekt de kaarten die eronder scrollen, licht en donker | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-heads-cover-scrolled-cards"` | e2e/step-3f.spec.ts | fix/board-sticky-heads | 6b1ba81 2026-10-16 |
| Bord · één ⌘Z, pagina en lade | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-undo-both @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · toetsen: spatie, pijlen, Escape | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-keyboard @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · geweigerde drop, volle kolom, muis en toetsen; op een handmatig bord laat ze geen ongedaan-stap: één ⌘Z neemt de bewerking ervoor terug | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-drag-refused @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Lade · notities als eigen blok, schrijven, na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "notities-block @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Planning · dagkop toont bezetting have/need | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "group-filled @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Tijdlijn tourstops · baan en balk in de kleur van de productie, volgt na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "production-tone @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Per status · dubbel geboekt: beide kaarten Conflict, titelregel 2 Conflicten opent Conflicten in dezelfde ruimte; geannuleerd: merken en telling weg zonder herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-marks-and-insight @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Bord · conflictband met Iemand anders kiezen en Negeren; Negeren verbergt haar tot de lade opnieuw opent; Mensen markeert de persoon | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-band-negeren @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Tijdlijn tourstops · twee overlappende tourstops van één productie: beide balken gemarkeerd, titelregel 1 overlap; geannuleerd: merken en telling weg | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "timeline-overlap @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Lade van Planning en van het bord Per status · Iemand anders kiezen: zoeker op de gemarkeerde persoon in Mensen, kandidaten, band weg; één ⌘Z zet de eerste terug met band; opnieuw gekozen, na herladen de nieuwe zonder band | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-choose-other @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Tijdlijn over Activiteiten · Iemand anders kiezen in de lade van een balk: conflict over twee producties, band weg, één ⌘Z zet de eerste terug, na herladen de nieuwe zonder band | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-choose-other-timeline @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
| Kalender activiteiten · Iemand anders kiezen in de eigen lade van de kalender: conflict over twee producties, band weg, één ⌘Z zet de eerste terug, na herladen de nieuwe zonder band | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-choose-other-calendar @e2e"` | e2e/step-3f.spec.ts | step-3f | 1e3309c 2026-10-16 |
