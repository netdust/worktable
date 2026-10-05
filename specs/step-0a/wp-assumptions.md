# WordPress-assumption ledger — the grid port (step 0a, R10)

Source: ntdst-baseline `feature/views-saved` @ `7efef97`, `services/views/app`, copied verbatim into `apps/grid` as commit `c9873c3`. Every `file:line` below is in that verbatim commit (`git show c9873c3:apps/grid/src/<file>`), so it stays valid after the rework.

How it was found: the sweep `grep -rnE "nonce|apiFetch|wp\.|rest_route|wp-json|ntdstViews|Boot|table:|publish|draft|post|capability|title_readonly|status"` over `src/` (tests included, 679 hits), a second sweep for `wp-admin|wpbody|WordPress|PHP|::|ntdst-views|views_|rest_|location.host|lang`, and a read of `api.ts`, `types.ts`, `App.tsx`, `space.ts`, `useSavedViews.ts`, `views.ts`, `matrix/*`, `grid/store.ts`, `grid/newRow.ts`, `grid/columns.ts`, `export/*`, `i18n.ts`, plus `main.tsx`, `index.html`, `vite.config.ts`, the CSS and the test files.

Lines changed = insertions + deletions as `git diff --numstat c9873c3` counts them (a rewritten line counts twice). "Reachable" means a user of the 0a grid can make the code run against the engine.

## Ledger

