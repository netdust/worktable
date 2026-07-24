import { test, expect } from "@playwright/test";
import { buildMonthGrid, placeDocuments, bucketKey } from "../src/lib/ported/calendar-grid";
import { buildTimeScale, placeOnTimeline } from "../src/lib/ported/timeline-lanes";
import { buildColumns } from "../src/lib/ported/board-grouping";
import { inferFieldType } from "../src/lib/ported/field-infer";
import type { RecordSummary } from "../src/api";

// Unit tests for the ported (folio) view math — T01. Run under the same
// Playwright runner. These verify the carried logic still behaves after
// the worktable adaptation (generic constraints + RecordSummary).

const rec = (slug: string, fm: Record<string, string>): RecordSummary => ({
  domain: "d",
  slug,
  frontmatter: fm,
  artifacts: [],
  reviews: 0,
});

test("calendar: month grid is a stable Monday-start 6x7 (TZ-safe)", () => {
  const grid = buildMonthGrid(2026, 6); // June 2026
  expect(grid).toHaveLength(42);
  // June 1 2026 is a Monday → first cell is in-month day 1
  expect(grid[0]).toEqual({ iso: "2026-06-01", day: 1, inMonth: true });
  expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
});

test("calendar: bucketKey normalizes date/datetime, rejects junk", () => {
  expect(bucketKey("2026-06-10")).toBe("2026-06-10");
  expect(bucketKey("2026-06-10T14:30:00Z")).toBe("2026-06-10");
  expect(bucketKey("not-a-date")).toBeNull();
  expect(bucketKey(42)).toBeNull();
});

test("calendar: placeDocuments buckets by date field, rest unscheduled", () => {
  const r = placeDocuments(
    [rec("a", { due: "2026-06-10" }), rec("b", { due: "" }), rec("c", { due: "2026-06-10" })],
    "due",
  );
  expect(r.byDay["2026-06-10"].map((d) => d.slug)).toEqual(["a", "c"]);
  expect(r.unscheduled.map((d) => d.slug)).toEqual(["b"]);
});

test("timeline: buildTimeScale day/week/month spans the range", () => {
  expect(buildTimeScale("2026-06-01", "2026-06-03", "day")).toHaveLength(3);
  expect(buildTimeScale("2026-06-01", "2026-06-30", "month")).toHaveLength(1);
  expect(buildTimeScale("2026-06-30", "2026-06-01", "day")).toEqual([]); // inverted
});

test("timeline: placeOnTimeline spans start→end, single-date is one column", () => {
  const scale = buildTimeScale("2026-06-01", "2026-06-05", "day");
  const r = placeOnTimeline(
    [rec("span", { start: "2026-06-01", end: "2026-06-03" }), rec("pt", { on: "2026-06-04" })],
    { startField: "start", endField: "end", fallbackField: "on" },
    scale,
  );
  const span = r.placed.find((b) => b.slug === "span")!;
  expect(span.colStart).toBe(0);
  expect(span.colSpan).toBe(3);
  const pt = r.placed.find((b) => b.slug === "pt")!;
  expect(pt.colSpan).toBe(1);
});

test("board: buildColumns groups by frontmatter, keeps declared empty lanes", () => {
  const cols = buildColumns(
    [rec("a", { status: "new" }), rec("b", { status: "final" }), rec("c", { status: "" })],
    "status",
    ["new", "reviewed", "final"], // reviewed is declared but empty
  );
  expect(cols.map((c) => c.value)).toEqual(["new", "reviewed", "final", null]);
  expect(cols.find((c) => c.value === "reviewed")!.records).toEqual([]);
  expect(cols.find((c) => c.value === "new")!.records.map((r) => r.slug)).toEqual(["a"]);
  expect(cols.find((c) => c.value === null)!.records.map((r) => r.slug)).toEqual(["c"]);
});

test("field-infer: recognizes date/datetime/url/image/bool/number", () => {
  expect(inferFieldType("2026-06-10")).toBe("date");
  expect(inferFieldType("2026-06-10T00:00:00Z")).toBe("datetime");
  expect(inferFieldType("https://x.com/a")).toBe("url");
  expect(inferFieldType("https://x.com/a.png")).toBe("image");
  expect(inferFieldType(true)).toBe("boolean");
  expect(inferFieldType(42)).toBe("number");
  expect(inferFieldType("plain")).toBe("string");
});
