# Feature review: plugin-actions

Reviewed: worktable 79fa663..0808b5e (origin/feature/plugin-actions). Plan specs/plugin-actions/plan.md with Threat model.
Reviewers: superpowers code reviewer (opus), security-sentinel (opus). No ARCHITECTURE-INVARIANTS.md in worktable.

## Consolidated findings (reviewer ruling)

Should fix
- S1 only the producing service may PUT a handoff; adres is written by that service only (sentinel S1, N8).
- S2 expired handoff values are wiped on a timer and at start, not only on traffic (sentinel S2).
- S3 a login link is https only, whatever the row's scheme (sentinel S3).
- S4 the plugin's reads show in a seeded view (code Important 1).

Notes fixed in the same pass: sentinel N1 (GET under the fetch-metadata guard), N2 (no referrer); code Minor 1, 2, 4, 5, 6, 7, 8.
Notes kept: code Minor 3 (an editor sees the icon, gets the Dutch refusal); sentinel N3-N7 hold as stated. N7's worker assertion moves to plugin-worker.

Findings: 0 Blocking · 4 Should fix · 17 Note

---

## Code reviewer report

## Review: feature/plugin-actions (79fa663..0808b5e)

### Strengths
- **The handoff module is small and its trust boundary is narrow** (`packages/engine/src/handoff.ts`):
  - only a service can PUT;
  - the record must be live and in the service's scope;
  - the value must be http(s), checked by the exported `isWebAddress` and never echoed back;
  - the TTL must be from 1 to 120;
  - the first PUT wins through `ON CONFLICT DO NOTHING` inside `BEGIN IMMEDIATE`;
  - only the creator can GET it. The read is a SELECT and then a conditional UPDATE in one immediate transaction. The ledger's reason holds: SQLite `RETURNING` gives the row after the update, so it cannot hand back the old value.
  - The row stays behind as a tombstone, and the sweep only clears values.
  - The 404 is the same in every case.
  - Every response gets no-store headers.
- **The engine stays domain-free:**
  - `handoff` is an engine table, so the generic `/rows`, `/revisions` and openapi routes never serve it;
  - the reserved-name list and SPEC are updated;
  - the migration is additive: `planSteps` creates the new table, and the new NOT NULL `plugin` column has a default, which `schema-diff.ts:60` allows on a table that has rows;
  - ids use AUTOINCREMENT, so a tombstone can never collide with a reused id.
- **`/schema` stays backward compatible.** `head` and `handoff` are optional fields that are added, nothing changes shape. The MCP server passes schema actions through untouched. If the claude account runs `inloggen` through MCP it gets 403 (tested).
- **The tests check real behaviour and assert the denials:**
  - the engine tests use real SQLite and real routes, with sentinel URLs checked against revisions, batches, history, rows and schema;
  - the route matrix has a row for each of the two verbs, by role;
  - the grid tests use fake timers, cover open-before-run, opener-null-before-href ordering, closing on timeout, failure and unmount, and many look-alike hosts (userinfo, subdomain, port, `www.www.`, http on an https row);
  - the e2e drives a real tab with `page.clock` and asserts that the link is in no revision.
- **Head actions compose cleanly with the existing plumbing:**
  - `ActionRow` skips `head` actions;
  - `Grid`/`App` hand `created[0]` back instead of opening the actie;
  - `Selection` is unaffected (head and handoff are refused on selection actions).
- **Studio:**
  - one `bevestigd` list drives both `checkFit` and `actie-site` (closed message, `checkMayRun`);
  - `checkInloggen` sits in the writer, so a plain `POST /rows/actie` is refused as well (tested);
  - a selection with no plugin site is refused, and the install is not (R3-S3 tested).

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **No seeded view shows the new site columns** (`packages/studio/src/seed.ts:218-232`).
   - **What's wrong:** none of the site views lists them in `visible_fields`. `apps/grid/src/engine.ts:359` hides every column a view does not list. So `plugin`, `plugin_versie`, `core_bestanden`, `cron_achterstand`, `php_fouten`, `uploadmap_mb`, `db_mb`, `admins`, `bekende_admins` and `onderhoudsmodus` never appear in the Sites table.
   - **Why it matters:**
     - the plan's Goal says it "shows the plugin's reads as site columns" and spec R9 says "The new reads from R1 become columns on the site";
     - the Close screenshot of "the new site columns in the table" cannot be taken;
     - on the live studio, `--seed-missing` only brings system-owned views up to their declaration, so nothing new will show there either.
   - **Fix:** add the columns Stefan should see (at least `plugin` and `core_bestanden`, plus `plugin_versie` and `cron_achterstand`) to the `Sites` view, or to a new "Studio-plugin" view, then let `--seed-missing` update the live view.

