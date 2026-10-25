# Plugin actions (studio side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The studio knows which sites carry the Netdust plugin. It shows the plugin's reads as site columns, offers
the plugin's actions (install, cache, cron, maintenance), and logs Stefan into a site from a login icon in the drawer
header, which opens wp-admin in a new tab.

**Architecture:** Two generic engine additions, then the studio domain on top of them.
- **Handoff (engine):** a one-time value that a service hands to the person who started a record. It is kept in a new
  engine table `handoff`, never in a row column, because every column change is revised forever
  (`packages/engine/src/writes.ts:527-554`) and the spec forbids the login link in history.
  - A service PUTs it, once: the first PUT wins and a second is refused 409. The account that created the record
    reads it once, and the read clears it.
  - It expires within at most 120 s, and is never revised or logged.
- **Head actions (engine + grid):** a single-record action may declare `head: { icon }`. The grid then shows it as an
  button in the drawer header directly after OpenLink ("Website openen", `apps/grid/src/grid/Drawer.tsx:204`), in
  the same `tools` slot and the same shape: an icon-only `nv-more` button, size 16, with the action's label as
  `aria-label` and `title`. It is filtered by `when` like any action.
  - An action may also declare `handoff: true`. A click then opens a blank tab synchronously (so no popup blocker
    stops it), runs the action, reads the handoff of the record the run created every second for up to 30 s, and
    sends the tab there. It navigates only when the value is on the same site as the drawer row's `href` column (the
    one OpenLink reads), counting the `www.` twin as the same site. On a timeout, a failure or another site, it
    closes the tab and says why.
- **Studio:** new site columns, new actie soorten and their actions, Bevestigen for install and maintenance, and the
  login action restricted to a human administrator.

**First working version:** Task 1 (handoff) and Task 2 (head actions) together give a clickable login icon on a
seeded site. In e2e, a fake worker posts a handoff and the new tab opens on it.

**Tech Stack:** Bun, Hono, SQLite, React; `bun test`, Playwright (`bun run gate`).

**Spec:** `/home/ntdst/Sites/netdust-studio/specs/studio-plugin/spec.md`: R7–R12 from the studio side, R1's columns,
R5's account. The spec names clients and WordPress and stays in netdust-studio. This plan names no client; its
fixtures are invented.

## Global Constraints

- worktable AGENTS.md:
  - no domain word in `packages/engine` or `apps/grid` (`bun run check` enforces it);
  - engine messages in English;
  - no client data;
  - no WordPress code;
  - scope changes are made by editing `docs/SPEC.md` first.
- **Scope:** the handoff table and head actions are new engine scope. Task 1 Step 1 adds both to `docs/SPEC.md`
  (the engine table list, `:144`; the action declaration, `:53`) before any code. Stefan approves that edit with this
  plan.
- **A handoff value never appears in** a revision, a row, `/schema`, a log line, an error message or a batch.
- **A handoff value is an http(s) URL,** checked with the same rule as an `href` column (`isWebAddress`,
  `packages/engine/src/writes.ts:128`, exported for this). A `javascript:` or `data:` value is refused 400 `bad_url`.
- **Vocabulary:** every studio column name, split on `_`, becomes a forbidden word for `packages/engine`
  (`scripts/check-vocabulary.ts:51-55`). New names must pass `bun run check`. That is why the columns below are
  `cron_achterstand` and `uploadmap_mb`, not `…_min` and `uploads_mb`.
- **Pills and sizes** follow the action-row look: one face, 13 px.
- The gate is `flock /home/ntdst/.cache/worktable-e2e.lock bun run gate`.

## Threat model

**Assets**
- The login link: an administrator session on a client site for about a minute.
- The ability to start a login, an install or maintenance mode.

**Attacks**
1. **Another studio account reads someone's login link** (an editor polling `/handoff/actie/<id>`) → **only the
   account whose write created the record may read it, and the read clears it.** Everyone else gets 404.
