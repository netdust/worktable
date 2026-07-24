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
  // awaiting_seal is what a real gate-then-status --seal writes when it
  // parks the record at the human node — NOT a hand-authored field.
  // Its value (dossier) is the seal name gate-seal checks.
  writeFileSync(
    join(demo, "item.md"),
    `---\ntype: dossier\nstatus: reviewed\nrun: r-e2e\nflow: dossier\n` +
      `awaiting_seal: dossier\ncreated: 2026-07-24\nupdated: 2026-07-24\n` +
      `title: Demo Dossier\n---\n\nThis is the cover body.\n`,
  );
  writeFileSync(join(demo, "research.md"), "# research\n\nsourced findings\n");
  writeFileSync(join(demo, "dossier.md"), "# dossier\n\n## Summary\n\nok\n");
  mkdirSync(join(demo, "reviews"), { recursive: true });
  writeFileSync(join(demo, "reviews", "dossier.md"), "VERDICT: CLEAN\n");

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

  // A second domain (tasks) with dated records, so the kanban,
  // calendar, and timeline views each have real data to render:
  // status lanes, `due` dates in July 2026, and start/end spans.
  const task = (
    slug: string,
    fm: Record<string, string>,
  ) => {
    const dir = join(FIXTURE_DIR, "records", "tasks", slug);
    mkdirSync(dir, { recursive: true });
    const body = Object.entries({ type: "task", ...fm })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    writeFileSync(join(dir, "item.md"), `---\n${body}\n---\n\n${slug} body\n`);
  };
  task("alpha", {
    status: "todo", title: "Alpha task", updated: "2026-07-20",
    start: "2026-07-06", end: "2026-07-10", due: "2026-07-08",
  });
  task("beta", {
    status: "doing", title: "Beta task", updated: "2026-07-21",
    start: "2026-07-13", end: "2026-07-17", due: "2026-07-15",
    // parked at a human node: dragging its card (flow-owned status)
    // must open the record's seal, never write the field (A03/R08).
    awaiting_seal: "task", flow: "task",
  });
  task("gamma", {
    status: "done", title: "Gamma task", updated: "2026-07-22",
    start: "2026-07-20", end: "2026-07-24", due: "2026-07-22",
  });
  task("delta", {
    status: "todo", title: "Delta task", updated: "2026-07-19",
    due: "2026-07-08", // single-date: no start/end, timeline uses fallback
  });

  const board = `---\ntype: view\nview: kanban\nsource: records/tasks\n` +
    `group_by: status\nlanes: [todo, doing, done]\nsort: updated desc\n---\n`;
  writeFileSync(join(views, "tasks-board.md"), board);
  const cal = `---\ntype: view\nview: calendar\nsource: records/tasks\n` +
    `date_field: due\nsort: due asc\n---\n`;
  writeFileSync(join(views, "tasks-calendar.md"), cal);
  const tl = `---\ntype: view\nview: timeline\nsource: records/tasks\n` +
    `start_field: start\nend_field: end\ndate_field: due\nsort: start asc\n---\n`;
  writeFileSync(join(views, "tasks-timeline.md"), tl);

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