#### Minor (Nice to Have)
1. **A login link can be consumed and then dropped** (`apps/grid/src/grid/HeadActions.tsx:178-193`).
   - **What's wrong:** if the 30 s deadline fires while a `takeHandoff` request is still in flight, and that request takes the value, `over` is already true and the value is thrown away.
   - **Why it matters:** the link is gone on the server and never opened. It is a narrow edge.
   - **Fix:** don't abandon while a request is in flight, or let a value that arrives late still navigate when the tab is open.
2. **Inloggen on a site that has left the registry waits the full 30 s for nothing** (`packages/studio/src/actions.ts`, `inloggen.when`).
   - **What's wrong:** on a site with `plugin: true` and `in_registry: false`, `linkOf` creates the only link already skipped, so the worker never PUTs.
   - **Why it matters:** the click waits 30 s and then says "Geen link ontvangen".
   - **Fix:** `when: { plugin: true, in_registry: true }`.
3. **An editor sees a login icon that cannot work.** `available.actions` does not depend on role, so an editor's click opens a blank tab, gets 403, closes it and shows "Alleen Stefan logt in op een site." This is acceptable, but worth knowing.
4. **The SPEC freeze list is not updated** (`docs/SPEC.md:375`, Shapes). It still reads "actions (with `opens`, `when`)" and should add `head` and `handoff`.
5. **The SPEC Handoff paragraph describes the read wrongly** (`docs/SPEC.md`). It says "clears the value in the same conditional UPDATE", but the code does a SELECT and then an UPDATE in one `BEGIN IMMEDIATE` transaction. Reword it.
6. **`checkHead` allows a head action with required inputs** (`packages/engine/src/validate.ts:659`). `HeadActions` always runs with `{}`. Refuse `head` when `input` is not empty, or document that the run will be refused.
7. **The handoff `value` has no length cap** (`handoff.ts`). The writer is trusted (service only), but a 2 KB cap costs nothing.
8. **Two small test gaps:**
   - nothing asserts the default TTL of 60;
   - no test moves an install or maintenance actie straight from `aangevraagd` to `bezig` (Review Focus 5). The `bevestigd` membership is covered indirectly by the voorbereiden test.

