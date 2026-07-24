// Adapted from netdust/folio (apps/web/src/components/kanban/board-grouping.ts).
// Folio grouped by statuses-as-entities + Field defs; worktable has neither —
// records are markdown with frontmatter, and grouping is by a frontmatter
// value (the same shape the server's resolve_view groups by). So this is the
// folio idea (ordered non-empty columns, an "unset" column, stable order)
// rebuilt over worktable's RecordSummary. Pure, framework-free.

import type { RecordSummary } from "../../api";

export interface BoardColumn {
  value: string | null; // grouping value; null = the "unset" column
  label: string;
  records: RecordSummary[];
}

/**
 * Build kanban columns by grouping records on frontmatter[groupBy].
 *
 * - Column order follows `order` when given (e.g. a known status sequence),
 *   with any unlisted values appended in first-seen order, and the "unset"
 *   column last.
 * - A record whose groupBy value is empty/absent lands in the null column.
 * - Empty columns from `order` are KEPT (a kanban shows all lanes, even empty
 *   ones), unlike a grouped table which hides empties.
 */
export function buildColumns(
  records: RecordSummary[],
  groupBy: string,
  order: string[] = [],
): BoardColumn[] {
  const byValue = new Map<string | null, RecordSummary[]>();
  const seen: (string | null)[] = [];

  const ensure = (key: string | null): RecordSummary[] => {
    let bucket = byValue.get(key);
    if (bucket === undefined) {
      bucket = [];
      byValue.set(key, bucket);
      seen.push(key);
    }
    return bucket;
  };

  for (const value of order) ensure(value); // seed declared lanes (may stay empty)
  for (const rec of records) {
    const raw = rec.frontmatter[groupBy];
    ensure(raw && raw.trim() !== "" ? raw : null).push(rec);
  }

  const keys = seen.filter((k): k is string => k !== null);
  const ordered: (string | null)[] = [
    ...order.filter((v) => byValue.has(v)),
    ...keys.filter((k) => !order.includes(k)),
  ];
  if (byValue.has(null)) ordered.push(null);

  return ordered.map((value) => ({
    value,
    label: value ?? "—",
    records: byValue.get(value) ?? [],
  }));
}
