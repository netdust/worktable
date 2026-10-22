# Shake-out: studio-mcp

Driven 2026-10-22 on `feature/studio-mcp` at 5ae2613, the fix pass's last commit. Row 6 failed there; it was fixed in e22c2b5 and re-driven at e22c2b5, and the e2e and smoke entries were re-run there. The shake-out adds tests and this file, no product code.

The artifact is the MCP binary, `bun packages/mcp/src/main.ts --url http://127.0.0.1:<port> --token-file <absolute path, mode 0600>`. It was spawned the way Claude Code spawns it and spoken to in JSON-RPC lines over its real stdin and stdout, against a real `packages/engine/src/serve.ts`.

- **The hand drive** ran on the fiche domain on port 4312, under the machine-wide e2e lock, which it held 14:08:50 to 14:09:04 and 14:12:19 to 14:12:24.
  - The service account was created after "engine listening", with the same command plus `--create-service claude` and without `--fresh`.
  - The driver, the db, the secret files and the log stay in the session scratchpad, outside the repo.
  - 59 of 59 checks passed; a dry run on port 47391 under the same lock gave the same 59.
- **The committed flow** is `packages/mcp/test/instance.test.ts`, run with `bun test packages/mcp/test/instance.test.ts -t "mcp-lists-rows"`. It serves the engine's own fixture domain (`packages/engine/test/fixtures/serve-domain.ts`) through serve.ts, on a free port of its own and never a harness port, with a link-secret file and a files dir in a temp dir.

There is no browser surface. The server has no UI, so every row is `wire` and there are no screenshots.

**Flows.** The plan's Test map names one E2E flow, mcp-lists-rows, and row 1 is that flow. Rows 2 to 16 are its edges, from the edge classes: empty, denied actor, re-entry, concurrent, boundary, mid-flow failure and delivery seam. They also cover the threat model's start-up refusals and token checks, which the brief asked for. Quotes are the real outputs, trimmed with an ellipsis.

