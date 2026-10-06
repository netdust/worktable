# Step 0e U6: the WordPress view shortcode and YOOtheme element, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atelier renders a public Worktable view on a WordPress page as escaped HTML, through a shortcode `[worktable_view token="…"]` and a YOOtheme builder element that wraps it. The fetch is server-side and cached. The page shows a quiet empty state when the engine is down.

**Architecture:**
- **The service.** A new atelier service `services/worktable/`, shaped like `services/performance/`:
  - `WorktableService` registers the shortcode and the element;
  - `WorktableClient` fetches `GET <engine_url>/api/public/views/<token>?from&to` with `wp_remote_get`, a 3-second timeout and a transient cache;
  - a template renders a table from the rows' keys, in the order the engine sends them.
- **Where the engine URL comes from.** It is service config (`ntdst/service/worktable/config` → `engine_url`). Laika sets it from `WORKTABLE_URL` in its `.env`; it is never written in code or in a shortcode attribute.
- **First working version:** Task 1. The shortcode on a local page, with `pre_http_request` returning a recorded engine response, renders the table.

**Tech Stack:** PHP 8.2, WordPress, ntdst-core 5.4, atelier 0.10, YOOtheme Pro builder, PHPUnit and Brain Monkey (atelier's own suite); Laika's wp-phpunit integration tier for the wiring.

**Spec:** `specs/step-0e/spec.md` U6 in the worktable repo; the engine contract is `specs/step-0e-auth/plan.md` (the public route). On execution, this plan is copied to the atelier repo's `specs/worktable-view/plan.md` in the first commit.

**Repository and branch:**
- atelier is `git@github.com:netdust/atelier.git`. Work in a new worktree, `/home/ntdst/Sites/worktrees/atelier-worktable-view`, on `feature/worktable-view` from `origin/main`. The checkout installed in Laika (`web/app/mu-plugins/atelier`, on `feature/card`) is not switched.
- One Laika line (`WORKTABLE_URL` in `config/application.php` and `.env.example`, plus the service's config filter in laika-core) goes on a Laika branch made with `make feature name=worktable-view`. Load `netdust-devops:devops` first.

**Simplest design:**
- **Client-side.** A browser `fetch` from the page to the engine, with CORS, is simplest. Stefan's constraint rules it out: no CORS, and the shortcode fetches server-side.
- **The shortcode alone** would also meet the need. The YOOtheme element is Stefan's choice, and it is a thin builder wrapper over the same render function.
- **No query shortcode.** A shortcode that fetches a query by name would need a session. The spec settles it: one door, the public view by token.

## Decisions
- **The token.**
  - The attribute is validated as `^[A-Za-z0-9_-]{43}$` (32 bytes, base64url), else the empty state.
  - Optional attributes `from`/`to` are `YYYY-MM-DD` or the keywords `today` and `+Nd` (for example `+90d`), resolved in the site's timezone. Anything else is ignored.
  - The token is public-data capability, so it may sit in post content, but it never appears in the rendered HTML.
- **The cache.**
  - The transient key is `worktable_view_` + `md5(token|from|to)`, and it lives 5 minutes.
  - A failed fetch (timeout, non-200, invalid JSON) is never cached as data. It renders the empty state, and is cached 60 seconds as a failure, so a down engine is not hammered.
- **Escaping.** Column headers are the row keys turned into labels (`ucfirst`, `_`→space) through `esc_html`. Cells go through `esc_html`. There is no HTML from the engine, ever.
- **The empty state** is a filterable string, `ntdst/service/worktable/empty`, empty by default. The output says nothing about why it is empty.
- **The YOOtheme element.**
  - It lives at `services/worktable/builder/worktable_view/element.json` plus `template.php`, with fields `token`, `from` and `to`. Its template calls the same render function as the shortcode.
  - It is registered through `Builder::addTypePath()`, the way `yootheme/packages/builder-wordpress/bootstrap.php:60-63` loads child-theme elements. The registration file `services/worktable/yootheme.php` is required only after `function_exists('YOOtheme\app')`, at `after_setup_theme`, as `PerformanceService` does at `PerformanceService.php:62-68`.

## Global Constraints

- Evidence: no task claims a line below without its evidence in the task report — the
  command as run with its output quoted, or the review that owns the line. No quote, not met.
- Base: ntdst-core is the framework base and its layering applies to every new class —
  `netdust-wp:ntdst-framework`; where files live — `netdust-wp:ntdst-patterns`. Owned by the
  whole-branch review, joined on WordPress by `netdust-wp:ntdst-drift-reviewer` on the changed
  paths (Part 1 runs core's invariants live); its `## Findings:` header is quoted.
- Golden path: the plan names the slice this feature is built to (`netdust-wp:ntdst-patterns`
  → `golden-paths/`); every departure from it is named and justified, or `none`. Judged, not
  grepped: `/plan-review` checks the slice is named, the whole-branch review that code keeps it.
- Security: every data flow (AJAX action, REST route, form post, shortcode attribute,
  settings save, custom query) states its four pillars — validate, sanitize, escape,
  authorize — as `netdust-wp:wp-security` defines them; a pillar that does not apply is
  written `n/a — <why>`, never omitted. Evidence per flow: each pillar cited `file:line`; the
  output of `grep -nE "current_user_can|wp_verify_nonce|check_ajax_referer|check_admin_referer|permission_callback" <changed files>`;
  the denial test's name, RED then GREEN. `security-sentinel` owns the review when the plan
  carries a threat model.
- Drift: nothing `netdust-wp:ntdst-drift-reviewer` reports — a Critical or Drift finding is
  fixed or is a deviation the plan names; the review quotes the agent's findings, never "looks clean".
- Tests: the close is `make gate`. Unit = Brain Monkey, integration = wp-phpunit through
  DDEV, e2e = Playwright; commands and setup are `netdust-wp:wp-testing`'s. Evidence: the exit
  code and the summary lines of a run after the task's last edit. A tier that did not run is
  reported as not run, never as a pass. A site's tests cover its code and its configuration of
  ntdst-core and ntdst-baseline; the packages' own behaviour is tested in their repos.
- Local and ship: DDEV always; the Makefile is the only route to a server
  (`netdust-devops:devops`); anything that must ship names its `deploy.payload` path, and
  `make deploy-test env=staging` output listing it is quoted. An rsync, scp or SFTP to a server
  outside the Makefile is a defect the review reports.

| Red flag — the excuse | The answer |
|---|---|
| "Admin-only screen, so no nonce" | Capability says who; the nonce says they meant it. Both. |
| "The value comes from the database" | Stored input is input. Escape it on output. |
| "The reviewer will catch it" | The reviewer checks the evidence you quoted. No quote, not met. |
| "`make gate` was green earlier" | Earlier is not after your last edit. Run it, quote it. |
| "The integration tier needs DDEV; skip it" | `ddev start`. A tier not run is not a pass. |
| "Plain WordPress is simpler here" | On ntdst-core that is drift. Use the framework's door or name the deviation. |
| "Too small for the golden path" | Then the departure is `none` or one named line. Silence is the defect. |
| "The denial is obvious, no test needed" | Obvious is untested. Write it RED first. |
| "Just rsync this one file" | A hand-deploy is drift nobody sees. The Makefile, or nothing. |

Then this plan's own:
- **Golden path:** `yootheme-integration` covers binding a model's fields as dynamic content, not a custom element over remote data. The departures are named:
  - a builder element registered with `addTypePath`, because there is no ntdst-core model to bind (the data lives in the engine);
  - a shortcode, as `PerformanceService` already registers one.
- **Data flow: the shortcode and element attributes** (`token`, `from`, `to`). The four pillars:
  - validate: the token regex and the date grammar;
  - sanitize: `sanitize_text_field` before validating;
  - escape: `esc_html` on every cell and header; the token is never echoed;
  - authorize: n/a, because it renders public data to any visitor. The capability is the token, which the engine checks.
- **Data flow: the outbound fetch.**
  - validate: the URL comes from config only (no user-supplied host). The token is path-encoded with `rawurlencode`, and `from`/`to` are built from validated dates.
  - sanitize: the response is `json_decode`d and must be `{rows: list<object<string, scalar|null>>}`, else it is treated as a failure;
  - escape: as above;
  - authorize: n/a, because the engine's public route carries no credential beyond the token.
- **No engine code in PHP**: the client only reads JSON (AGENTS.md: "Nothing of the engine lives in PHP").
- Each task logs its start and end time in a Time log in the copied plan.

## Threat model
**Assets:** the share token (a read capability for one public view), the site's availability, and visitors' browsers.

**Attacks:**
1. **Stored XSS through engine data,** for example a production named `<script>`. → **`esc_html` on every cell and header in `templates/worktable-view.php`. Test: a row value with markup renders escaped.**
2. **SSRF through an attribute,** by an editor setting a host. → **There is no host attribute; the URL is config only, and the token is regex-validated and path-encoded. Test: `token="../../x"` renders the empty state with no request made.**
3. **The engine down or slow, blocking page renders.** → **A 3-second timeout, a failure cached 60 seconds, and the empty state. Test: a `WP_Error` from `pre_http_request` renders empty and sets the failure transient; a second render makes no request.**
4. **Token leak through the HTML.** → **The token is never rendered: no `data-` attribute and no comment. Test: the output does not contain the token.**
5. **A response shaped to break the template,** with nested objects or huge arrays. → **Shape validation (scalar or null cells only), and at most 500 rows rendered (Ruling: the public views are calendars; the cost if wrong is a truncated table, and the cap is a config value).**

**Mitigations:** `WorktableClient::fetch()` (2, 3, 5), the template (1, 4), and the attribute parser `WorktableService::attributes()` (2).

**Deferrals:** HTTPS to the engine is the cutover's job, and so is the real `WORKTABLE_URL`.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Client and render | `do_shortcode('[worktable_view …]')` with `pre_http_request` stubbed | unit · atelier `tests/Unit/Worktable/WorktableViewTest.php` (denials first: attacks 1–5) · `composer test` in the atelier worktree | none |
| Attribute parsing | `WorktableService::attributes()` | unit · same file | none |
| YOOtheme element | the element's `template.php` rendering through the same function | unit · `tests/Unit/Worktable/ElementTest.php`: the template includes the render output for given props | worktable-element-in-builder (shake-out, manual by Stefan) |
| Laika wiring | `WORKTABLE_URL` → the service config | integration · Laika `tests/Integration/Atelier/WorktableConfigTest.php` · `ddev composer test:int` | none |
| Live render against a local engine | a page with the shortcode in Laika's DDEV | manual · Task 4 | voorstellingen-on-page |

## Review Focus
1. The engine down (edge 6): the page still renders with the empty state, within the timeout → the `WP_Error` test plus Task 4's stopped-engine check.
2. Markup in data (attack 1): the escaping test.
3. Zero rows (edge 1): an empty `rows` list renders the empty state, not an empty table.
4. A boundary token: 42 or 44 characters → the empty state with no request.
5. The cache key covers `from`/`to`, so two shortcodes on one page with different windows get their own data.

---

### Task 1: Client, shortcode and template
**Files:** Create `services/worktable/{WorktableService.php,WorktableClient.php,templates/worktable-view.php}`, `tests/Unit/Worktable/WorktableViewTest.php`. Modify `atelier.php` or the service registry, following how `PerformanceService` is registered.

**Interfaces:**
- Produces: `WorktableService::render(array $atts): string` and `WorktableClient::fetch(string $token, ?string $from, ?string $to): ?array`. The fetch returns null on any failure.

- [ ] **Step 1: Denial tests first,** for attacks 1–5. Then behaviour: rows render in key order; the cache hit makes no request.
- [ ] **Step 2: Implement, then run** `composer gate` in the worktree.
- [ ] **Step 3: Commit.** `feat(worktable): a public engine view as a shortcode, fetched server-side`.

### Task 2: The YOOtheme element
**Files:** Create `services/worktable/yootheme.php`, `services/worktable/builder/worktable_view/{element.json,template.php}`, `tests/Unit/Worktable/ElementTest.php`.

- [ ] **Step 1: Test.** The element's template, given `{token, from, to}` props, returns `WorktableService::render()`'s output.
- [ ] **Step 2: Implement** the `addTypePath` registration under the YOOtheme guard. Before writing, read `yootheme/packages/builder-wordpress/bootstrap.php:50-66` in Laika's installed theme to find the event that hands over the `Builder`.
- [ ] **Step 3: Run, then commit.** `feat(worktable): the YOOtheme element wraps the shortcode`.

### Task 3: Laika's configuration
**Repository:** Laika, `make feature name=worktable-view` (devops loaded first).

**Files:** Modify `config/application.php` (`Config::define('WORKTABLE_URL', env('WORKTABLE_URL') ?: '')`), `.env.example` (`WORKTABLE_URL=`), laika-core (the `ntdst/service/worktable/config` filter sets `engine_url` from the constant). Create `tests/Integration/Atelier/WorktableConfigTest.php`.

- [ ] **Step 1: Test.** The constant flows into the service config, and an empty constant means the shortcode renders the empty state with no request.
- [ ] **Step 2: Implement, then run** `make gate` and quote the tiers. Composer still resolves atelier from its installed branch; this test covers only the wiring, with the service class loaded from the worktree through a test bootstrap path. Ruling: this avoids switching Laika's atelier to an unmerged branch. The cost if wrong: the wiring is re-run once atelier is released.
- [ ] **Step 3: Commit.** `feat: WORKTABLE_URL configures atelier's worktable view`.

### Task 4: Live check against a local engine (stop point)
- [ ] **Step 1: Find the route from the DDEV web container to an engine on the WSL host.** For example, try `ddev exec curl -sS http://host.docker.internal:4310/api/public/views/x`.
  - The engine binds `127.0.0.1` and allows only loopback `Host` values (U2 keeps the 0a Host check).
  - If no route works without changing the engine's bind address or Host allowlist, **stop and report** it as a spec finding. That change is the cutover's Host allowlist, out of 0e.
- [ ] **Step 2: If a route works:**
  - Make a public view on `voorstellingen` with a seeded engine.
  - Put the shortcode on a local page with Laika temporarily pointed at the worktree, with Stefan's go-ahead, because that switches an installed mu-plugin.
  - Screenshot the page, stop the engine, screenshot the empty state.
  - Record both in the atelier plan copy.
