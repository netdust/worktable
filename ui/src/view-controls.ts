// view-controls.ts — the client-side filter / group / sort layer that
// sits above every view (folio's shared control bar). These controls are
// EPHEMERAL: they live in the URL and act on the records the view already
// loaded — no file is written (the seal stays the only write). A view's
// own frontmatter (group_by, sort, columns) is the default; a control
// overrides it for this session only.
import type { RecordSummary } from "./api";
import { bucketKey } from "./lib/ported/calendar-grid";

export type FilterOp = "is" | "isnot" | "has" | "before" | "after";
export const FILTER_OPS: FilterOp[] = ["is", "isnot", "has", "before", "after"];

export interface FilterClause {
  field: string;
  op: FilterOp;
  value: string;
}

export interface ViewControls {
  filters: FilterClause[];
  group: string | null; // overrides the view's group_by; null = view default
  sortKey: string | null; // overrides the view's sort; null = server order
  sortDir: "asc" | "desc";
}

export function emptyControls(): ViewControls {
  return { filters: [], group: null, sortKey: null, sortDir: "desc" };
}

// ── URL codec ────────────────────────────────────────────────────────
// group → `g`, sort → `s` = "field.dir", filters → `flt` = clauses joined
// by "~", each "field|op|value". Compact and human-legible in the bar.
export function encodeControls(c: ViewControls): {
  group: string | null;
  sort: string | null;
  filters: string | null;
} {
  return {
    group: c.group || null,
    sort: c.sortKey ? `${c.sortKey}.${c.sortDir}` : null,
    filters: c.filters.length
      ? c.filters.map((f) => `${f.field}|${f.op}|${f.value}`).join("~")
      : null,
  };
}

export function decodeControls(
  group: string | null,
  sort: string | null,
  filters: string | null,
): ViewControls {
  const c = emptyControls();
  if (group) c.group = group;
  if (sort) {
    const dot = sort.lastIndexOf(".");
    if (dot > 0) {
      c.sortKey = sort.slice(0, dot);
      c.sortDir = sort.slice(dot + 1) === "asc" ? "asc" : "desc";
    }
  }
  if (filters) {
    for (const raw of filters.split("~")) {
      const parts = raw.split("|");
      if (parts.length === 3 && parts[0] && FILTER_OPS.includes(parts[1] as FilterOp)) {
        c.filters.push({ field: parts[0], op: parts[1] as FilterOp, value: parts[2] });
      }
    }
  }
  return c;
}

// ── predicates ───────────────────────────────────────────────────────
export function matchesClause(
  fm: Record<string, string>,
  clause: FilterClause,
): boolean {
  const raw = fm[clause.field];
  const val = clause.value;
  switch (clause.op) {
    case "is":
      return (raw ?? "").toLowerCase() === val.toLowerCase();
    case "isnot":
      return (raw ?? "").toLowerCase() !== val.toLowerCase();
    case "has":
      return (raw ?? "").toLowerCase().includes(val.toLowerCase());
    case "before": {
      const a = bucketKey(raw);
      const b = bucketKey(val) ?? val;
      return a !== null && a < b;
    }
    case "after": {
      const a = bucketKey(raw);
      const b = bucketKey(val) ?? val;
      return a !== null && a > b;
    }
    default:
      return true;
  }
}

// Filter (AND across clauses) then sort. Order is preserved when no sort
// override is set (the server already sorted per the view definition).
export function applyControls(
  records: RecordSummary[],
  controls: ViewControls,
): RecordSummary[] {
  let out = records.filter((r) =>
    controls.filters.every((c) => matchesClause(r.frontmatter, c)),
  );
  if (controls.sortKey) {
    const key = controls.sortKey;
    const dir = controls.sortDir === "asc" ? 1 : -1;
    // stable sort: decorate with index so equal keys keep input order
    out = out
      .map((r, i) => ({ r, i }))
      .sort((x, y) => {
        const a = String(x.r.frontmatter[key] ?? "");
        const b = String(y.r.frontmatter[key] ?? "");
        const cmp = a.localeCompare(b);
        return cmp !== 0 ? cmp * dir : x.i - y.i;
      })
      .map((d) => d.r);
  }
  return out;
}

// Client-side grouping (mirrors the server's resolve_view grouping) so a
// filtered set regroups correctly. Preserves first-seen value order.
export function groupRecordsBy(
  records: RecordSummary[],
  field: string,
): { value: string; records: RecordSummary[] }[] {
  const seen = new Map<string, RecordSummary[]>();
  for (const r of records) {
    const v = r.frontmatter[field]?.trim() || "—";
    let bucket = seen.get(v);
    if (!bucket) {
      bucket = [];
      seen.set(v, bucket);
    }
    bucket.push(r);
  }
  return [...seen.entries()].map(([value, recs]) => ({ value, records: recs }));
}

// The fields a view can filter/group/sort on: its declared columns plus
// status, deduped, in a stable order (status first).
export function controllableFields(
  columns: string[],
  extra: string[] = [],
): string[] {
  const out: string[] = [];
  for (const f of ["status", ...columns, ...extra]) {
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}