2. **The claude service account starts a login and reads the link** → **the actie writer refuses soort `inloggen`
   from anyone but a human administrator** (403 `forbidden`), so no inloggen record of the service's exists. A
   service also never reads a handoff.
3. **A person, or a second service such as the claude account, plants a handoff** (a phishing URL in Stefan's tab) →
   **only a service may PUT one** (403 `service_only`), **the first PUT wins** (409 on any later one, so the worker's
   link cannot be overwritten), and **the grid navigates only to the drawer row's own site** (its `href` column's
   origin or `www.` twin). A planted link to anywhere else is never opened.
4. **A worker or compromised site hands back a non-web URL** (`javascript:`), run in Stefan's tab → **the engine
   accepts only http(s)** (400 `bad_url`), and the grid checks again before it sets `location`.
5. **The link lingers** (never opened) → **the handoff expires (≤120 s TTL, enforced on read)** and expired rows are
   swept. The site token expires after 60 s anyway.
6. **The link persists in history, undo or a batch** → **the handoff table is outside revisions and batches.** An
   e2e asserts that `/revisions/actie/<id>` holds no URL.
7. **An editor starts an install or maintenance mode** → **both take the Bevestigen path,** where confirming is
   administrator-only (`checkConfirmer`, `packages/studio/src/writers/actie.ts:27-31`).
8. **The opened tab reaches back into the studio through `window.opener`** → **the grid sets `opener = null`
   before navigating.**

**Mitigations, where they live**
- `packages/engine/src/handoff.ts`: `putHandoff` (service-only, http(s), TTL clamp, first PUT wins) and
  `takeHandoff` (creator only, clear on read, expiry). Attacks 1, 3, 4, 5, 6.
- `packages/studio/src/writers/actie.ts`: the inloggen check beside `checkConfirmer` (`:26-30`), and `checkFit`
  extended to the Bevestigen soorten. Attacks 2, 7.
- `apps/grid/src/grid/HeadActions.tsx`: the blank-tab, opener, http(s) and same-site checks. Attacks 3, 4, 8.

**Deferrals**
- A same-uid process on Stefan's machine can read the SQLite file. That is the accepted risk.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Handoff | `PUT /handoff/:dataset/:id` and `GET /handoff/:dataset/:id` | integration · `packages/engine/test/handoff.test.ts` · `bun test packages/engine/test/handoff.test.ts` | login-from-drawer |
| Head actions | `/schema` actions with `head` and `handoff`; the drawer header | unit · `apps/grid/src/grid/HeadActions.test.tsx` · `cd apps/grid && bunx vitest run src/grid/HeadActions.test.tsx`; e2e · `e2e/studio.spec.ts` · `flock /home/ntdst/.cache/worktable-e2e.lock bunx playwright test e2e/studio.spec.ts -g login` | login-from-drawer, login-times-out |
| Studio columns and soorten | `site` and `actie` declarations through the writers | integration · `packages/studio/test/plugin.test.ts` · `bun test packages/studio/test/plugin.test.ts` | — |
| Studio actions | `POST /actions/<name>` for the six actions | integration · `packages/studio/test/plugin.test.ts` · `bun test packages/studio/test/plugin.test.ts` | install-asks-bevestigen, cache-runs-straight-away |

Denials, RED first:
- a second read of a handoff;
- another person reading it;
- a service reading it;
- a person PUTting one;
- a second PUT by another service (409);
- a value on another site, which the grid never navigates to;
- a `javascript:` value;
- an expired one;
- `inloggen` started by an editor and by the service;
- install and maintenance confirmed by an editor.

## Review Focus

1. The handoff value reaches no revision, batch, log or error (attack 6; row 1, plus the e2e revisions assertion).
2. Creator-only read, cleared on read: a second read and a parallel second read both get 404 (attacks 1, 5;
   concurrent; row 1).
3. Inloggen is a human administrator's only (attack 2; row 3).
4. The tab opens on the click itself and is closed on a timeout or failure (wrong order, mid-flow failure; row 2,
   login-times-out).
