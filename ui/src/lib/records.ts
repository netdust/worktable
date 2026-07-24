// records.ts — framework-free helpers over a record list. Pure
// functions, unit-tested (T07), carried in spirit from the folio
// harvest's framework-free layout modules. No React here.

import type { RecordSummary, ViewDef, FlowDef } from "../api";

export interface Column {
  key: string;
  label: string;
}

/** Columns for a table: the record link is always first (rendered by
 *  the view), then the definition's declared columns. `title` is
 *  dropped — it is the link column, not a data column. */
export function columnsOf(def: ViewDef): Column[] {
  const declared = parseList(def.columns).filter((c) => c !== "title");
  return declared.map((key) => ({ key, label: humanize(key) }));
}

/** Accept every form a view definition uses: `[a, b]`, `a, b`, `a b`,
 *  `a` — matching the server's parser so the UI and API agree. */
export function parseList(raw: string | undefined): string[] {
  let s = (raw || "").trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const parts = s.includes(",") ? s.split(",") : s.split(/\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function humanize(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A stable, legible color for a status value — derived from the
 *  string so the palette is consistent without per-status config.
 *  Returns an { bg, fg } pair with adequate contrast. */
export function statusColor(status: string): { bg: string; fg: string } {
  const known: Record<string, string> = {
    new: "210",
    researched: "265",
    drafted: "45",
    reviewed: "170",
    final: "140",
    rejected: "0",
    contacted: "200",
    sent: "140",
  };
  const hue = known[status] ?? String(hashHue(status));
  return { bg: `hsl(${hue} 70% 92%)`, fg: `hsl(${hue} 65% 28%)` };
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Ordered non-empty groups for a grouped table; if the view has no
 *  group_by, one implicit group holding every record in order. */
export function groupRecords(
  records: RecordSummary[],
  groups: { value: string; records: string[] }[],
  groupBy: string | undefined,
): { value: string | null; records: RecordSummary[] }[] {
  if (!groupBy) return [{ value: null, records }];
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  return groups.map((g) => ({
    value: g.value,
    records: g.records
      .map((slug) => bySlug.get(slug))
      .filter((r): r is RecordSummary => Boolean(r)),
  }));
}

/** Tab order for the record panel: the flow's node `out:` sequence
 *  (artifacts named by earlier nodes come first), then any remaining
 *  artifacts by name. Cover (item.md body) is prepended by the panel;
 *  this orders the artifact tabs only. */
export function orderArtifacts(
  artifacts: string[],
  flow: FlowDef | null,
): string[] {
  if (!flow) return [...artifacts].sort();
  const rank = new Map<string, number>();
  let i = 0;
  for (const node of flow.nodes) {
    for (const out of node.out || []) {
      const file = out.trim();
      if (!rank.has(file)) rank.set(file, i++);
    }
  }
  return [...artifacts].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}
