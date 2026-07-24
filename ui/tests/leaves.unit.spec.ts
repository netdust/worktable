import { test, expect } from "@playwright/test";
import { KNOWN_VIEW_TYPES } from "../src/components/folio/ViewRouter";
import { statusCounts } from "../src/components/folio/GroupHeader";
import { splitTags } from "../src/components/folio/FieldCell";
import { decideCardDrop, FLOW_OWNED } from "../src/lib/kanban";
import type { RecordSummary } from "../src/api";

// T02 — pure logic of the folio leaf components: the view-router map is
// exhaustive over the five view types, the distribution counter folds
// no-status into "—", multi_select splitting matches the definition
// parser, and the kanban drop decision seal-gates flow-owned fields.

const rec = (slug: string, fm: Record<string, string>): RecordSummary => ({
  domain: "tasks",
  slug,
  frontmatter: fm,
  artifacts: [],
  reviews: 0,
});

test("view-router enumerates exactly the five view types", () => {
  expect([...KNOWN_VIEW_TYPES].sort()).toEqual([
    "calendar",
    "kanban",
    "list",
    "table",
    "timeline",
  ]);
});

test("statusCounts tallies by status, folding empties into —", () => {
  const counts = new Map(
    statusCounts([
      rec("a", { status: "todo" }),
      rec("b", { status: "todo" }),
      rec("c", { status: "done" }),
      rec("d", {}),
    ]),
  );
  expect(counts.get("todo")).toBe(2);
  expect(counts.get("done")).toBe(1);
  expect(counts.get("—")).toBe(1);
});

test("splitTags accepts bracket and comma list forms", () => {
  expect(splitTags("[a, b, c]")).toEqual(["a", "b", "c"]);
  expect(splitTags("x, y")).toEqual(["x", "y"]);
  expect(splitTags("solo")).toEqual(["solo"]);
  expect(splitTags("")).toEqual([]);
});

test("drop on a flow-owned column opens the record when it awaits a seal", () => {
  const records = [rec("beta", { status: "doing", awaiting_seal: "task" })];
  const action = decideCardDrop({
    groupBy: "status",
    record: "tasks/beta",
    from: "doing",
    to: "done",
    records,
  });
  expect(action).toEqual({ kind: "open", record: "tasks/beta" });
});

test("drop on a flow-owned column with no pending seal notes, never writes", () => {
  const records = [rec("gamma", { status: "done" })];
  const action = decideCardDrop({
    groupBy: "status",
    record: "tasks/gamma",
    from: "done",
    to: "todo",
    records,
  });
  expect(action.kind).toBe("note");
  expect(FLOW_OWNED.has("status")).toBe(true);
});

test("drop on a non-flow field notes 'not saved' (no v2 write endpoint)", () => {
  const action = decideCardDrop({
    groupBy: "lane",
    record: "tasks/alpha",
    from: "a",
    to: "b",
    records: [rec("alpha", { lane: "a" })],
  });
  expect(action.kind).toBe("note");
  if (action.kind === "note") expect(action.message).toContain("not saved");
});

test("drop on the same column (or nowhere) is a noop", () => {
  const base = { groupBy: "status", record: "tasks/alpha", records: [] };
  expect(decideCardDrop({ ...base, from: "todo", to: "todo" }).kind).toBe("noop");
  expect(decideCardDrop({ ...base, from: "todo", to: null }).kind).toBe("noop");
});
