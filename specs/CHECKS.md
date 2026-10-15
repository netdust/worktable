# Checks registry

What the shake-outs left to re-run on a running instance. This repo has no Makefile, staging or
production: the runner is Playwright through the repo's own harness, which starts a fresh
invented instance (`playwright.config.ts`). `e2e` rows write and run only on that fresh instance:
`bunx playwright test --grep @e2e`. `smoke` rows are read-only and sessionless:
`bunx playwright test --grep @smoke`. Each row's entry narrows to its own title.

| surface | tier | entry | test | first feature | verified |
|---|---|---|---|---|---|
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-template @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-twice @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-delete-in-use @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-end-before-start @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "\sundo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-editor-rate-refused @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-admin-rate @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Sjablonen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "sjablonen-read-only @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Planning · Locatie via Tourstop | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "planning-locatie-via-tourstop @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-double-submit @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Dagplanning · redo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-redo-refused @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| POST /api/rows/speelreeks | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-boundaries @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Speelreeks · owner scope | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "owner-denied-speelreeks @e2e"` | e2e/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Sign-in page | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sign-in page renders @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| GET /api/rows/speelreeks | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "speelreeks asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| GET /api/rows/rol | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "rol asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| GET /api/rows/sjabloon | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sjabloon asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| GET /api/rows/activiteit | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "activiteit asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 9aa2e54 2026-10-12 |
| Theme · density | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dark-and-density @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Production switcher | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "switch-production @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Production switcher · owner | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "owner-has-no-switcher @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Fiche grid (no space, no facts) | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fiche-renders-as-before @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Rail tree | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "tree-fold-and-hover @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Rail tree | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "tree-scrolls-in-rail @e2e"` | e2e/rail-tree.spec.ts | grid-ux | ea74984 2026-10-14 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "create-team-and-personal-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "new-view-blank-and-double-submit @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| View menu | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "copy-rename-delete-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| View mark · colleague | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "colleague-shared-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "the-open-models-menu-exports @e2e"` | e2e/model-menu.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "rename-and-icon-a-model @e2e"` | e2e/model-menu.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| Model menu · editor | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "name-and-icon-are-for-administrators @e2e"` | e2e/model-menu.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-reads-in-full @e2e"` | e2e/title-line.spec.ts | grid-ux | ea74984 2026-10-14 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-at-1280 @e2e"` | e2e/title-line.spec.ts | grid-ux | ea74984 2026-10-14 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fold-day-band @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "band-facts @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut-bar-and-foot @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Dagplanning · inherited venue | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "inherited-venue @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Planning · details | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "planning-details @e2e"` | e2e/grid-ux.spec.ts | grid-ux | ea74984 2026-10-14 |
| Grid shell (lang nl, Plex) | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "the grid shell speaks Dutch in Plex @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| GET /api/views | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/views asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| GET /api/rows/productie | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/productie asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| GET /api/rows/activiteit | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/activiteit asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 9aa2e54 2026-10-12 |
| Rail tree · no Dagplanning, Overzichten | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "dagplanning-is-gone @e2e"` | e2e/rail-tree.spec.ts | dagplanning | ea74984 2026-10-14 |
| Rail tree · Tourstops | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "tourstop-first-in-planning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · editing | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "edit-dagplanning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · Locatie | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "locatie-own-and-back @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-is-a-filter @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-empty-result @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-tags @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-colours-and-overflow @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-box-fits-at-1280 @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-list-opens-up-to-its-size @e2e"` | e2e/dagplanning.spec.ts | virtual-columns | ea74984 2026-10-14 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-double-pick @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "new-row-people @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-by-keyboard @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-enter-on-annuleren @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-tab-to-verwijderen @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-buttons-styled @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Dagplanning · owner | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "owner-has-no-dagplanning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | ea74984 2026-10-14 |
| Grid shell · link with conditions | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "a link with conditions lands on the sign-in page \(#view=activiteit&f=%5B%2\) @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | 9aa2e54 2026-10-12 |
| Grid shell · link with conditions | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "a link with conditions lands on the sign-in page \(#view=activiteit&f=%7Bno\) @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | 9aa2e54 2026-10-12 |
| GET /api/rows/toewijzing | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "/api/rows/toewijzing asks for a session @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | 9aa2e54 2026-10-12 |
| GET /api/rows/activiteit (window) | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "/api/rows/activiteit\?from=2026-12-21&to=2026-12-27 asks for a session @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | 9aa2e54 2026-10-12 |
| View · saves itself | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "autosave-own-view @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-builder @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "builder-fits-at-1280 @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Filter builder · yes/no | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-yes-no @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-or @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "or-with-period-narrows @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-link @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "link-to-a-view-not-yours @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-undo-own @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-other-has-no-undo @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Exporteren / delen | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "menu share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Exporteren / delen · Publiceren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "publish-from-share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Published view | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "published-view-stays-put @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Scrollbars | e2e | `bunx playwright test e2e/scrollbars.spec.ts --grep "minimal-scrollbars @e2e"` | e2e/scrollbars.spec.ts | grid-toolbar | ea74984 2026-10-14 |
| Grid shell · link joined by Of | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "a link joined by Of lands on the sign-in page @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | 9aa2e54 2026-10-12 |
| GET /api/history/activiteit | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "/api/history/activiteit asks for a session @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | 9aa2e54 2026-10-12 |
| GET /api/history/toewijzing | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "/api/history/toewijzing asks for a session @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | 9aa2e54 2026-10-12 |
| GET /api/public/views/:token | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "an unknown public view token is not found @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | 9aa2e54 2026-10-12 |
| Date cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-date-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Datetime cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-datetime-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Date and datetime calendar | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "calendar-clears-its-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Select cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-select-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Select cell editor · not nullable | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "not-nullable-select-offers-no-leeg @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| To-one picker | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-relation-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| To-many editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "add-and-remove-link @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| To-one open-panel icon | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| To-one open-panel icon · keyboard | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record-by-keyboard @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Matrix note | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-long-text @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Bool switch | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "toggle-bool @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Rail views list · order | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "reorder-views @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Theme · popovers, menus and dialogs | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "chrome-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "share-dialog-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "publish-address-reads-in-full @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Filter builder · own view | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "own-view-keeps-a-new-condition @e2e"` | e2e/react-aria.spec.ts | react-aria | ea74984 2026-10-14 |
| Select and to-one picker · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "select-and-picker-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | ea74984 2026-10-14 |
| Production switcher · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "space-switcher-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | ea74984 2026-10-14 |
| To-many editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "chips-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | ea74984 2026-10-14 |
| Date and datetime editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "date-editors-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | ea74984 2026-10-14 |
| Filter builder · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "filter-row-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | ea74984 2026-10-14 |
| Drawer picker · frame | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "drawer-picker-keeps-its-frame @e2e"` | e2e/ui-fit.spec.ts | react-aria | ea74984 2026-10-14 |
| Sign-in form · React Aria button | smoke | `bunx playwright test e2e/smoke/react-aria.spec.ts --grep "the sign-in button waits for an address @smoke"` | e2e/smoke/react-aria.spec.ts | react-aria | 9aa2e54 2026-10-12 |
| Grid shell · no Sakani, own colours | smoke | `bunx playwright test e2e/smoke/react-aria.spec.ts --grep "the page carries no Sakani markup and paints its own colours @smoke"` | e2e/smoke/react-aria.spec.ts | react-aria | 9aa2e54 2026-10-12 |
| Speelreeks · Sjabloon met plaatsen → matrix Open | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "apply-template-with-slots @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Matrix · Open-kolom | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "open-counts @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Matrix · open plek invullen | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "fill-splits-slot-and-undo @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Matrix · uitnodiging (outbox) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "invite-in-outbox @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| #/act · bevestigen zonder aanmelden | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "confirm-without-login @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| #/act · hergebruikt of verlopen | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "reused-or-expired-refused @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| POST /api/act · token A niet B | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "token-a-not-b @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| #/act · geannuleerde uitnodiging | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "cancelled-invite-offers-no-answer @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| #/act · weigeren → Geweigerd | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "decline-shows-geweigerd @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Matrix · uitnodiging zonder e-mailadres | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "no-email-no-invite @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Toewijzingen · verboden overgang | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "disallowed-transition @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Toewijzingen · persoon wisselen → Voorlopig | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "swap-pencils-back-in @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Matrix · verouderde status (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "stale-state-409 @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| PATCH /api/rows/toewijzing · race (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "planner-and-person-race-409 @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Exporteren / delen · Voor eigenaars + #/link | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "link-shows-own-projects-only @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Drawer · Nieuwe link + #/link | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "rotated-link-refused @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| #/link · uitgenodigd of geweigerd | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "declined-or-invited-no-project @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| GET /api/owner/views · sleutels | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "owner-view-key-script @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| POST /api/record-links/request | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "link-request-identical @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Service account · Bearer | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "agent-token-write-undo-revoke @e2e"` | e2e/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Grid shell · referrer and robots meta | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "the page sends no referrer and asks not to be indexed @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| GET /api/record-links/:dataset/:id | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "a record link is copied only with a session, never cached @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| GET /api/rows/mijn_producties | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "/api/rows/mijn_producties asks for a session @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| GET /api/schema?format=openapi | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "/api/schema\?format=openapi asks for a session @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | 9aa2e54 2026-10-12 |
| Time cell editor (no source serves a time column yet) | auth | — | | react-aria | |
| Long text cell editor (no source serves a textarea column yet) | auth | — | | react-aria | |
| Activiteiten · nieuwe weergave · Kolommen (Tourstop, Locatie, Mensen) | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "new-view-offers-locatie-and-mensen @e2e"` | e2e/step-2b.spec.ts | virtual-columns | 9aa2e54 2026-10-12 |
| Planning · Locatie overschrijven en wissen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "override-and-clear-venue @e2e"` | e2e/step-2b.spec.ts | virtual-columns | 9aa2e54 2026-10-12 |
| Activiteiten · Locatie filteren, sorteren, groeperen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "filter-sort-group-on-locatie @e2e"` | e2e/step-2b.spec.ts | virtual-columns | 9aa2e54 2026-10-12 |
| Grid shell · link with a Locatie condition | smoke | `bunx playwright test e2e/smoke/virtual-columns.spec.ts --grep "a link with a Locatie condition lands on the sign-in page @smoke"` | e2e/smoke/virtual-columns.spec.ts | virtual-columns | 9aa2e54 2026-10-12 |
| GET /api/rows/activiteit (by Locatie) | smoke | `bunx playwright test e2e/smoke/virtual-columns.spec.ts --grep "/api/rows/activiteit by Locatie asks for a session @smoke"` | e2e/smoke/virtual-columns.spec.ts | virtual-columns | 9aa2e54 2026-10-12 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/virtual-columns.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/virtual-columns.spec.ts | virtual-columns | 9aa2e54 2026-10-12 |
| Filter builder · is vandaag | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "filter-is-vandaag @e2e"` | e2e/period-today.spec.ts | period-today | ea74984 2026-10-14 |
| Own view · is vandaag after a reload | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "vandaag-kept-after-reload @e2e"` | e2e/period-today.spec.ts | period-today | ea74984 2026-10-14 |
| Filter builder · new date condition | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "new-date-condition-starts-at-deze-week @e2e"` | e2e/period-today.spec.ts | period-today | ea74984 2026-10-14 |
| Grid shell · link with an is-vandaag condition | smoke | `bunx playwright test e2e/smoke/period-today.spec.ts --grep "a link with an is-vandaag condition lands on the sign-in page @smoke"` | e2e/smoke/period-today.spec.ts | period-today | 9aa2e54 2026-10-12 |
| GET /api/rows/activiteit (today) | smoke | `bunx playwright test e2e/smoke/period-today.spec.ts --grep "/api/rows/activiteit for today asks for a session @smoke"` | e2e/smoke/period-today.spec.ts | period-today | 9aa2e54 2026-10-12 |
| Tourstop drawer · Tourstop verschuiven | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-tourstop @e2e"` | e2e/action-inputs.spec.ts | action-inputs | 9aa2e54 2026-10-12 |
| Tourstop drawer · refusal under the action | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-refused-in-dutch @e2e"` | e2e/action-inputs.spec.ts | action-inputs | 9aa2e54 2026-10-12 |
| Grid shell · Tourstops link | smoke | `bunx playwright test e2e/smoke/action-inputs.spec.ts --grep "a tourstop link lands on the sign-in page @smoke"` | e2e/smoke/action-inputs.spec.ts | action-inputs | 9aa2e54 2026-10-12 |
| GET /api/actions/tourstop_verschuiven | smoke | `bunx playwright test e2e/smoke/action-inputs.spec.ts --grep "/api/actions/tourstop_verschuiven asks for a session @smoke"` | e2e/smoke/action-inputs.spec.ts | action-inputs | 9aa2e54 2026-10-12 |
| Activiteit drawer · Bijlagen (upload, openen, verwijderen, ongedaan maken) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "upload-open-delete-undo @e2e"` | e2e/attachments.spec.ts | attachments | ea74984 2026-10-14 |
| Activiteit drawer · Bijlagen · foto zonder locatie | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "photo-location-gone @e2e"` | e2e/attachments.spec.ts | attachments | ea74984 2026-10-14 |
| Activiteit drawer · Bijlagen · weigeringen (type, grootte) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "refusals-in-dutch @e2e"` | e2e/attachments.spec.ts | attachments | ea74984 2026-10-14 |
| Tourstop en Toewijzing drawer · Bijlagen; Organisatie zonder | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "bijlagen-on-tourstop-and-assignment @e2e"` | e2e/attachments.spec.ts | attachments | ea74984 2026-10-14 |
| GET /api/attachments/:dataset/:id | smoke | `bunx playwright test e2e/smoke/attachments.spec.ts --grep "/api/attachments/activiteit/1 asks for a session @smoke"` | e2e/smoke/attachments.spec.ts | attachments | 9aa2e54 2026-10-12 |
| GET /api/attachments/file/:id | smoke | `bunx playwright test e2e/smoke/attachments.spec.ts --grep "/api/attachments/file/1 asks for a session @smoke"` | e2e/smoke/attachments.spec.ts | attachments | 9aa2e54 2026-10-12 |
| Matrix · kandidaten in Open plek invullen | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "candidates-picker @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Matrix · geen kandidaten, Iedereen tonen | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "candidates-none @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Conflicten · zes types | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "conflicten-six-types @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Conflicten · randen en per productie | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "conflicten-edges @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Per persoon per dag · badge; Afwezigheden · Soort | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "badge-clears @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Matrix · alleen afwezig is weg | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "away-only-afwezig @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| GET /api/rows/conflicten, kandidaten, persoon_dag, locatie_dag, werklijst · owner | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "owner-denied-queries @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Persoonskalender | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "person-calendar @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Persoonskalender · nacht, punt, venster | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "calendar-edges @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Persoonskalender · activiteit zonder einde (test.fail tot de fix) | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "point-event-shows-its-name @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Bedrijfsweek · week, maand, drawer | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "company-week @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Bedrijfsweek · maand die op zondag begint | e2e | `bunx playwright test e2e/step-3.spec.ts --grep "month-starting-sunday @e2e"` | e2e/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| GET /api/rows/conflicten | smoke | `bunx playwright test e2e/smoke/step-3.spec.ts --grep "/api/rows/conflicten asks for a session @smoke"` | e2e/smoke/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Grid shell · calendar link | smoke | `bunx playwright test e2e/smoke/step-3.spec.ts --grep "a calendar link lands on the sign-in page @smoke"` | e2e/smoke/step-3.spec.ts | step-3 | 9aa2e54 2026-10-12 |
| Dashboard · landing, licht en donker | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "dashboard-landing @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · Conflicten rood dan neutraal | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "stat-red-then-neutral @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · getal opent zijn view | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "stat-opens-view @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · weekstrook opent activiteit | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "week-opens-activity @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · Werklijst Gedaan | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "werklijst-set @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · Nieuwe taak | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "quick-create @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · Nieuwe activiteit | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "quick-create-activiteit @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · productie kiezen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "space-narrows @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · productie kiezen, elke tegel (test.fail tot de fix) | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "space-narrows-every-tile @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · lege productie | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "dashboard-empty-space @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · Geen toegang | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "tile-no-access @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Dashboard · samenstellen, teamdashboard, verwijderen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "composer-team-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| POST/PATCH /api/views dashboard shared · editor | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "editor-cannot-share-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| GET /api/views · owner, geen dashboard | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "owner-no-dashboard @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| Bord, tijdlijn, galerij, kalender over dagen | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "skins-open @e2e"` | e2e/step-3c.spec.ts | step-3c | ffb52ec 2026-10-15 |
| GET /api/attachments/activiteit?ids · 200 en 201 | e2e | `bunx playwright test e2e/step-3c.spec.ts --grep "gallery-batch-boundary @e2e"` | e2e/step-3c.spec.ts | step-3c | ea74984 2026-10-14 |
| GET /api/views | smoke | `bunx playwright test e2e/smoke/step-3c.spec.ts --grep "/api/views asks for a session @smoke"` | e2e/smoke/step-3c.spec.ts | step-3c | 6562271 2026-10-13 |
| Grid shell · landing | smoke | `bunx playwright test e2e/smoke/step-3c.spec.ts --grep "the landing page shows the sign-in @smoke"` | e2e/smoke/step-3c.spec.ts | step-3c | 6562271 2026-10-13 |
| GET /api/attachments/activiteit?ids | smoke | `bunx playwright test e2e/smoke/step-3c.spec.ts --grep "/api/attachments/activiteit batch asks for a session @smoke"` | e2e/smoke/step-3c.spec.ts | step-3c | 6562271 2026-10-13 |
| Grid shell · skin link | smoke | `bunx playwright test e2e/smoke/step-3c.spec.ts --grep "a skin view link lands on the sign-in page @smoke"` | e2e/smoke/step-3c.spec.ts | step-3c | 6562271 2026-10-13 |
| Bijstellen · Rasterlijnen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "looks-gridlines @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Lade · derde kolom | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "drawer-in-slot @e2e"` | e2e/step-3d.spec.ts | step-3d | ffb52ec 2026-10-15 |
| Chiprij · elke weergave | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "one-chip-row @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Kalender · Groep (rijen) | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "calendar-lanes-in-groep @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Planning · periode stappen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "grid-period-steps @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Kalender · Nieuwe activiteit | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "quick-create-calendar @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Kalender · Nieuwe activiteit leesbaar (test.fail tot de fix) | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "quick-create-calendar-readable @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Persoonskalender, Bedrijfsweek · geen Nieuw | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "no-add-on-query-calendar @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Nieuwe tijdlijn · deze maand, rijen | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "new-timeline-defaults @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Tijdlijn · Groep geen, één rij | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "unlaned-timeline-one-lane @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Tijdlijn · naar vandaag eenmaal per venster | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "timeline-scroll-holds @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Matrix · koppen en legende | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "matrix-heads-and-legend @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Galerij · initialen, met beeld | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "gallery-placeholder @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Titelregel · samenvatting per weergave | e2e | `bunx playwright test e2e/step-3d.spec.ts --grep "summary-per-view @e2e"` | e2e/step-3d.spec.ts | step-3d | ea74984 2026-10-14 |
| Grid shell · tokens | smoke | `bunx playwright test e2e/smoke/step-3d.spec.ts --grep "the shell carries the prototype tokens @smoke"` | e2e/smoke/step-3d.spec.ts | step-3d | 21ff052 2026-10-13 |
| Grid shell · tijdlijnlink | smoke | `bunx playwright test e2e/smoke/step-3d.spec.ts --grep "a timeline view link lands on the sign-in page @smoke"` | e2e/smoke/step-3d.spec.ts | step-3d | 21ff052 2026-10-13 |
| Planning · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Planning @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Bord · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Per status @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Galerij · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Galerij activiteiten @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Kalender · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Kalender activiteiten @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Tijdlijn · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Tijdlijn tourstops @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Matrix · één periode | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "period-sequence on Toewijzingen per activiteit @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Chiprij · geen periode zonder datum | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "a view whose table has no date shows no period control @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Groep · elke weergave, bord hergroepeert | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "groep-everywhere @e2e"` | e2e/step-3e.spec.ts | step-3e | ffb52ec 2026-10-15 |
| Bord · slepen, muis en toetsen, ⌘Z | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-drag @e2e"` | e2e/step-3e.spec.ts | step-3e | ffb52ec 2026-10-15 |
| Bord · + in kolom | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-column-plus @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Bord · + in kolom, week zonder vandaag | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "board-column-plus-in-window @e2e"` | e2e/step-3e.spec.ts | step-3e | ffb52ec 2026-10-15 |
| Lade · kop, N van M, velden, toetsen, breed | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "drawer-anatomy @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Matrix · cellade, Kiezen, ⌘Z, Afwezigheden | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "matrix-cell-drawer @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Galerij · secties, S M L | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "gallery-sections @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Dashboard · titelpil, bijgewerkt | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "dashboard-title-pill @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Rail · aantallen | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "rail-counts @e2e"` | e2e/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| Titelregel · inzicht Optie | e2e | `bunx playwright test e2e/step-3e.spec.ts --grep "title-line-insight @e2e"` | e2e/step-3e.spec.ts | step-3e | ffb52ec 2026-10-15 |
| Bord · drop tussen kaart 2 en 3, na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-drop-between @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · volgorde in een kolom, na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-reorder @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · ongerangschikte kolom, kaart 1 naar plaats 3 | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-reorder-fresh @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · gesorteerd naar handmatig, gewijzigd, terugzetten | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-to-manual @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · gesorteerd, andere kolom: tint, plaats op datum | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-sorted-cross-column @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · plek steeds verder in een volle kolom | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-slot-steady @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · één ⌘Z, pagina en lade | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-undo-both @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · toetsen: spatie, pijlen, Escape | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-keyboard @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Bord · geweigerde drop, volle kolom, muis en toetsen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "board-drag-refused @e2e"` | e2e/step-3f.spec.ts | step-3f | ffb52ec 2026-10-15 |
| Lade · notities als eigen blok, schrijven, na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "notities-block @e2e"` | e2e/step-3f.spec.ts | step-3f | a660b59 2026-10-15 |
| Planning · dagkop toont bezetting have/need | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "group-filled @e2e"` | e2e/step-3f.spec.ts | step-3f | 7a5a060 2026-10-15 |
| Tijdlijn tourstops · baan en balk in de kleur van de productie, volgt na herladen | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "production-tone @e2e"` | e2e/step-3f.spec.ts | step-3f | 2f71775 2026-10-15 |
| Per status · dubbel geboekt: beide kaarten Conflict, titelregel 2 Conflicten opent Conflicten in dezelfde ruimte | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-marks-and-insight @e2e"` | e2e/step-3f.spec.ts | step-3f | 6f81da0 2026-10-15 |
| Lade · conflictband met alleen Negeren, verborgen tot de lade opnieuw opent; Mensen markeert de persoon | e2e | `bunx playwright test e2e/step-3f.spec.ts --grep "conflict-band-negeren @e2e"` | e2e/step-3f.spec.ts | step-3f | 6f81da0 2026-10-15 |
| Grid shell · lade-link met voorwaarde | smoke | `bunx playwright test e2e/smoke/step-3e.spec.ts --grep "a drawer link with a condition lands on the sign-in page @smoke"` | e2e/smoke/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| GET /api/rows/kandidaten | smoke | `bunx playwright test e2e/smoke/step-3e.spec.ts --grep "/api/rows/kandidaten asks for a session @smoke"` | e2e/smoke/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
| GET /api/rows/werklijst | smoke | `bunx playwright test e2e/smoke/step-3e.spec.ts --grep "/api/rows/werklijst asks for a session @smoke"` | e2e/smoke/step-3e.spec.ts | step-3e | ea74984 2026-10-14 |