| # | Flow | Layer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | mcp-lists-rows: `rows` with `source: "fiche"` through the real binary lists the seeded fiches; the query `zichtbare_fiches` lists the visible ones | wire | pass | Port 4312: `{"rows":[{"id":1,"titel":"Crisisopvang De Haven","type":"hulp","gemeente":"Voorbeeldstad",…},…],"total":5}`, titels Crisisopvang De Haven, Praatcafe Voorbeeld, Vroegsignaal Testdorp, Buurtpunt Proefhoven, Oud aanbod Nergens. `zichtbare_fiches` answered total 4, the verborgen fiche left out. Test: instance.test.ts "the binary over stdio lists a dataset's rows and a query's rows from a real instance" |
| 2 | tools/list names the six tools and no delete | wire | pass | `["action","create","history","rows","schema","update"]`. The rows description ends "It answers 100 rows unless limit says otherwise: page with offset while offset + rows < total." Test: smoke.test.ts "mcp-boots @smoke: the binary over stdio offers the six tools and no delete"; tools.test.ts "there is no delete tool" |
| 3 | schema names the sources the other tools take | wire | pass | `{"sources":{"fiche":{"kind":"dataset","label":"Fiches","icon":null,"title":"titel",…` with sources fiche and zichtbare_fiches, isError false. Test: instance.test.ts "schema names the sources rows reads" |
| 4 | Boundary: rows with filter, sort, limit and offset, paged against total | wire | pass | Filter `{"type":"preventie"}` with sort `["-prioriteit","titel"]` answered Praatcafe Voorbeeld, Buurtpunt Proefhoven, total 2. Limit 1 at offsets 0, 1 and 2 answered one row, one row, then `{"rows":[],"total":2}`, total 2 on every page, and the pages joined equal the whole answer. `{"prioriteit":{"$gte":5}}` answered 4 rows in the order 20, 10, 5, 5. An `$or` of two gemeenten answered 2. Test: instance.test.ts "filter and sort narrow the rows, and limit and offset page them against total" |
| 5 | Empty: a filter that matches nothing | wire | pass | `{"gemeente":"Nergensland"}` answered `{"rows":[],"total":0}`, isError false. Test: instance.test.ts "a filter that matches nothing is an empty page, not an error" |
| 6 | Boundary: rows with `$like`, which the tool's description offers, written with the SQL wildcard a model will use | wire | pass | **Fixed in e22c2b5, re-driven at e22c2b5 on port 4312** (a fresh fiche instance, the real binary, under the e2e lock 14:38:34 to 14:38:35). Engine requests were counted from the service account's own rate_limit rows before and after each call. `rows {"source":"fiche","filter":{"titel":{"$like":"%Haven%"}}}` now answers isError `$like matches a substring, case-insensitive, and % matches itself: drop the % wildcards`, with 0 engine requests. `{"$like":"Haven"}` answers total 1, Crisisopvang De Haven, with 1 request. `{"$nlike":"%Haven%"}` answers isError `$nlike matches a substring, case-insensitive, and % matches itself: drop the % wildcards`, with 0 requests; `{"$nlike":"Haven"}` answers total 4, with 1 request. A `%` inside an `$or` branch (`{"titel":{"$like":"Haven%"}}` beside `{"gemeente":"Testdorp"}`) is refused with the same `$like` message, with 0 requests. tools/list's filter description now ends `$like and $nlike match a substring, case-insensitive: % and _ are not wildcards`. Left as is: `{"$like":"Ha_en"}` answers total 0, not a refusal. The description names `_`, and refusing it would refuse real values that hold an underscore. **The finding, at 5ae2613:** `{"titel":{"$like":"%Haven%"}}` answered isError false and `{"rows":[],"total":0}`, while `"Haven"` answered total 1. `$nlike "%Haven%"` answered total 5, excluding nothing. In the drive, `"Reeks 00%"` answered total 0 while Reeks 001 to Reeks 009 existed. Cause: the engine's `$like` is a case-insensitive contains match that escapes % and _ (packages/engine/src/filter.ts:84-89, by design), and the rows tool's description named `$like` and `$nlike` only, so a Claude session got a silent empty page. The repro went RED as a plain test on its toEqual (expected ["een","twee"], received []). Test: instance.test.ts "a $like with SQL wildcards finds the rows or is refused, never an empty page", a plain `test` since e22c2b5 and green; tools.test.ts gained the refusal cases in the same commit |
| 7 | Boundary: the 100-row default, paging past it, the engine's limit bounds | wire | pass | 100 creates through `create` (0 refused). Then `rows` with no limit answered 100 rows (22,593 characters) and total 106. Offset 100 answered the last 6, Reeks 095 to Reeks 100. Limit 5000 answered all 106. Limit 5001 answered isError `{"status":400,"code":"bad_limit","message":"limit must be an integer from 1 to 5000"}`. Test: instance.test.ts "with no limit it answers 100 rows, and total says there are more" |
| 8 | Concurrent: calls in flight together on one session, as Claude Code sends parallel tool calls | wire | pass | Five `rows` calls, sent before any answer came back, at limit 1, offsets 0 to 4, sorted by id. Each got its own page: ids [1,2,3,4,5]. Test: instance.test.ts "calls in flight together each get their own page" |
| 9 | Delivery seam: create, then update, read back changed, then history | wire | pass | Fiche's writer lets the editor service write. Create answered `{"id":6,"titel":"Proefpunt Shakeout",…,"revision":{…,"changed":["titel","type","gemeente","postcode","prioriteit","verborgen"]},"notices":[]}`. Update `{"prioriteit":7,"gemeente":"Proefhoven"}` answered changed `["gemeente","prioriteit"]`. Rows filtered on id 6 read back prioriteit 7 and gemeente Proefhoven. History listed the create's fields and the update, actor_id 1. Test: instance.test.ts "a created row, updated, reads back changed, history lists both, and a refusal says why" |
| 10 | A writer's refusal reads as a tool error Claude can act on | wire | pass | Create with postcode "12" answered isError `{"status":422,"code":"refused","message":"Postcode moet vier cijfers hebben."}`. Update with titel "" answered isError `{"status":422,"code":"refused","message":"Titel is verplicht."}`. Test: instance.test.ts "a created row, updated, reads back changed, history lists both, and a refusal says why" (project Beta's refusal); tools.test.ts "a writer's refusal is isError with its message" |
| 11 | Refused names: a path, an unknown source, an undeclared action, an uppercase name, id 0 | wire | pass | `source: "../views"` answered `"../views" is not an identifier: lowercase letters, digits and _, starting with a letter`, and no request was sent. `source: "onbekend"` answered `{"status":404,"code":"unknown_source","message":"unknown source \"onbekend\""}`. Action `publiceer` answered `{"status":404,"code":"unknown_action",…}`. Dataset `Fiche` was refused as not an identifier. Id 0 answered `0 is not a record id: an integer from 1`. Test: instance.test.ts "a source the instance does not know, or a path for a name, is a refusal Claude can read"; tools.test.ts "a path in a name is refused before any request" |
| 12 | Denied actor: a wrong, a rotated and a disabled service token | wire | pass | A wrong token answered isError `{"status":401,"code":"unauthenticated","message":"the instance refused the service token (rotated or disabled?)"}`. After `--rotate-service`, the running session got the same 401 message, and a new session on the new token read. Test: instance.test.ts "a rotated token reads as refused, and a session on the new one reads" and "a disabled service reads as refused"; tools.test.ts "a refused token reads as a refused service token" |
| 13 | Mid-flow failure and re-entry: the instance stops mid-session, then comes back | wire | pass | With the engine killed, `rows` answered isError `worktable at http://127.0.0.1:4312 does not answer` in 2 ms, and a `create` answered the same. serve.ts was restarted without `--fresh`, and the same MCP session read again: total 106, rows kept. Test: instance.test.ts "a stopped instance fails fast, and the same session reads again once it is back" |
| 14 | Loopback only: localhost is sent to 127.0.0.1, and an environment proxy is never used | wire | pass | `--url http://localhost:4312` read total 106. HTTP_PROXY, http_proxy and HTTPS_PROXY pointed at a recording server; `rows` still read total 106, and the proxy saw 0 requests. Test: config.test.ts "localhost is taken and sent to 127.0.0.1, which the engine binds"; stdio.test.ts "an environment proxy never carries the request" |
| 15 | Start-up refusals: each exits 1 with stdout empty and one stderr line that holds no token | wire | pass | A 0640 token file: `token file <scratch>/token-0640 is accessible by group or others: chmod 600 <scratch>/token-0640`. `--url` on example.test, 10.0.0.5 or [::1]: `--url points at another host: it must be http(s) on 127.0.0.1 or localhost`. A url with userinfo, the real secret in its password slot, answered `--url carries credentials: …`. An ftp url: `--url has another scheme: …`. The real secret pasted as --token-file: `--token-file must be an absolute path; usage: main.ts --url <instance> --token-file <file>`. Pasted as the url's host: `--url points at another host: …`. Passed with --token, it answered `pass the token in a file with --token-file, never as --token`. As an option name: `unknown option; usage: …`. As a positional: `unexpected positional argument; usage: …`. A relative token file: `--token-file must be an absolute path; …`. No arguments: `--url and --token-file are required; …`. Test: config.test.ts (the loadConfig refusals) and stdio.test.ts "a token pasted into the wrong slot never reaches stderr" |
| 16 | The token never surfaces | wire | pass | Every MCP session's stdout and stderr, every refusal's stdout and stderr, and the engine's stdout and stderr were captured: 39 streams. The real token, the wrong one and the rotated one appear in none of them, and the drive log holds none. Test: instance.test.ts "no answer of the session held a token"; tools.test.ts "the token never appears in a result"; stdio.test.ts "a token pasted into the wrong slot never reaches stderr" |

