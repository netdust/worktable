# Checks registry

What the shake-outs left to re-run on a running instance. This repo has no Makefile, staging or
production: the runner is Playwright through the repo's own harness, which starts a fresh
invented instance (`playwright.config.ts`). `e2e` rows write and run only on that fresh instance:
`bunx playwright test --grep @e2e`. `smoke` rows are read-only and sessionless:
`bunx playwright test --grep @smoke`. Each row's entry narrows to its own title.

| surface | tier | entry | test | first feature | verified |
|---|---|---|---|---|---|
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-template @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-twice @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-delete-in-use @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-end-before-start @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "\sundo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-editor-rate-refused @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-admin-rate @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Sjablonen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "sjablonen-read-only @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Planning · Locatie via Tourstop | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "planning-locatie-via-tourstop @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-double-submit @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Dagplanning · redo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-redo-refused @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| POST /api/rows/speelreeks | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-boundaries @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Speelreeks · owner scope | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "owner-denied-speelreeks @e2e"` | e2e/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Sign-in page | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sign-in page renders @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| GET /api/rows/speelreeks | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "speelreeks asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| GET /api/rows/rol | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "rol asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| GET /api/rows/sjabloon | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sjabloon asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| GET /api/rows/activiteit | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "activiteit asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | f215e9d 2026-10-11 |
| Theme · density | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dark-and-density @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Production switcher | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "switch-production @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Production switcher · owner | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "owner-has-no-switcher @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Fiche grid (no space, no facts) | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fiche-renders-as-before @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Rail tree | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "tree-fold-and-hover @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Rail tree | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "tree-scrolls-in-rail @e2e"` | e2e/rail-tree.spec.ts | grid-ux | f215e9d 2026-10-11 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "create-team-and-personal-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "new-view-blank-and-double-submit @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| View menu | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "copy-rename-delete-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| View mark · colleague | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "colleague-shared-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "the-open-models-menu-exports @e2e"` | e2e/model-menu.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "rename-and-icon-a-model @e2e"` | e2e/model-menu.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Model menu · editor | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "name-and-icon-are-for-administrators @e2e"` | e2e/model-menu.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-reads-in-full @e2e"` | e2e/title-line.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-at-1280 @e2e"` | e2e/title-line.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fold-day-band @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "band-facts @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut-bar-and-foot @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Dagplanning · inherited venue | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "inherited-venue @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Planning · details | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "planning-details @e2e"` | e2e/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Grid shell (lang nl, Plex) | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "the grid shell speaks Dutch in Plex @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| GET /api/views | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/views asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| GET /api/rows/productie | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/productie asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| GET /api/rows/activiteit | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/activiteit asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | f215e9d 2026-10-11 |
| Rail tree · no Dagplanning, Overzichten | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "dagplanning-is-gone @e2e"` | e2e/rail-tree.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Rail tree · Tourstops | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "tourstop-first-in-planning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · editing | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "edit-dagplanning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · Locatie | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "locatie-own-and-back @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-is-a-filter @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-empty-result @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-tags @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-colours-and-overflow @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-box-fits-at-1280 @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-list-opens-up-to-its-size @e2e"` | e2e/dagplanning.spec.ts | virtual-columns | 0d9ddef 2026-10-10 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-double-pick @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "new-row-people @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-by-keyboard @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-enter-on-annuleren @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-tab-to-verwijderen @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-buttons-styled @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Dagplanning · owner | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "owner-has-no-dagplanning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Grid shell · link with conditions | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "a link with conditions lands on the sign-in page \(#view=activiteit&f=%5B%2\) @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| Grid shell · link with conditions | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "a link with conditions lands on the sign-in page \(#view=activiteit&f=%7Bno\) @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| GET /api/rows/toewijzing | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "/api/rows/toewijzing asks for a session @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| GET /api/rows/activiteit (window) | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "/api/rows/activiteit\?from=2026-12-21&to=2026-12-27 asks for a session @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | f215e9d 2026-10-11 |
| View · saves itself | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "autosave-own-view @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-builder @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "builder-fits-at-1280 @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Filter builder · yes/no | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-yes-no @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-or @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "or-with-period-narrows @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-link @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "link-to-a-view-not-yours @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-undo-own @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-other-has-no-undo @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Exporteren / delen | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "menu share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Exporteren / delen · Publiceren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "publish-from-share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Published view | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "published-view-stays-put @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Scrollbars | e2e | `bunx playwright test e2e/scrollbars.spec.ts --grep "minimal-scrollbars @e2e"` | e2e/scrollbars.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Grid shell · link joined by Of | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "a link joined by Of lands on the sign-in page @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| GET /api/history/activiteit | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "/api/history/activiteit asks for a session @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| GET /api/history/toewijzing | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "/api/history/toewijzing asks for a session @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| GET /api/public/views/:token | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "an unknown public view token is not found @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | f215e9d 2026-10-11 |
| Date cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-date-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Datetime cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-datetime-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Date and datetime calendar | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "calendar-clears-its-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Select cell editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-select-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Select cell editor · not nullable | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "not-nullable-select-offers-no-leeg @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| To-one picker | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-relation-cell @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| To-many editor | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "add-and-remove-link @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| To-one open-panel icon | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| To-one open-panel icon · keyboard | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "open-related-record-by-keyboard @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Matrix note | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "edit-long-text @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Bool switch | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "toggle-bool @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Rail views list · order | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "reorder-views @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Theme · popovers, menus and dialogs | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "chrome-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "share-dialog-light-and-dark @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Exporteren / delen · Publiceren dialog | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "publish-address-reads-in-full @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Filter builder · own view | e2e | `bunx playwright test e2e/react-aria.spec.ts --grep "own-view-keeps-a-new-condition @e2e"` | e2e/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Select and to-one picker · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "select-and-picker-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | f215e9d 2026-10-11 |
| Production switcher · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "space-switcher-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | f215e9d 2026-10-11 |
| To-many editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "chips-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | f215e9d 2026-10-11 |
| Date and datetime editor · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "date-editors-fit @e2e"` | e2e/ui-fit.spec.ts | react-aria | f215e9d 2026-10-11 |
| Filter builder · fit | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "filter-row-fits @e2e"` | e2e/ui-fit.spec.ts | react-aria | f215e9d 2026-10-11 |
| Drawer picker · frame | e2e | `bunx playwright test e2e/ui-fit.spec.ts --grep "drawer-picker-keeps-its-frame @e2e"` | e2e/ui-fit.spec.ts | react-aria | f215e9d 2026-10-11 |
| Sign-in form · React Aria button | smoke | `bunx playwright test e2e/smoke/react-aria.spec.ts --grep "the sign-in button waits for an address @smoke"` | e2e/smoke/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Grid shell · no Sakani, own colours | smoke | `bunx playwright test e2e/smoke/react-aria.spec.ts --grep "the page carries no Sakani markup and paints its own colours @smoke"` | e2e/smoke/react-aria.spec.ts | react-aria | f215e9d 2026-10-11 |
| Speelreeks · Sjabloon met plaatsen → matrix Open | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "apply-template-with-slots @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Matrix · Open-kolom | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "open-counts @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Matrix · open plek invullen | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "fill-splits-slot-and-undo @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Matrix · uitnodiging (outbox) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "invite-in-outbox @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| #/act · bevestigen zonder aanmelden | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "confirm-without-login @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| #/act · hergebruikt of verlopen | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "reused-or-expired-refused @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| POST /api/act · token A niet B | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "token-a-not-b @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| #/act · geannuleerde uitnodiging | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "cancelled-invite-offers-no-answer @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| #/act · weigeren → Geweigerd | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "decline-shows-geweigerd @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Matrix · uitnodiging zonder e-mailadres | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "no-email-no-invite @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Toewijzingen · verboden overgang | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "disallowed-transition @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Toewijzingen · persoon wisselen → Voorlopig | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "swap-pencils-back-in @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Matrix · verouderde status (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "stale-state-409 @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| PATCH /api/rows/toewijzing · race (409) | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "planner-and-person-race-409 @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Exporteren / delen · Voor eigenaars + #/link | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "link-shows-own-projects-only @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Drawer · Nieuwe link + #/link | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "rotated-link-refused @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| #/link · uitgenodigd of geweigerd | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "declined-or-invited-no-project @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| GET /api/owner/views · sleutels | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "owner-view-key-script @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| POST /api/record-links/request | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "link-request-identical @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Service account · Bearer | e2e | `bunx playwright test e2e/step-2.spec.ts --grep "agent-token-write-undo-revoke @e2e"` | e2e/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Grid shell · referrer and robots meta | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "the page sends no referrer and asks not to be indexed @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| GET /api/record-links/:dataset/:id | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "a record link is copied only with a session, never cached @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| GET /api/rows/mijn_producties | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "/api/rows/mijn_producties asks for a session @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| GET /api/schema?format=openapi | smoke | `bunx playwright test e2e/smoke/step-2.spec.ts --grep "/api/schema\?format=openapi asks for a session @smoke"` | e2e/smoke/step-2.spec.ts | step-2 | f215e9d 2026-10-11 |
| Time cell editor (no source serves a time column yet) | auth | — | | react-aria | |
| Long text cell editor (no source serves a textarea column yet) | auth | — | | react-aria | |
| Activiteiten · nieuwe weergave · Kolommen (Tourstop, Locatie, Mensen) | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "new-view-offers-locatie-and-mensen @e2e"` | e2e/step-2b.spec.ts | virtual-columns | f215e9d 2026-10-11 |
| Planning · Locatie overschrijven en wissen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "override-and-clear-venue @e2e"` | e2e/step-2b.spec.ts | virtual-columns | f215e9d 2026-10-11 |
| Activiteiten · Locatie filteren, sorteren, groeperen | e2e | `bunx playwright test e2e/step-2b.spec.ts --grep "filter-sort-group-on-locatie @e2e"` | e2e/step-2b.spec.ts | virtual-columns | f215e9d 2026-10-11 |
| Grid shell · link with a Locatie condition | smoke | `bunx playwright test e2e/smoke/virtual-columns.spec.ts --grep "a link with a Locatie condition lands on the sign-in page @smoke"` | e2e/smoke/virtual-columns.spec.ts | virtual-columns | f215e9d 2026-10-11 |
| GET /api/rows/activiteit (by Locatie) | smoke | `bunx playwright test e2e/smoke/virtual-columns.spec.ts --grep "/api/rows/activiteit by Locatie asks for a session @smoke"` | e2e/smoke/virtual-columns.spec.ts | virtual-columns | f215e9d 2026-10-11 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/virtual-columns.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/virtual-columns.spec.ts | virtual-columns | f215e9d 2026-10-11 |
| Filter builder · is vandaag | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "filter-is-vandaag @e2e"` | e2e/period-today.spec.ts | period-today | f215e9d 2026-10-11 |
| Own view · is vandaag after a reload | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "vandaag-kept-after-reload @e2e"` | e2e/period-today.spec.ts | period-today | f215e9d 2026-10-11 |
| Filter builder · new date condition | e2e | `bunx playwright test e2e/period-today.spec.ts --grep "new-date-condition-starts-at-deze-week @e2e"` | e2e/period-today.spec.ts | period-today | f215e9d 2026-10-11 |
| Grid shell · link with an is-vandaag condition | smoke | `bunx playwright test e2e/smoke/period-today.spec.ts --grep "a link with an is-vandaag condition lands on the sign-in page @smoke"` | e2e/smoke/period-today.spec.ts | period-today | f215e9d 2026-10-11 |
| GET /api/rows/activiteit (today) | smoke | `bunx playwright test e2e/smoke/period-today.spec.ts --grep "/api/rows/activiteit for today asks for a session @smoke"` | e2e/smoke/period-today.spec.ts | period-today | f215e9d 2026-10-11 |
| Tourstop drawer · Tourstop verschuiven | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-tourstop @e2e"` | e2e/action-inputs.spec.ts | action-inputs | 33422cc 2026-10-11 |
| Tourstop drawer · refusal under the action | e2e | `bunx playwright test e2e/action-inputs.spec.ts --grep "shift-refused-in-dutch @e2e"` | e2e/action-inputs.spec.ts | action-inputs | 33422cc 2026-10-11 |
| Grid shell · Tourstops link | smoke | `bunx playwright test e2e/smoke/action-inputs.spec.ts --grep "a tourstop link lands on the sign-in page @smoke"` | e2e/smoke/action-inputs.spec.ts | action-inputs | 33422cc 2026-10-11 |
| GET /api/actions/tourstop_verschuiven | smoke | `bunx playwright test e2e/smoke/action-inputs.spec.ts --grep "/api/actions/tourstop_verschuiven asks for a session @smoke"` | e2e/smoke/action-inputs.spec.ts | action-inputs | 33422cc 2026-10-11 |
| Activiteit drawer · Bijlagen (upload, openen, verwijderen, ongedaan maken) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "upload-open-delete-undo @e2e"` | e2e/attachments.spec.ts | attachments | b2598ed 2026-10-11 |
| Activiteit drawer · Bijlagen · foto zonder locatie | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "photo-location-gone @e2e"` | e2e/attachments.spec.ts | attachments | b2598ed 2026-10-11 |
| Activiteit drawer · Bijlagen · weigeringen (type, grootte) | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "refusals-in-dutch @e2e"` | e2e/attachments.spec.ts | attachments | b2598ed 2026-10-11 |
| Tourstop en Toewijzing drawer · Bijlagen; Organisatie zonder | e2e | `bunx playwright test e2e/attachments.spec.ts --grep "bijlagen-on-tourstop-and-assignment @e2e"` | e2e/attachments.spec.ts | attachments | b2598ed 2026-10-11 |
| GET /api/attachments/:dataset/:id | smoke | `bunx playwright test e2e/smoke/attachments.spec.ts --grep "/api/attachments/activiteit/1 asks for a session @smoke"` | e2e/smoke/attachments.spec.ts | attachments | b2598ed 2026-10-11 |
| GET /api/attachments/file/:id | smoke | `bunx playwright test e2e/smoke/attachments.spec.ts --grep "/api/attachments/file/1 asks for a session @smoke"` | e2e/smoke/attachments.spec.ts | attachments | b2598ed 2026-10-11 |
