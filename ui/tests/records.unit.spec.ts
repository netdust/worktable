import { test, expect } from "@playwright/test";
import {
  parseList,
  columnsOf,
  groupRecords,
  orderArtifacts,
  statusColor,
} from "../src/lib/records";
import type { RecordSummary, FlowDef } from "../src/api";

// Pure-module unit tests (T07) — no browser needed, but run under the
// same Playwright runner. These are the framework-free helpers.

test("parseList accepts every view-definition form", () => {
  expect(parseList("[a, b]")).toEqual(["a", "b"]);
  expect(parseList("a, b")).toEqual(["a", "b"]);
  expect(parseList("updated desc")).toEqual(["updated", "desc"]);
  expect(parseList("a")).toEqual(["a"]);
  expect(parseList(undefined)).toEqual([]);
});

test("columnsOf drops the title (it is the link column)", () => {
  expect(columnsOf({ columns: "[title, status, updated]" }).map((c) => c.key)).toEqual([
    "status",
    "updated",
  ]);
});

test("groupRecords maps grouped slugs back to records in order", () => {
  const recs: RecordSummary[] = [
    { domain: "d", slug: "a", frontmatter: { status: "new" }, artifacts: [], reviews: 0 },
    { domain: "d", slug: "b", frontmatter: { status: "final" }, artifacts: [], reviews: 0 },
  ];
  const groups = [
    { value: "final", records: ["b"] },
    { value: "new", records: ["a"] },
  ];
  const out = groupRecords(recs, groups, "status");
  expect(out.map((g) => g.value)).toEqual(["final", "new"]);
  expect(out[0].records[0].slug).toBe("b");
});

test("groupRecords with no group_by yields one implicit group", () => {
  const recs: RecordSummary[] = [
    { domain: "d", slug: "a", frontmatter: {}, artifacts: [], reviews: 0 },
  ];
  const out = groupRecords(recs, [], undefined);
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeNull();
});

test("orderArtifacts follows flow out: order, extras by name", () => {
  const flow: FlowDef = {
    flow: "d",
    nodes: [
      { id: "r", out: ["research.md"] },
      { id: "w", out: ["dossier.md"] },
    ],
  };
  expect(orderArtifacts(["dossier.md", "extra.md", "research.md"], flow)).toEqual([
    "research.md",
    "dossier.md",
    "extra.md",
  ]);
  // no flow → alphabetical
  expect(orderArtifacts(["b.md", "a.md"], null)).toEqual(["a.md", "b.md"]);
});

test("statusColor is stable and contrasting", () => {
  const a = statusColor("final");
  const b = statusColor("final");
  expect(a).toEqual(b);
  expect(a.bg).not.toEqual(a.fg);
  // unknown status still yields a color, deterministically
  expect(statusColor("weird-one")).toEqual(statusColor("weird-one"));
});