5. An install or maintenance actie cannot skip voorbereid (row 4).
6. A site without the plugin, or with no `adres`, shows no login icon. A plugin action on a site without the plugin
   ends that link overgeslagen "Geen studio-plugin". A selection where no site has the plugin is refused, as the
   all-gone case is today (`packages/studio/src/actions.ts:29`) (empty; rows 2, 4).

## Simplest design

The simplest design writes the link to an `actie` column the grid opens. It puts the link in permanent history and
undo. Spec R11 and the constraints forbid that, and an unused link would sit there readable. The next simplest is a
generic handoff table. It is one small engine table with two routes, and it is what this plan does. A direct worker
endpoint was offered as the alternative, and Stefan chose the queue ("queue is fine").

---

### Task 1: Handoff (engine)

**Files:**
- Modify `docs/SPEC.md` (engine tables at `:144`, the declaration at `:53`, the reserved names) and
  `packages/engine/src/engine-tables.ts` (`handoff`: `dataset, record_id, value` nullable, `creator_id, expires_at,
  taken_at`, unique on `dataset, record_id`).
- Create `packages/engine/src/handoff.ts`; modify `app.ts` (routes).
- Test `packages/engine/test/handoff.test.ts`.

**Interfaces:**
- `PUT /handoff/:dataset/:id` with body `{ value: string, ttl_s?: number }` (1 to 120, default 60): service only. The
  record must exist in the service's scope. One handoff per record, ever: a second PUT is refused 409, even after the
  first was read or expired. Reading or expiring clears `value` and sets `taken_at`, and the row stays as a
  tombstone. The sweep clears values only and never deletes a row.
- `GET /handoff/:dataset/:id`:
  - answers `{ value }` once, then clears `value` and sets `taken_at` in one conditional UPDATE (`WHERE value IS NOT
    NULL`, `RETURNING`), so a parallel read gets 404;
  - 404 for anyone but `creator_id`, or when none or expired.
- `creator_id` is the account of the record's create revision.

- [ ] **Step 1 (RED):** the denials above, the happy path, and that `/revisions` and the batch table never hold the
  value.
- [ ] **Step 2:** implement, with a sweep that clears the values of expired rows on every PUT and GET.
- [ ] **Step 3:** `bun test packages/engine`, then commit `feat(engine): a one-time handoff from a service to the
  record's creator`.

### Task 2: Head actions (engine + grid)

**Files:**
- Modify `packages/engine/src/declare.ts`:
  - `ActionDecl.head?: { icon: Icon }` and `handoff?: true`, both refused on a selection action at validation;
  - `ICONS` (`:5-20`) gains `log-in`, mapped to lucide `LogIn` with the Dutch label "Inloggen" in
    `apps/grid/src/ui/icons.ts`. Validation refuses an unknown `head.icon`.
- Modify `validate.ts`.
- `apps/grid/src/grid/HeadActions.tsx` (new), `Drawer.tsx:204`, `apps/grid/src/grid/HeadActions.test.tsx`.
- `e2e/studio.spec.ts`: login-from-drawer, login-times-out.

**Interfaces:** `/schema` actions carry `head` and `handoff`. `HeadActions` renders, right after `<OpenLink>` in the
drawer's `tools`, an icon-only `nv-more` button per `head` action in `row.available.actions` (lucide icon size 16, as
OpenLink), with the action's label as `aria-label` and `title`.

- [ ] **Step 1 (RED):**
  - validation refuses `head` and `handoff` on a selection action, and an unknown `head.icon`;
  - the button sits directly after OpenLink in the header, and shows only when `when` matches, and a `handoff` action only when the row has an `href` value;
  - click → blank tab → run → poll → navigate;
  - a timeout closes the tab and shows "Geen link ontvangen";
  - a non-http(s) value, or one off the row's own site, is never navigated to;
  - `window.open` is called with no `noopener` feature (it would return null), and `opener` is set to null before
    navigating.