### Declined to judge
- The R9 "Let op" for an unknown admin or a failed core file check: the health logic is plugin-worker's, not this plan's.
- R12's `STUDIO_WRITES` refusal of cache, cron and maintenance: worker side.
- Which service may PUT: any service may, and the claude account could in theory race the worker. The plan accepted this (first PUT wins, plus the grid's same-site check).
- A cross-site GET to `127.0.0.1` consuming a link: the Host check passes for loopback. The worst case is a lost link, never a disclosure, since there is no CORS and the actie id must be known. Outside the plan's threat model.
- A cached old grid bundle showing Inloggen as a body action: it is harmless, because the link expires unread.
- Nine buttons in the selection panel and site row: a design question the ledger already flagged for Stefan.
- The plan's e2e flows install-asks-bevestigen and cache-runs-straight-away are not in the branch. The plan's Close puts them in `/shakeout`, which has not run yet.

### Recommendations
- Fix Important #1 before `/shakeout`; its "new site columns in the table" screenshot depends on it.
- Before moving the live studio's pinned worktree (`~/Sites/worktable-studio`, at 79fa663), dry-run `migrate` on a copy of the live database. The change is additive (one table, columns with defaults), but it is the first migration of this kind on that database.
- Shake-out: add install-asks-bevestigen and cache-runs-straight-away as `@e2e` flows, as the plan's Close lists.

### Assessment
**Ready to merge?** With fixes

**Reasoning:** The handoff boundary, the grid's navigation checks and the inloggen restriction are correct and well tested against real behaviour, and I found nothing security-critical. The one user-facing gap is that the plugin's reads are never shown in the Sites table, which the Goal and R9 require.

---

## security-sentinel report

## Security audit: plugin-actions (79fa663..0808b5e), read-only

I made no changes to any tree and ran no tests. The coder's ledger `.superpowers/sdd/plugin-actions/progress.md` was not in the checkout or in /home/ntdst/Sites/worktable, so I could not read it.

### Executive summary
The mitigations in the plan are mostly where it says, and most of their denials are asserted by tests. The engine side is solid:
- Creator-only read that clears the value.
- An atomic, conditional take inside an IMMEDIATE transaction.
- First PUT wins, with 409.
- http(s)-only values, and error bodies that never echo the value.
- The handoff table is not in `domain.datasets`, so it is absent from /rows, /schema and /revisions.
- The MCP client has no PUT and no generic path, so it cannot reach `/handoff` at all.
- `inloggen` is checked on the server at create time, inside the actie writer, for every route.

There is one structural gap. Attack 3's last line of defence, "the drawer row's own site", is keyed to `site.adres`, a column that any service, including claude, can write. Under the plan's own model (claude may PUT, which is why first-PUT-wins exists), that defence does not hold. I found nothing that blocks merge without that premise.

### Mitigations checked against tests
| Attack | Mitigation location | Denial tested |
|-|-|-|
| 1 another account reads | handoff.ts:100-110, `takeValue` creator-scoped WHERE | handoff.test.ts:86, :70, :79 (parallel) |
| 2 service starts inloggen | actie.ts `checkInloggen` in `create` | plugin.test.ts:142-144 (editor, claude, worker get 403), plus direct POST at :149 |
| 3 plant | handoff.ts:79 service_only, the 409 on ON CONFLICT DO NOTHING, HeadActions.tsx:18 `sameSite` | handoff.test.ts:105, :113, :122, :129, :136; HeadActions.test.tsx:276-336 |
| 4 non-web URL | `isWebAddress` (engine) and `webAddress` (grid) | handoff.test.ts:143; HeadActions.test.tsx:270 |
| 5 lingering | TTL clamp, expiry checked on read, sweep | handoff.test.ts:156-200 |
| 6 history/batch | separate table | handoff.test.ts:230; e2e/studio.spec.ts:1775 |
| 7 Bevestigen | `bevestigd` list in checkFit, checkMayRun, closedMessage | plugin tests (not re-verified line by line) |
| 8 opener | HeadActions.tsx:81 | HeadActions.test.tsx:115 (no features), :143 |

### Blocking
None, on the stated actor model (see the conditional under S1).

### Should fix

**S1. The same-site gate trusts a column that a hostile service controls** (`apps/grid/src/grid/HeadActions.tsx:18`, `OpenLink.tsx` `addressOf`; `packages/studio/src/datasets.ts:62` `adres ... written_by: 'service'`; `packages/studio/src/writers/site.ts:51`, where the only service limits are on `sla` and `naam`).
- **Attack:**
  1. The claude service uses the MCP `update_row` tool to set `site.adres = https://evil.test` (allowed: any service writes worker columns).
  2. It watches `actie` through MCP list_rows for a new `inloggen` record. Ids are sequential, and the record exists as soon as Stefan clicks.
  3. It PUTs `https://evil.test/wp-login.php` with the service token, before the worker's next tick. That beats the worker, which then gets 409.
  4. `sameSite(evil, evil)` passes, and Stefan's tab lands on a credential-phishing page styled as his client's wp-admin.
- Even without step 1, an early PUT is a reliable denial of service on every login.
- **Conditional:** this needs the claude token outside MCP, because MCP has no PUT. If the claude token file is readable by the hijacked Claude Code, which runs as the same uid, the chain works. The plan names "the claude account plants" as a threat it defends against, so its defence should hold under that premise.
- **Fix, either or both:**
  - (a) Bind PUT to the designated producer. Add an engine option or declaration such as `handoff: { from: '<service account id/name>' }`, check it in `putHandoff`, and refuse any other service with 403. Also refuse a PUT on a record that no `handoff: true` action created; today any service can PUT on any record of any dataset (handoff.ts:78-98).
  - (b) Restrict `adres` writes in `siteWriter.update` to the worker account, not every `kind: 'service'`.
- Add a test: "a second service's first PUT is refused", not just "a second PUT is 409".

**S2. Expired values are wiped only when there is traffic** (`handoff.ts:18`, sweep called at :89 and :104 only).
- **Attack:** Stefan clicks, the grid gives up after 30 s, and no other handoff call follows. The unread token stays in the SQLite file and WAL, the nightly restic backup and any `migrate` copy (`migrate.ts:56`). It stays there until the next PUT or GET, which may be days later.
- The site-side token TTL of about 60 s limits the impact. But the plan claims "expired rows are swept", and test :178 only proves the sweep works when a request triggers it.
- **Fix:**
  - Sweep on engine start and on a short interval, for example a `setInterval` in serve, or sweep from the existing request middleware.
  - Consider `PRAGMA secure_delete = ON`, or overwriting with zeros before NULL, so the cleared value does not survive in freed pages.

**S3. A plain-http site accepts the login token over plain http** (`HeadActions.tsx:18-21`).
- An `http://` row takes an `http://` link. A login token for an administrator session then crosses the network in cleartext, and the session cookie for that tab is not Secure.
- **Fix:** require `https:` for the link regardless of the row's scheme, or refuse to show the login button for http rows. A test exists for the https-row downgrade (HeadActions.test.tsx:316), but nothing covers http rows.

### Note

- **N1. GET consumes state but is not covered by the write guard** (`handoff.ts:100`; `write-guard.ts` runs only on POST/PUT/PATCH/DELETE). The session cookie is SameSite=Lax (`auth.ts:208`). A page on `localhost:<any port>` or `127.0.0.1:<other port>` counts as same-site, and its `<img src=http://127.0.0.1:PORT/api/handoff/actie/N>` sends Stefan's cookie, passes the Host check and burns the value. CORS stops it from reading the value, so this is denial of service only. Fix: apply the `sec-fetch-site` check (refuse same-site and cross-site) to `/handoff/*` GET, or make the take a POST.
- **N2. Referrer.** `tab.location.href = …` (HeadActions.tsx:82) sends the studio URL (127.0.0.1:5173/…#record) as Referer to the client site. This is harmless but avoidable: write into the blank tab `<meta name="referrer" content="no-referrer">` first, or navigate with `tab.location.replace` after setting the referrer policy.
- **N3. URL parsing is sound.** The grid navigates to the parsed `target.href`, so there is no parser differential.
  - Userinfo: `https://site@evil` resolves to host evil and is refused (tested). `https://evil@site` goes to site, which is harmless.
  - Backslashes are normalised as `/` by WHATWG URL for special schemes.
  - IDN is punycoded on both sides.
  - A trailing dot (`site.test.`) fails closed.
  - Default ports normalise to `''`.
  - `www.` is stripped once (`www.www.` is refused, tested).

  Residual risk: any path on the host passes, which matters for subdirectory or shared-host installs. The `www.` twin is trusted even if it is hosted elsewhere (a CNAME to a third party).
- **N4. `head`/`handoff` validation** (`validate.ts` `checkHead`) refuses both on selection actions, refuses unknown icons, and refuses `handoff` set to anything but `true`. `actionsOn` serves them only on single actions. It does not require `head` when `handoff` is set. That is harmless, because the grid only renders head actions.
- **N5. inloggen on the server.** The check is in `actieWriter.create`, so it applies to the action route and to direct `POST /rows/actie` alike. `checkFixed` stops someone changing an existing actie's `soort` to `inloggen`. Undo or restore keeps the original creator, because `creatorOf` reads the first CREATED revision. Link actors live in the same `account` id space, so their ids cannot collide with Stefan's.
- **N6. Race and transaction.**
  - `takeValue` does SELECT then a conditional UPDATE in one `.immediate()` transaction, and checks `changes === 1`. That is correct.
  - PUT runs its sweep and `INSERT … ON CONFLICT DO NOTHING` in one IMMEDIATE transaction. That is correct.
  - A GET before the PUT returns 404, and the grid retries.
  - The grid refuses an off-site link only after the server has already cleared it. That is intended single use.
- **N7. Leaks.**
  - The bad-URL, bad-body and 409 messages are constants (tested: no echo).
  - `root.onError` logs only non-ApiError exceptions, and a SQLite error here would not contain the value.
  - The grid test (:338) asserts no console or page leak.
  - Not verifiable here: the worker (netdust-studio) must not log the URL or write it to `actie_site.resultaat`. Give the worker plan its own assertion.
- **N8.** Services may PUT on any dataset's records (any record in scope, not just `actie`). Each such PUT leaves a permanent tombstone that blocks a later legitimate handoff on that record. S1(a) fixes this too.

### Remediation order
1. S1: bind PUT to the producer account and to records from a handoff action; restrict `adres` writes.
2. S2: sweep on a timer or at startup.
3. S3: https-only links.
4. N1: fetch-metadata check on GET.
5. N2: no-referrer.

Files: /tmp/claude-1000/-home-ntdst/21492ae9-c97f-4b82-a587-e4da30af3746/scratchpad/review-pa-0808b5e/packages/engine/src/handoff.ts, /tmp/claude-1000/-home-ntdst/21492ae9-c97f-4b82-a587-e4da30af3746/scratchpad/review-pa-0808b5e/apps/grid/src/grid/HeadActions.tsx, /tmp/claude-1000/-home-ntdst/21492ae9-c97f-4b82-a587-e4da30af3746/scratchpad/review-pa-0808b5e/packages/studio/src/writers/site.ts, /tmp/claude-1000/-home-ntdst/21492ae9-c97f-4b82-a587-e4da30af3746/scratchpad/review-pa-0808b5e/packages/studio/src/datasets.ts, /tmp/claude-1000/-home-ntdst/21492ae9-c97f-4b82-a587-e4da30af3746/scratchpad/review-pa-0808b5e/packages/engine/src/write-guard.ts