| # | file:line | What it assumes | Reachable? | Rework |
|-|-|-|-|-|
| 1 | `api.ts:3-8` | `window.wp.apiFetch` (WP's script dependency, carries the REST nonce) and `window.ntdstViews` (config inlined by `AdminApp::config()`) | yes | done in 0a: removed (in the `api.ts` rewrite, row 3) |
| 2 | `api.ts:12-30` | REST root from the boot config, either pretty `/wp-json/<ns>` or plain `?rest_route=/<ns>` permalinks | yes | done in 0a: `endpoint()` is `/api` + path + query (in row 3) |
| 3 | `api.ts:32-51` | every request through `apiFetch` (nonce middleware, cookie auth); errors as `WP_Error` JSON `{code, message, data:{status}}` | yes | done in 0a: `fetch` against `/api`, refusals from the engine's `{code, message}`, a non-JSON answer as `unknown` with its status. `api.ts` total: 113 lines changed |
| 4 | `api.ts:53-55` | `/schema` answers the WP plugin's shape: `models`, `tables`, starting `views`, `writable`, `capability` | yes | done in 0a: `toSchema` in the new `engine.ts` adapter (with rows 8, 15, 16, 19, 21, 43: 163 lines) |
| 5 | `api.ts:61` | `?table=<key>`: the PHP table declaration answers a source's lookups and rollups | yes | done in 0a: dropped; the source is the path (in row 3) |
| 6 | `api.ts:60` | `cells=1`: the PHP route folds a matrix's join records into `rollups.cells` | no (no matrix type is served) | done in 0a: removed in the `rows()` rewrite (in row 3); the matrix step re-adds it |
| 7 | `api.ts:59` | a space scope as WP query param `filter[<field>]=<id>` | no (the engine serves no space) | deferred: out of scope (child spaces); `rows()` keeps the `scope` argument, unread |
| 8 | `api.ts:64-67` | `records()` searches titles server-side (`search=`, post-title LIKE) and caps at 50 | yes (`useFilterNames` names a relation chip from `/rows/productie`) | done in 0a: the engine has no search; `records()` reads the source and narrows titles client-side (in row 3) |
| 9 | `api.ts:69-76` | writes carry `?table=` so the reply comes back with that PHP table's lookups and rollups | no (nothing is writable) | done in 0a: the `table` argument dropped in the seam rewrite (in row 3); the writes themselves deferred: writes step |
| 10 | `api.ts:82-85` | `GET /views[?table=]`: the plugin's saved-view records of this WP user (own and shared) | yes | done in 0a: `savedViews()` = `toSavedViews` of the memoised `/api/schema` read (in rows 3 and 4) |
| 11 | `api.ts:87-89` + `useSavedViews.ts:125,130,149` | `POST /views` creates a saved view owned by the WP user — reached by "Save as new" (`Toolbar.tsx:50,68`), "+ New view" (`Rail.tsx:19,43` → `ViewPanel`) and "Duplicate" (`ViewList.tsx:49`) | yes | deferred: SavedView-writes step. Fails with the engine's 404 into the copied error handling (`ViewPanel` / `note`) |
| 12 | `api.ts:91-101` | `PATCH /views/:id`, `DELETE /views/:id`, `POST /views/:id/restore` (WP trash and restore of the view's post) | no (no served view is `mine`/`editable`) | deferred: SavedView-writes step |
| 13 | `api.ts:103-106`, `types.ts:103-106` | `GET /views/prefs`: the current WP user's prefs from user meta; the route names no user because the cookie does | yes | done in 0a: `prefs()` resolves `{ order: {}, last: {} }` without a request (in row 3) |
| 14 | `api.ts:108-111` + `useSavedViews.ts:44` | `PUT /views/prefs` writes the WP user's prefs, debounced after a view switch | yes | deferred: SavedView-writes / actors step. Answers 404, swallowed by the copied `.catch` |
| 15 | `types.ts:179,188` | `Row.status` / `Lookup.status` are a post's `post_status` | yes (the type) | done in 0a: the adapter fills `''`; the type stays (0 lines in `types.ts`) |
| 16 | `types.ts:20-21` | every record has a `post_title`: `title_label`, `title_readonly` | yes | done in 0a: the adapter takes the title from the source's declared title column and its label; `title_readonly: true` (in row 4) |
| 17 | `types.ts:5` | field types `gallery`, `image`, `file`, `repeater`, `html` (WP attachments, ntdst-core field types) | no (the adapter never emits them) | deferred: none — only if the engine ever declares such a type |
| 18 | `types.ts:11` | `Field.fact`, an ntdst-core field flag | yes (the type; read nowhere in the grid) | deferred: none needed; the adapter sets `false` |
| 19 | `types.ts:86-89` | a saved view's `owner` is a WP user; `editable` when owner "or an administrator" (WP role) | yes | done in 0a: the adapter sets `owner {0,''}`, `mine/editable: false`, `shared: true`; the real owner deferred: actors step |
| 20 | `types.ts:158` | `Schema.capability`, the WP capability that opens the app (`edit_others_posts`) | yes (the type) | done in 0a: removed from the type (18 lines in `types.ts` with rows 24, 25) |
| 21 | `types.ts:51,70` | the PHP server merges a view over its table (`Json::view` / `Json::saved`) and cleans an arrangement (`Arrangement::clean()`) | yes (the merge) | done in 0a: `toSavedViews` merges client-side (in row 4); `clean()` deferred: SavedView-writes step |
| 22 | `types.ts:43,160-166` | `space`: a scoping relation configured on the WP site | no (none served) | deferred: out of scope (child spaces); stays as copied |
| 23 | `types.ts:162`, `i18n.ts:103-120`, `App.tsx:74` | `Schema.strings`: the site's words and `error.<code>` refusal words from the WP config | yes (`setStrings(undefined)` keeps English) | deferred: no step — the engine serves no strings; the English defaults and the engine's messages show |
| 24 | `types.ts:197-204` | `Boot`, the shape of `window.ntdstViews` | yes | done in 0a: removed (in row 20's count) |
| 25 | `types.ts:211-217` | `ApiFetchOptions`, `ApiFetch` | yes | done in 0a: removed (in row 20's count) |
| 26 | `main.tsx:9-17` | mounts only on `#ntdst-views-root` and only with `window.ntdstViews` present (the WP admin page prints both) | yes | done in 0a: mounts on `#root`, no boot: 7 lines |
| 27 | `index.html:9` | the mount id the WP admin page prints | yes | done in 0a: `#root`: 2 lines |
| 28 | `App.tsx:43-44,85-86,125,133` | the shell paints from the boot config before the schema answers; `boot.writable` as fallback | yes | done in 0a: `App()` takes no props and shows its spinner until the schema answers |
| 29 | `App.tsx:72-76` | a failed schema read is swallowed because the boot shell is already up | yes | done in 0a: the refusal is shown (rows 28 + 29 in `App.tsx`: 27 lines) |
| 30 | `App.tsx:34-41`, `matrix/Matrix.tsx:26` | a matrix's columns are the "published records" (post status) of the join's model | no | deferred: matrix step |
| 31 | `vite.config.ts:4-11` | WordPress prints the page: `base: './'`, a `manifest.json` for `AppAssets` to enqueue, the script as the build entry | yes (`vite build`) | done in 0a: removed; `index.html` is the entry (6 lines, with the proxy) |
| 32 | `ui/app.css` (58 `#ntdst-views-root` selectors), `ui/theme.css:45,79`, `ui/Theme.tsx:25` | the mount id, used for specificity over wp-admin's `.wrap h1` / `input[type=search]` (`app.css:67`) and for the dark theme | yes | done in 0a: id renamed to `#root`, mechanical: 120 lines (114 in `app.css` — its numstat 115 includes the deleted comment — + 4 + 2); the `app.css:67` comment claiming `#root` outranks wp-admin's rules deleted in fix round 1 (1 line; the `#root` selectors stay, behaviour unchanged) |
| 33 | `ui/theme.css:1-3` | Sakani's tokens re-themed to wp-admin's blue, greys and font; dark mode scoped so WP's chrome keeps its own | yes | deferred: no step — harmless outside wp-admin, a restyle is a design decision |
| 34 | `ui/viewport.ts:3-6,16` | fills the viewport under wp-admin's chrome; observes `#wpbody-content` | yes | deferred: none needed — falls back to `document.body`; 0 lines |
| 35 | `i18n.ts:126-135`, `ui/Window.tsx:37-40` | WordPress sets `<html lang>` to the admin locale; dates and month names read it | yes | deferred: client locale config (no step in 0a). `index.html` says `lang="en"`, so dates show in English until it says `nl-BE` |
| 36 | `i18n.ts:4` | the empty-state hint names the WP filter `ntdst/baseline/views/config` | yes (no saved view) | done in 0a: 2 lines |
| 37 | `ui/useSavedViews.ts:107-108,174-175` | the WP plugin's refusal codes `views_unknown_saved`, `views_not_owner` | no (only on a refused update/delete) | deferred: SavedView-writes step |
| 38 | `ui/ViewList.tsx:44-50` | rename/share/delete for the owner, or for an administrator (WP role) on a shared view | no (duplicate is reachable, row 11) | deferred: actors / SavedView-writes step |
| 39 | `space.ts:11` | the space selection is kept per site host (WP multisite) | no | deferred: out of scope (child spaces) |
| 40 | `space.ts:41`, `matrix/ColumnPicker.tsx:27` | `records()` with the WP search contract for the space list and the matrix column picker | no | deferred: space / matrix; `records()` keeps its contract (row 8) |
| 41 | `grid/cells/RelationPicker.tsx:19,53` | the picker's records come capped and ordered by the WP route | no (relation cells are not editable) | deferred: writes step; `records()` now returns every record, the picker slices to 50 itself |
| 42 | `grid/columns.ts:69` | a time column is detected by the ntdst-core REST field description containing `HH:MM` | yes (`kindOf`) | deferred: none in 0a — never matches; engine `datetime` maps to text (ISO text sorts correctly) |
| 43 | `grid/columns.ts:154-157` | the title column is the post title, editable unless `title_readonly` | yes | done in 0a via the adapter (row 16); 0 lines in `columns.ts` |
| 44 | `grid/newRow.ts:28` | a new row needs a `title` first (post title) unless `title_readonly` | no | deferred: writes step |
| 45 | `grid/store.ts:23-24,57-58,154,156,270` | writes name the PHP table so its lookups and rollups come back | no | deferred: writes step; `api.create/update` no longer send it (row 9) |
| 46 | `grid/store.ts:259` | a draft row's status is `'draft'` (post status) | no | deferred: writes step |
| 47 | `grid/store.ts:140`, `matrix/store.ts:233` | one write in flight per record because PHP workers could reorder an undo | no | deferred: writes step (the rule may still hold for the engine) |
| 48 | `matrix/store.ts:176` | a new cell's placeholder status is `'publish'` | no | deferred: matrix step |
| 49 | `matrix/store.ts:214-229`, `matrix/hooks.ts:18` | join records are WP posts created, updated and deleted through the rows route | no | deferred: matrix step |
| 50 | `matrix/columns.ts:7` | `MAX_NAME` mirrors `Arrangement::isMatrixKey()` in PHP | no | deferred: matrix step |
| 51 | `fixture.test-support.ts:5,14` | the column-id fixture is shared with PHP's `ArrangementTest` at `../../../../tests/fixtures/views-columns.json` | yes (2 test files failed to load in the verbatim copy) | done in 0a: fixture copied in as `src/views-columns.fixture.json` (107 lines, copied, not written), path changed: 4 lines |
| 52 | `api.test.ts:1-186` | `apiFetch` mocks, `wp-json` and `rest_route` roots, the boot config, WP error shape | yes (tests) | done in 0a: rewritten to the `fetch` seam: 262 lines |
| 53 | `ui/App.test.tsx:16-29` + 52 renders + 6 fixtures | the `Boot` fixture (`wp-json` root, `edit_others_posts`), `render(<App boot>)`, sync asserts on the boot shell, "renders the shell from the boot config when the schema route fails" (`rest_no_route`), the boot label `Absences` | yes (tests) | done in 0a: `<App />`, awaits the shell, the schema-failure test rewritten: 144 lines |
| 54 | `grid/Grid.test.tsx:5,430,700-701,812-813` + 19 renders | `Boot` fixtures and `capability` | yes (tests) | done in 0a: 47 lines |
| 55 | `ui/Window.test.tsx:102-105` | the shell drawn from a boot config while the schema route is rejected | yes (tests) | done in 0a: the schema serves the view: 4 lines |
| 56 | `grid/calais.test.data.ts:75` | `capability` in the schema fixture | yes (tests) | done in 0a: 1 line |
| 57 | `ui/Rail.test.tsx:28,101` | the mount id `ntdst-views-root` | yes (tests) | done in 0a: 4 lines |
| 58 | fixtures in `App.test`, `Grid.test`, `Drawer.test`, `Relation.test`, `columns.test`, `filter.test`, `group.test`, `store.test`, `matrix/*.test` (`status: 'publish'`, 45 hits) | rows and lookups carry a post status | yes (tests) | deferred: none needed — data only, the grid never reads it |
| 59 | `ui/App.test.tsx` saved-view tests (`views_unknown_saved`, `views_not_owner`, `restoreView`) | the WP plugin's refusals and trash/restore | yes (tests over mocked unreachable flows) | deferred: SavedView-writes step; kept as copied |

Plus the adapter's tests, `engine.test.ts` (135 of its 166 lines: `toSchema`, `toRow`, `toSavedViews`), which prove rows 4, 10, 15, 16, 19 and 21.

### Found with the port, not WordPress (counted with the non-WordPress rework)

| # | file:line | What it assumes | Reachable? | Rework |
|-|-|-|-|-|
| N1 | `grid/filter.ts:20-46`, called from `ui/App.tsx:141-143` (after rework) | a relation chip's options are built from the loaded rows; with R9's server-side filtering, once a relation chip is set only that record is offered, so the user must clear the chip to pick another. Cause: R9, not WordPress (the WP grid filtered in the browser over the whole window) | yes | deferred: step 0 — relation chip options come from the target dataset via `records()` |

### Deliberately not WordPress (sweep hits that are not rows)

- `table:` / `table` — the grid's own declared-table concept (`TableDef`, `View.table`, `groupTables`); only `?table=` in a request is WordPress (rows 5, 9, 45).
- `status` — UI state unions (`{ status: 'loading' }` in `App.tsx`, `space.ts`, `RelationPicker.tsx`), `role="status"`, the matrix cell's value (`join.cell_field`) and the "Status" label. Only the post-status uses are rows (15, 46, 48, 58).
- `draft` — the editor's typed text (`editing.draft`, `keys.ts`, `cells/*`) and the grid's own unsaved new row; only its `status: 'draft'` is a row (46).
- `publish(` in `matrix/store.ts` — the store notifying its listeners.
- `ntdst-views/...` localStorage prefixes (`grid/layout.ts:26`, `ui/Theme.tsx:7`, `matrix/columns.ts:5`) — a name, nothing WordPress reads or writes.
- `export/*`, `ui/hash.ts`, `ui/Search.tsx`, `grid/group.ts`, `grid/keys.ts`, `grid/filter.ts` — no hit.

## Totals

- **WordPress assumptions found: 59** — 40 reachable, 19 unreachable.
- **Reworked now: 32 rows, 1 060 lines changed** — 459 in production code (`api.ts` 113, `engine.ts` adapter 163, `App.tsx` 27, `types.ts` 18, `main.tsx` 7, `vite.config.ts` 6, `index.html` 2, `i18n.ts` 2, root id 120, the stale wp-admin comment 1) and 601 in tests (`api.test.ts` 262, `engine.test.ts` 135, `App.test.tsx` 144, `Grid.test.tsx` 47, `Window.test.tsx` 4, `Rail.test.tsx` 4, `fixture.test-support.ts` 4, `calais.test.data.ts` 1); plus 107 fixture lines copied in unchanged. Of the 459 production lines, 120 are a mechanical id rename.
- **Deferred: 27 rows** — 17 unreachable (writes, matrix, space, saved-view CRUD, actors) and 10 reachable that work as they are or fail into the copied handling: Save as new / New view / Duplicate (11), the debounced prefs write (14), the `fact` flag (18), site strings (23), wp-admin palette (33), viewport (34), locale (35), the `HH:MM` time detection (42), and in tests the `'publish'` fixture data (58) and the saved-view refusal tests (59).
- **Non-WordPress rework (kept apart): 121 lines** — the Biome override for `apps/grid/**` (10 lines in `biome.json`, committed with the copy: per plan-review A1/B1 the copied code fails 82 format and 89 lint checks and organize-imports on 20 files under this repo's config, none WordPress — repo lint on the copied grid: not WordPress, deferred); the grid's own `typescript ~6.0.2` and its copied `tsconfig.json` (not extending the base, so no `noUncheckedIndexedAccess` rework: 0 lines); `package.json` `dev`/`test` scripts (2); the `<title>` (2); and R9's server-side layout, which is new behaviour rather than a WordPress removal (`App.tsx` 17, `engine.ts` `rowsQuery` 23, `engine.test.ts` 31, `App.test.tsx` 26, `Grid.test.tsx` 6, `Window.test.tsx` 4 = 107). `bun.lock` is generated and not counted. Deferred non-WordPress: 1 row (N1, relation chip options, to step 0).
