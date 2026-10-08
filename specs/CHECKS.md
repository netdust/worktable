# Checks registry

What the shake-outs left to re-run on a running instance. This repo has no Makefile, staging or
production: the runner is Playwright through the repo's own harness, which starts a fresh
invented instance (`playwright.config.ts`). `e2e` rows write and run only on that fresh instance:
`bunx playwright test --grep @e2e`. `smoke` rows are read-only and sessionless:
`bunx playwright test --grep @smoke`. Each row's entry narrows to its own title.

| surface | tier | entry | test | first feature | verified |
|---|---|---|---|---|---|
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-template @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-twice @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-delete-in-use @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-end-before-start @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "\sundo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-editor-rate-refused @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-admin-rate @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Sjablonen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "sjablonen-read-only @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Dagplanning · Locatie van | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "dagplanning-locatie-van @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-double-submit @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Dagplanning · redo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-redo-refused @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| POST /api/rows/speelreeks | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-boundaries @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Speelreeks · owner scope | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "owner-denied-speelreeks @e2e"` | e2e/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Sign-in page | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sign-in page renders @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| GET /api/rows/speelreeks | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "speelreeks asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| GET /api/rows/rol | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "rol asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| GET /api/rows/sjabloon | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sjabloon asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| GET /api/rows/dagplanning | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "dagplanning asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | c54521b 2026-10-08 |
| Theme · density | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dark-and-density @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Production switcher | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "switch-production @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Production switcher · owner | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "owner-has-no-switcher @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Fiche grid (no space, no facts) | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fiche-renders-as-before @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Rail tree | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "tree-fold-and-hover @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Rail tree | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "tree-scrolls-in-rail @e2e"` | e2e/rail-tree.spec.ts | grid-ux | c54521b 2026-10-08 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "create-team-and-personal-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "new-view-blank-and-double-submit @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| View menu | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "copy-rename-delete-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| View mark · colleague | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "colleague-shared-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "the-open-models-menu-exports @e2e"` | e2e/model-menu.spec.ts | grid-ux | c54521b 2026-10-08 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "rename-and-icon-a-model @e2e"` | e2e/model-menu.spec.ts | grid-ux | c54521b 2026-10-08 |
| Model menu · editor | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "name-and-icon-are-for-administrators @e2e"` | e2e/model-menu.spec.ts | grid-ux | c54521b 2026-10-08 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-reads-in-full @e2e"` | e2e/title-line.spec.ts | grid-ux | c54521b 2026-10-08 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-at-1280 @e2e"` | e2e/title-line.spec.ts | grid-ux | c54521b 2026-10-08 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fold-day-band @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "band-facts @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut-bar-and-foot @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Dagplanning · inherited venue | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "inherited-venue @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Dagplanning · details | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dagplanning-details @e2e"` | e2e/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Grid shell (lang nl, Plex) | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "the grid shell speaks Dutch in Plex @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| GET /api/views | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/views asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| GET /api/rows/productie | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/productie asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| GET /api/rows/activiteit | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/activiteit asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | c54521b 2026-10-08 |
| Rail tree · query views | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "query-views-under-model @e2e"` | e2e/rail-tree.spec.ts | dagplanning | c54521b 2026-10-08 |
| Rail tree · Tourstops | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "tourstop-first-in-planning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · editing | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "edit-dagplanning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · Locatie | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "locatie-own-and-back @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-is-a-filter @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Periode (Plandag-voorwaarde) | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "period-empty-result @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-tags @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-colours-and-overflow @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-box-fits-at-1280 @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "people-double-pick @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · Mensen | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "new-row-people @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-by-keyboard @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-enter-on-annuleren @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-tab-to-verwijderen @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · removal question | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "removal-question-buttons-styled @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Dagplanning · owner | e2e | `bunx playwright test e2e/dagplanning.spec.ts --grep "owner-has-no-dagplanning @e2e"` | e2e/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Grid shell · link with conditions | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "a link with conditions lands on the sign-in page \(#view=dagplanning&f=%5B%\) @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| Grid shell · link with conditions | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "a link with conditions lands on the sign-in page \(#view=dagplanning&f=%7Bn\) @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| GET /api/rows/toewijzing | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "/api/rows/toewijzing asks for a session @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| GET /api/rows/dagplanning (window) | smoke | `bunx playwright test e2e/smoke/dagplanning.spec.ts --grep "/api/rows/dagplanning\?from=2026-12-21&to=2026-12-27 asks for a session @smoke"` | e2e/smoke/dagplanning.spec.ts | dagplanning | c54521b 2026-10-08 |
| View · saves itself | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "autosave-own-view @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-builder @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Filter builder | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "builder-fits-at-1280 @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Filter builder · yes/no | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-yes-no @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-or @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Filter · Of | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "or-with-period-narrows @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "filter-link @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Link kopiëren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "link-to-a-view-not-yours @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-undo-own @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Geschiedenis | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "history-other-has-no-undo @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Exporteren / delen | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "menu share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Exporteren / delen · Publiceren | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "publish-from-share-menu @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Published view | e2e | `bunx playwright test e2e/toolbar.spec.ts --grep "published-view-stays-put @e2e"` | e2e/toolbar.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Scrollbars | e2e | `bunx playwright test e2e/scrollbars.spec.ts --grep "minimal-scrollbars @e2e"` | e2e/scrollbars.spec.ts | grid-toolbar | efba7cc 2026-10-08 |
| Grid shell · link joined by Of | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "a link joined by Of lands on the sign-in page @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | c54521b 2026-10-08 |
| GET /api/history/activiteit | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "/api/history/activiteit asks for a session @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | c54521b 2026-10-08 |
| GET /api/history/dagplanning | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "/api/history/dagplanning asks for a session @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | c54521b 2026-10-08 |
| GET /api/public/views/:token | smoke | `bunx playwright test e2e/smoke/grid-toolbar.spec.ts --grep "an unknown public view token is not found @smoke"` | e2e/smoke/grid-toolbar.spec.ts | grid-toolbar | c54521b 2026-10-08 |
