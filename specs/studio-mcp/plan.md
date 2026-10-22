# Worktable MCP server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic MCP server, `@worktable/mcp`, that lets a Claude Code session read and write any worktable instance through its REST API with a service account's token. For studio, Claude reads what is on the table, creates requests and tasks, and keeps work packages current.

**Architecture:** A new workspace package, `packages/mcp`, run over stdio by Claude Code. It knows no domain: six tools take source and dataset names as arguments and call the instance's existing REST routes (`/api/schema`, `/api/rows`, `/api/actions`, `/api/revisions`) with `Authorization: Bearer`. No engine change. The boundary and vocabulary checks extend to it, so "knows no domain" is enforced, not promised.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk` (pin the current 1.x release at install and record it), zod (already the engine's), bun:test.

**Spec:** `specs/studio/spec.md`, S18 (S19 and S20 are the worker plan's: the account and its registration). Plan review: `/home/ntdst/Sites/netdust-studio/specs/studio/plan-review.md` (in the private repo: it names real client sites).

**Before this branch:** the S22 scope-lock edit, which names the MCP server "in", is on `main` as one docs commit (see studio-domain's "Before any studio branch"). The branch is cut from `main`. This plan does not need studio-domain merged: it proves itself on the fiche instance.

## Global Constraints

- The MCP server knows no domain word. It imports nothing from `packages/theatre`, `packages/fiche` or `packages/studio` (`scripts/check-boundaries.ts` extended), and holds no domain word (`scripts/check-vocabulary.ts --root packages/mcp`).
- It never offers delete. Studio's writers already refuse what an editor may not do. The MCP adds no second rule set.
- The token is read from a file, never from an argument or an environment variable. It is never echoed, logged or returned.
- It talks only to a loopback instance: `127.0.0.1` or `localhost`, the two hosts the engine's Host allowlist takes (`app.ts:237-244`).
- The gate is `bun run gate`.

## Architecture

**First working version:** Task 1. Against a running fiche instance (the harness's port 4312 command), `bun packages/mcp/src/main.ts --url http://127.0.0.1:4312 --token-file <file>` answers an MCP `tools/call` of `rows` with `source: "fiche"` with its rows. Once studio-domain is merged, the same command on a studio instance lists `site`.

**Simplest design.** The simplest design is one tool per REST route, passing JSON through. That is this plan, with two restrictions:
- no delete
- identifiers validated before they reach a URL

A per-dataset tool list generated from `/api/schema` was considered and rejected. It would put dozens of tools in every Claude session's context, and they would change whenever a domain changes. Six stable tools, plus `schema` to discover names, is smaller and domain-free.

**Tools (the interface the worker plan's registration and Claude's `CLAUDE.md` line rely on):**

| Tool | Input | Calls |
|---|---|---|
| `schema` | none | `GET /api/schema` |
| `rows` | `source` (identifier), `filter?` (object, the engine's FilterInput), `sort?` (string[], `-` for descending), `limit?` (1–engine max), `offset?` | `GET /api/rows/:source?filter=<json>&sort=a,-b&limit&offset` |
| `create` | `dataset`, `values` (object) | `POST /api/rows/:dataset` |
| `update` | `dataset`, `id` (positive integer), `values` (object), `expect?` (object). A lifecycle transition is an update of its column, and a service account must send `expect` with the column's current value (`writes.ts:316-321`); a stale expect comes back as 409 `transition_lost`. | `PATCH /api/rows/:dataset/:id` with `{ ...values, expect }` |
| `action` | `name` (identifier), `id` (positive integer), `input?` (object) | `POST /api/actions/:name` |
| `history` | `dataset`, `id` | `GET /api/revisions/:dataset/:id` |

`history` goes beyond S18's list ("describe the schema, read rows with a filter, create and update rows, run a declared action, ask a transition"). `Ruling: a read-only history tool — why: Claude reads who changed a request or a site before acting on it — cost if wrong: one unused tool.`

Each tool returns the engine's JSON as text content. An engine refusal (4xx) returns `isError: true` with the engine's status and message; it is never thrown as a transport error.

## Threat model

**Assets**
- The service token: editor access to the instance. On studio it can create requests, including bijwerken requests up to voorbereid, write health and work-package rows, and read every client's data.
- The instance's data.

**Attacks**
1. **The token leaks from Claude Code's MCP config** (`~/.claude.json` and project files are read by many tools and backups) → the config carries only `--token-file <path>`. `loadConfig` refuses a token file that group or other can read, or that the running user does not own.
2. **A misconfigured or injected `--url` sends the token to another host** → `loadConfig` refuses any URL whose host is not `127.0.0.1` or `localhost`, or whose scheme is not http/https.
3. **A model-supplied name builds a different path** (`source: "../views"`, `id: "1/../../"`) → the client validates `source`, `dataset` and `name` against `/^[a-z][a-z0-9_]*$/` and `id` as a positive integer before building a URL. It sends `filter` only as `JSON.stringify` in a query parameter.
4. **Prompt-injected text in a row** (a site's notities telling Claude to confirm an update or delete data) → no delete tool exists, and confirmation is refused to every service account by studio's writers (studio-domain). The worst an injected session can do is create requests and write rows an editor may write.
5. **The token surfaces in an error** (a fetch failure printing the request) → `EngineClient` builds errors from status and engine message only, and never includes headers.

**Mitigations (where they live)**
- `packages/mcp/src/config.ts` `loadConfig`: the file mode and owner, and the loopback URL.
- `packages/mcp/src/client.ts` `EngineClient`: identifier and id validation, and errors built without headers.
- `packages/mcp/src/tools.ts` `registerTools`: no delete tool, refusals as `isError`.
- `scripts/check-boundaries.ts` and `check-vocabulary.ts`: no domain imports or words.

**Deferrals**
- Whatever an editor service account may do through the engine is allowed by design. Studio's writers are the rule set.
- Rate limiting is the engine's existing `serviceLimit`.
- Who may run the MCP binary: anyone with the token file, by design. The file's mode is the control.

## Test map

| Unit | Seam | Tests: tier · file · command | E2E flows |
|---|---|---|---|
| Config (token file, URL) | `loadConfig(argv)` | unit · `packages/mcp/test/config.test.ts` · `bun test packages/mcp/test/config.test.ts` | — |
| Tools over the protocol | an MCP `Client` over the SDK's in-memory transport, the server wired to `testEngine(freshDb(), domain)` (`testEngine` from `packages/engine/test/sign-in.ts`; `freshDb`, `domain` from `packages/engine/test/fixture.ts`), its `fetchFn` sending `host: 127.0.0.1:4310` (else 403 `forbidden_host`) | integration · `packages/mcp/test/tools.test.ts` · `bun test packages/mcp/test/tools.test.ts` | mcp-lists-rows (stdio, a real fiche instance; on studio once merged) |
| Domain-free | `bun run check` | none: the boundary and vocabulary checks | — |

## Review Focus

1. **A token file readable by others** is refused at start, with a message naming the file and the fix (`chmod 600`) → row 1 (`config.test.ts`: "a group-readable token file is refused").
2. **A name that is not an identifier** never reaches `fetch` → row 2 (`tools.test.ts`: "a path in a name is refused before any request").
3. **An engine refusal reads as a tool error Claude can act on**, not a crash → row 2 (`tools.test.ts`: "a writer's refusal is isError with its message").
4. **The engine is not running**: a clear tool error ("worktable op <url> antwoordt niet"), not a hang → row 2 (`tools.test.ts`: "an unreachable instance fails fast").
5. **The token in an error**: no tool result, refusal or transport failure contains the token → row 2 (`tools.test.ts`: "the token never appears in a result").
6. **A transition without `expect`** reads as the engine's 400 with its message, so Claude retries with expect → row 2 (`tools.test.ts`: "a transition needs expect").

---

### Task 1: The package, the client and the tools (first working version)

**Files:**
- Create: `packages/mcp/package.json` (`@worktable/mcp`, deps `@modelcontextprotocol/sdk` pinned, `zod`), `packages/mcp/tsconfig.json`
- Create: `packages/mcp/src/client.ts`, `src/tools.ts`, `src/main.ts`
- Test: `packages/mcp/test/tools.test.ts`

**Interfaces:**
- Produces:
  - `class EngineClient { constructor(base: string, token: string, options?: { fetchFn?: typeof fetch; timeoutMs?: number /* default 10000 */ }); get(path: string, query?: Record<string, string>): Promise<Reply>; post(path: string, body: unknown): Promise<Reply>; patch(path: string, body: unknown): Promise<Reply> }`, with `type Reply = { status: number; body: unknown }`
  - `assertIdentifier(name: string): void`
  - `registerTools(server: McpServer, client: EngineClient): void`
  - `main(argv: string[]): Promise<void>`, which starts the stdio transport
- Consumes (tests only): `testEngine` from `packages/engine/test/sign-in.ts`; `freshDb` and `domain` from `packages/engine/test/fixture.ts`; `createService(sqlite, name, role)` from `packages/engine/src/auth.ts` (not re-exported by the engine's index).

- [ ] **Step 1: Write `tools.test.ts`.** An in-memory MCP client is connected to a server whose `EngineClient` fetches through `app.request`, with a Bearer token from `createService(db, 'claude', 'editor')`. The tests:
  - "schema lists the sources": `schema` returns the fixture domain's sources.
  - "rows reads a source with a filter, sort and limit": the returned ids match a direct `GET /api/rows`.
  - "rows reports total and pages with offset".
  - "create then update a row": both answer 2xx; the row reads back changed.
  - "a transition needs expect": on a second engine built on `packages/engine/test/fixtures/lookup-domain.ts`, where `line.phase` declares a lifecycle (open → done for editors), first create a `line` in `open` (a create is not a transition). An update to done with `expect: { phase: 'open' }` → 2xx; without → `isError` with the engine's 400 message; with a stale expect → `isError` 409. The fixture domain in `fixture.ts` declares no lifecycle.
  - "action runs a declared action".
  - "history lists a row's revisions".
  - "a writer's refusal is isError with its message": a fixture refusal comes back with `isError: true` and the engine's message.
  - "a path in a name is refused before any request": `source: '../views'` and `id: 0` give `isError`, and the injected `fetchFn` was not called.
  - "there is no delete tool": `tools/list` names exactly schema, rows, create, update, action, history.
  - "an unreachable instance fails fast": a `fetchFn` that rejects gives `isError` at once. One that never resolves gives `isError` after the client's timeout, set to 50 ms in the test: `EngineClient` races the timeout itself, since a fake ignores the abort signal, and `bun test` stops a test at 5 s.
  - "the token never appears in a result": across every refusal above, and a rejecting `fetchFn` whose error message contains the request, no result text contains the token.

- [ ] **Step 2: Run** `bun test packages/mcp/test/tools.test.ts` and expect FAIL.

- [ ] **Step 3: Implement** `EngineClient`, `assertIdentifier`, `registerTools` (tool input schemas in zod) and `main` (stdio transport; `--url`, `--token-file`; config from Task 2 stubbed to read the file plainly for now).

- [ ] **Step 4: Run** `bun test packages/mcp/test/tools.test.ts`: PASS.

- [ ] **Step 5: See it work.** Start a fiche instance (`bun packages/engine/src/serve.ts --domain @worktable/fiche --db /tmp/fiche.db --port 4312 --fresh`), and create a service with the same command plus `--create-service claude`, minus `--fresh`. Write the printed token to a 0600 file. Pipe `initialize`, then `notifications/initialized`, then a `tools/call` for `rows` with `{ "source": "fiche" }` into `main.ts` over stdio. The fixture rows come back.

- [ ] **Step 6: Commit:** `git commit -m "feat(mcp): a domain-free MCP server over a worktable instance's REST"`

### Task 2: Config hardening

**Files:**
- Create: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/main.ts`
- Test: `packages/mcp/test/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(argv: string[]): { url: string; token: string }`, which throws `ConfigError` with a Dutch message naming the problem and the fix.

- [ ] **Step 1: Write the denial tests first:**
  - "a group-readable token file is refused" (mode 0640 → ConfigError mentioning `chmod 600`)
  - "a token file owned by someone else is refused" (skip when not root-capable; assert via an injected `stat`)
  - "a non-loopback url is refused" (`http://example.test:4313`, `http://10.0.0.5`)
  - "a token on the command line is refused" (`--token abc` → ConfigError)
  - "an empty token file is refused"
  - "loopback urls and a 0600 file pass" (`127.0.0.1`, `localhost`)
  - "`[::1]` is refused": the engine's Host allowlist does not take it

  Run them and expect FAIL.

- [ ] **Step 2: Implement** `loadConfig` and use it in `main`.

- [ ] **Step 3: Run** `bun test packages/mcp/test/config.test.ts`: PASS.

- [ ] **Step 4: Commit:** `git commit -m "feat(mcp): the token comes from a private file and goes only to a loopback instance"`

### Task 3: Boundaries, vocabulary and the gate

**Files:**
- Modify: `scripts/check-boundaries.ts` (also scan `packages/mcp/src`: no import of any `@worktable/*` package, nor a relative path into `packages/`), `package.json` `check` script (add `bun scripts/check-vocabulary.ts --root packages/mcp`)

- [ ] **Step 1: Prove the boundary check bites.** Add a temporary `import '@worktable/fiche'` in `packages/mcp/src/tools.ts`; `bun scripts/check-boundaries.ts` must exit 1 naming the file. Remove the import.
- [ ] **Step 2: Run** `bun run check`: exit 0. Then `bun run gate`: exit 0.
- [ ] **Step 3: Commit:** `git commit -m "chore(mcp): the boundary and vocabulary checks cover the MCP server"`

## Close

As netdust-gates:policy: `bun run gate` → `/feature-review studio-mcp` (security-sentinel joins: the plan carries a threat model) → one fix pass → `/shakeout` drives mcp-lists-rows over real stdio against a real fiche instance → push, and hand Stefan the merge.
