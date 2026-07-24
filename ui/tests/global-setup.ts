import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR, API_PORT, TOKEN, NETDUST_FLOW } from "./fixture";

// Build the fixture folder + boot the real worktable server. The
// server PID is stashed for teardown. Runs once before the suite.
export default async function globalSetup() {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
  const demo = join(FIXTURE_DIR, "records", "dossiers", "demo");
  mkdirSync(demo, { recursive: true });
  writeFileSync(
    join(demo, "item.md"),
    `---\ntype: dossier\nstatus: reviewed\nrun: r-e2e\nflow: dossier\n` +
      `seal_node: approve\ncreated: 2026-07-24\nupdated: 2026-07-24\n` +
      `title: Demo Dossier\n---\n\nThis is the cover body.\n`,
  );
  writeFileSync(join(demo, "research.md"), "# research\n\nsourced findings\n");
  writeFileSync(join(demo, "dossier.md"), "# dossier\n\n## Summary\n\nok\n");

  const done = join(FIXTURE_DIR, "records", "dossiers", "shipped");
  mkdirSync(done, { recursive: true });
  writeFileSync(
    join(done, "item.md"),
    `---\ntype: dossier\nstatus: final\ncreated: 2026-07-24\n` +
      `updated: 2026-07-25\ntitle: Shipped One\n---\n`,
  );

  const views = join(FIXTURE_DIR, "views");
  mkdirSync(views, { recursive: true });
  writeFileSync(
    join(views, "dossiers.md"),
    `---\ntype: view\nview: table\nsource: records/dossiers\n` +
      `group_by: status\ncolumns: [status, updated]\nsort: updated desc\n---\n`,
  );

  const flows = join(FIXTURE_DIR, "flows");
  mkdirSync(flows, { recursive: true });
  writeFileSync(
    join(flows, "dossier.json"),
    JSON.stringify({
      flow: "dossier",
      nodes: [
        { id: "research", kind: "agent", out: ["research.md"] },
        { id: "draft", kind: "agent", out: ["dossier.md"] },
      ],
    }),
  );

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: FIXTURE_DIR });
  git("init", "-qb", "main");
  git("config", "user.email", "e2e@test");
  git("config", "user.name", "e2e");
  git("add", "-A");
  git("commit", "-qm", "fixture");

  const srv = spawn("python3", [join(NETDUST_FLOW, "..", "worktable", "server.py")], {
    env: {
      ...process.env,
      WORKTABLE_TOKEN: TOKEN,
      WORKTABLE_ROOT: FIXTURE_DIR,
      WORKTABLE_PORT: String(API_PORT),
      WORKTABLE_NETDUST_FLOW: NETDUST_FLOW,
    },
    stdio: "ignore",
    detached: true,
  });
  (globalThis as Record<string, unknown>).__srvPid = srv.pid;

  // wait for the server to answer
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${API_PORT}/views`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("worktable server did not start");
}