- [ ] **Step 2:** implement.
  - `window.open('', '_blank')` happens in the click handler.
  - Set `opener = null` before setting `location`.
  - Poll every 1000 ms, stopping after 30 s or on a failed run.
- [ ] **Step 3:** grid tests, then commit `feat: an action can sit in the drawer header and open what a service hands
  back`.

### Task 3: Studio columns, soorten and actions

**Files:**
- Modify `packages/studio/src/datasets.ts`:
  - `site` gains, all `...worker` unless noted:
    - `plugin` (boolean, default false);
    - `plugin_versie` (text);
    - `db_versie` (text, R1's database version);
    - `admins` (long text, one `login · last login` per line);
    - `bekende_admins` (long text, one login per line; person-editable, added to `STUDIO_COLUMNS` in
      `writers/site.ts:20`, so Stefan can mark an admin known);
    - `core_bestanden` (options ok/afwijkend/onbekend, tones ok/bad/grey);
    - `cron_achterstand` (minutes), `php_fouten`, `uploadmap_mb`, `db_mb` (integer, nullable);
    - `onderhoudsmodus` (boolean).
  - `soorten` gains `plugin_installeren`, `inloggen`, `cache_legen`, `cron_draaien`, `onderhoudsmodus_aan` and
    `onderhoudsmodus_uit`, with Dutch labels.
- Modify `packages/studio/src/writers/actie.ts`:
  - `checkFit` lets `plugin_installeren` and both `onderhoudsmodus_*` take the voorbereiden path;
  - a new check refuses `inloggen` unless the caller is a person with the administrator role.
- Modify `packages/studio/src/actions.ts`:
  - **"Inloggen":** a single-record action on `site`, with `head: { icon: 'log-in' }`, `handoff: true`,
    `when: { plugin: true }`, and `opens` unset. It creates one actie (soort `inloggen`) with one `actie_site`.
  - **The selection actions:** "Studio-plugin installeren" (any site in the registry), "Cache legen", "Cron draaien",
    "Onderhoudsmodus aan" and "Onderhoudsmodus uit".
    - They carry no `when`: a `when` refuses the whole selection when one site misses (`packages/engine/src/actions.ts:180`).
    - Instead, a site without the plugin gets its `actie_site` link pre-skipped as overgeslagen ("Geen studio-plugin"),
      the way a site not in the registry is today (`packages/studio/src/actions.ts:14-15`). The install skips nothing
      here; the worker skips web-only sites.
- Seed: two fixture sites get `plugin: true` and invented admin lines.
- Test `packages/studio/test/plugin.test.ts`.

- [ ] **Step 1 (RED):**
  - each action creates the right actie and links;
  - install and maintenance stop at `voorbereid` until an administrator confirms, and an editor's confirm is refused;
  - inloggen from an editor and from the service is refused;
  - Inloggen is refused 422 `condition_not_met` on a site with `plugin: false`;
  - a cache, cron or maintenance selection where no site has the plugin is refused, as `ALL_GONE` is
    (`packages/studio/src/actions.ts:29`); the install is not;
  - a selection with one site without the plugin creates its link overgeslagen and runs the others;
  - `bun run check` passes with the new column names;
  - a person can write `bekende_admins` but not `admins`.
- [ ] **Step 2:** implement.
- [ ] **Step 3:** `bun test packages/studio`, the gate, then commit `feat(studio): plugin columns, actions and login`.

## Close

Gate → `/feature-review plugin-actions` with security-sentinel (no invariants file in worktable) → one fix pass →
`/shakeout`.
- **Flows:** login-from-drawer, login-times-out, install-asks-bevestigen, cache-runs-straight-away. A fake worker PUTs
  the handoff to a local test page that sits on the fixture site's `adres` origin, so the same-site check passes.
- **Screenshots,** light and dark:
  - the drawer header with the login icon next to "Website openen";
  - a site without the plugin (no icon);
  - the new site columns in the table;
  - the actions under Meer.

Push, then Stefan merges.