Hunt: 3 charters · 1 confirmed · 0 not ours · 2 rejected

The hunt ran over the wire on the hand drive's fiche instance on port 4312. It took about 36 tool calls and CLI actions, plus a 583-call rate-limit loop.

**Charter 1, odd input:** rows and update from a model that gets the shapes wrong, in 21 calls.
- A filter or sort sent as a string, limit "10", 0 or 2.5, offset -1, a missing source, and id "3" or 1.5 each came back isError, as `MCP error -32602: Input validation error: … at <field>`, naming the field.
- These came back as the engine's 400 with its message: an unknown filter key, an unknown sort column, a sort that names a column twice, `$regex`, and an expect on a column without a lifecycle.
- Id -1 was refused before any request. Id 999999 got the engine's 404 unknown_record. A SQL-shaped postcode value matched nothing.
- `$like` with `%` matched nothing: confirmed, row 6, fixed in e22c2b5.

**Charter 2, numbers and copy:** totals and text, in 11 calls.
- A 4,000-character titel of accents and emoji round-tripped.
- Fiche answered total 108 against zichtbare_fiches 107, one fiche verborgen, and a boolean filter found the hidden one.
- Custom fields came back whole.
- Five `$like` and `$nlike` probes are row 6's repro.

**Charter 3, error paths:** a rotation mid-session, then the rate limit.
- The running session read the 401 message after `--rotate-service`, and a new session on the new token read.
- After 583 schema calls within a minute, the service got isError `{"status":429,"code":"rate_limited","message":"Too many requests; try again later"}`.

