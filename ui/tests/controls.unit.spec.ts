import { test, expect } from "@playwright/test";
import {
  emptyControls,
  encodeControls,
  decodeControls,
  matchesClause,
  applyControls,
  groupRecordsBy,
  controllableFields,
  type ViewControls,
} from "../src/view-controls";
import { projectsOf } from "../src/lib/records";
import type { RecordSummary, ViewListItem } from "../src/api";

// T13/T12 pure logic — the ephemeral filter/group/sort controls and the
// project grouping for the sidebar. No browser needed.

const rec = (slug: string, fm: Record<string, string>): RecordSummary => ({
  domain: "tasks",
  slug,
  frontmatter: fm,
  artifacts: [],
  reviews: 0,
});

test("controls round-trip through the URL codec", () => {
  const c: ViewControls = {
    filters: [
      { field: "status", op: "is", value: "todo" },
      { field: "updated", op: "after", value: "2026-07-20" },
    ],
    group: "area",
    sortKey: "title",
    sortDir: "asc",
  };
  const enc = encodeControls(c);
  const back = decodeControls(enc.group, enc.sort, enc.filters);
  expect(back).toEqual(c);
});

test("empty controls encode to all-null (no URL params)", () => {
  expect(encodeControls(emptyControls())).toEqual({
    group: null,
    sort: null,
    filters: null,
  });
});

test("matchesClause covers every operator", () => {
  const fm = { status: "Todo", title: "Alpha", updated: "2026-07-20" };
  expect(matchesClause(fm, { field: "status", op: "is", value: "todo" })).toBe(true); // case-insensitive
  expect(matchesClause(fm, { field: "status", op: "isnot", value: "done" })).toBe(true);
  expect(matchesClause(fm, { field: "title", op: "has", value: "lph" })).toBe(true);
  expect(matchesClause(fm, { field: "updated", op: "before", value: "2026-07-25" })).toBe(true);
  expect(matchesClause(fm, { field: "updated", op: "after", value: "2026-07-25" })).toBe(false);
  // a missing field: `is` fails, `isnot` passes
  expect(matchesClause(fm, { field: "nope", op: "is", value: "x" })).toBe(false);
  expect(matchesClause(fm, { field: "nope", op: "isnot", value: "x" })).toBe(true);
});

test("applyControls filters (AND) then sorts stably", () => {
  const records = [
    rec("beta", { status: "doing", title: "Beta" }),
    rec("alpha", { status: "todo", title: "Alpha" }),
    rec("delta", { status: "todo", title: "Delta" }),
    rec("gamma", { status: "done", title: "Gamma" }),
  ];
  const filtered = applyControls(records, {
    filters: [{ field: "status", op: "is", value: "todo" }],
    group: null,
    sortKey: "title",
    sortDir: "asc",
  });
  expect(filtered.map((r) => r.slug)).toEqual(["alpha", "delta"]);
});

test("groupRecordsBy mirrors server grouping, empties → —", () => {
  const groups = groupRecordsBy(
    [
      rec("a", { area: "build" }),
      rec("b", { area: "ship" }),
      rec("c", { area: "build" }),
      rec("d", {}),
    ],
    "area",
  );
  expect(groups.map((g) => g.value)).toEqual(["build", "ship", "—"]);
  expect(groups[0].records.map((r) => r.slug)).toEqual(["a", "c"]);
});

test("controllableFields puts status first and dedupes", () => {
  expect(controllableFields(["title", "status", "area"], ["updated", "area"])).toEqual([
    "status",
    "title",
    "area",
    "updated",
  ]);
});

test("projectsOf groups views by their source folder", () => {
  const view = (name: string, source: string, v = "table"): ViewListItem => ({
    name,
    definition: { source, view: v },
  });
  const projects = projectsOf([
    view("dossiers", "records/dossiers"),
    view("tasks-board", "records/tasks", "kanban"),
    view("tasks-list", "records/tasks", "list"),
  ]);
  expect(projects.map((p) => p.label)).toEqual(["Dossiers", "Tasks"]);
  expect(projects[1].views.map((v) => v.name)).toEqual(["tasks-board", "tasks-list"]);
});
