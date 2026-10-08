# Checks registry

What the shake-outs left to re-run on a running instance. This repo has no Makefile, staging or
production: the runner is Playwright through the repo's own harness, which starts a fresh
invented instance (`playwright.config.ts`). `e2e` rows write and run only on that fresh instance:
`bunx playwright test --grep @e2e`. `smoke` rows are read-only and sessionless:
`bunx playwright test --grep @smoke`. Each row's entry narrows to its own title.

| surface | tier | entry | test | first feature | verified |
|---|---|---|---|---|---|
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-template @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-twice @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-delete-in-use @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Speelreeksen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-end-before-start @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-editor-rate-refused @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Rollen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "rollen-admin-rate @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Sjablonen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "sjablonen-read-only @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Dagplanning · Locatie van | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "dagplanning-locatie-van @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Speelreeks · Sjabloon toepassen | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-double-submit @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Dagplanning · undo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-undo-changed-since @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Dagplanning · redo | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "apply-redo-refused @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| POST /api/rows/speelreeks | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "speelreeks-boundaries @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Speelreeks · owner scope | e2e | `bunx playwright test e2e/step-1.spec.ts --grep "owner-denied-speelreeks @e2e"` | e2e/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Sign-in page | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sign-in page renders @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| GET /api/rows/speelreeks | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "speelreeks asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| GET /api/rows/rol | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "rol asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| GET /api/rows/sjabloon | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "sjabloon asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| GET /api/rows/dagplanning | smoke | `bunx playwright test e2e/smoke/step-1.spec.ts --grep "dagplanning asks for a session @smoke"` | e2e/smoke/step-1.spec.ts | step-1 | 3b36773 2026-10-07 |
| Theme · density | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dark-and-density @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Production switcher | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "switch-production @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Production switcher · owner | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "owner-has-no-switcher @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Fiche grid (no space, no facts) | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fiche-renders-as-before @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Rail tree | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "tree-fold-and-hover @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Rail tree | e2e | `bunx playwright test e2e/rail-tree.spec.ts --grep "tree-scrolls-in-rail @e2e"` | e2e/rail-tree.spec.ts | grid-ux | 966de4a 2026-10-07 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "create-team-and-personal-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| New view dialog | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "new-view-blank-and-double-submit @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| View menu | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "copy-rename-delete-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| View mark · colleague | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "colleague-shared-view @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "the-open-models-menu-exports @e2e"` | e2e/model-menu.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Model menu | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "rename-and-icon-a-model @e2e"` | e2e/model-menu.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Model menu · editor | e2e | `bunx playwright test e2e/model-menu.spec.ts --grep "name-and-icon-are-for-administrators @e2e"` | e2e/model-menu.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-reads-in-full @e2e"` | e2e/title-line.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Title line | e2e | `bunx playwright test e2e/title-line.spec.ts --grep "title-line-fits-at-1280 @e2e"` | e2e/title-line.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "fold-day-band @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Dagplanning · day bands | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "band-facts @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Dagplanning · read limit | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "read-limit-cut-bar-and-foot @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Dagplanning · inherited venue | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "inherited-venue @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Dagplanning · details | e2e | `bunx playwright test e2e/grid-ux.spec.ts --grep "dagplanning-details @e2e"` | e2e/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| Grid shell (lang nl, Plex) | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "the grid shell speaks Dutch in Plex @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| GET /api/schema | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/schema asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| GET /api/views | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/views asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| GET /api/rows/productie | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/productie asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
| GET /api/rows/activiteit | smoke | `bunx playwright test e2e/smoke/grid-ux.spec.ts --grep "/api/rows/activiteit asks for a session @smoke"` | e2e/smoke/grid-ux.spec.ts | grid-ux | 966de4a 2026-10-07 |