rejected: a create that names an undeclared column (kleur) succeeds and stores nothing for it. This is the engine's design: writes.ts encodeAll keeps declared columns only. The answer returns the stored row and its changed list, so Claude can see the drop.

rejected: a sort entry with a comma inside (titel,-id) becomes two sort keys. The wire format joins sort with commas, and the engine validates each key, so it still sorts only on real columns.

## The registry

`specs/CHECKS.md` has two rows for the surface "MCP server (stdio)", first feature studio-mcp, verified at e22c2b5 on 2026-10-22. Its header now says MCP rows run with `bun test`.

- **e2e:** `bun test packages/mcp/test/instance.test.ts -t "mcp-lists-rows"`, run under the describe "mcp-lists-rows @e2e". It holds 13 tests, the `$like` repro among them, a plain `test` since e22c2b5. It writes, and only on the instance it starts itself.
- **smoke:** `bun test packages/mcp/test/smoke.test.ts -t "mcp-boots"`. The smoke is meaningful here even though the e2e starts its own instance.
  - It starts the shipped binary over stdio and asserts that tools/list names exactly the six tools.
  - It is read-only and needs no instance: tools/list calls none, the url is never dialled, and the token file holds an invented string, not an account's token.
  - It is the first thing a Bun or MCP SDK update would break.

`scripts/check-checks.ts` validates only `bunx playwright` rows, and still exits 0.

## Bite check

The flows' tests were checked by breaking the code they guard, then restoring it with `git checkout`; packages/mcp/src was clean after each.

- **Hand-break 1:** `rows` calls `/api/row/` instead of `/api/rows/`. The e2e entry went 3 pass, 7 fail, exit 1. Each failure was RED on `expect(result.isError).toBe(false)`, expected false, received true.
- **Hand-break 2:** the 100-row default is dropped, so no limit is sent and the engine's 5000 applies. "with no limit it answers 100 rows" went RED: expected length 100, received length 101.
- **Hand-break 3:** the rows tool is registered as `row`. The smoke went RED on its toEqual: "rows" expected, "row" received.
- **The guards that need no new break.** Each already has a test that goes red if it breaks:
  - the token file's mode and owner: config.test.ts;
  - localhost sent to 127.0.0.1: config.test.ts;
  - NO_PROXY: stdio.test.ts;
  - identifiers checked before a URL is built: tools.test.ts and instance.test.ts;
  - the 401 message: instance.test.ts and tools.test.ts;
  - a timed-out write that may have landed: tools.test.ts.
