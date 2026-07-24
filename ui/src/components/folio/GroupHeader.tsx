// GroupHeader + DistributionBar — the folio grouped-view chrome. The
// header reads "FIELD · value · N items" (uppercase field prefix, dotted
// separators) and carries a distribution bar summarizing the status mix
// within the group. Carried from folio's group-header-row /
// distribution-bar leaves, rebuilt over worktable's RecordSummary.
import type { RecordSummary } from "../../api";

// Count records by status, folding no-status into "—". Pure + exported
// so the distribution math is unit-tested without mounting the bar.
export function statusCounts(records: RecordSummary[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const s = r.frontmatter.status || "—";
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()];
}

// folio's stable distribution palette — a fixed sequence, so the bar
// paints the same colours regardless of which statuses appear.
const SEGMENT_COLORS = [
  "#6EAFFF", "#F0A442", "#7DD3A0", "#C792EA",
  "#FF8A8A", "#F6C453", "#79D0E0", "#B0BEC5",
];

export function DistributionBar({ records }: { records: RecordSummary[] }) {
  const total = records.length || 1;
  const segments = statusCounts(records);
  if (segments.length <= 1) return null; // nothing to distribute

  return (
    <div className="dist" data-testid="distribution-bar">
      <div
        className="dist-bar"
        role="img"
        aria-label={segments.map(([s, n]) => `${s}: ${n}`).join(", ")}
      >
        {segments.map(([status, n], i) => (
          <span
            key={status}
            className="dist-seg"
            style={{
              width: `${(n / total) * 100}%`,
              background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            }}
            title={`${status}: ${n}`}
          />
        ))}
      </div>
      <div className="dist-legend">
        {segments.map(([status, n], i) => (
          <span key={status} className="dist-key">
            <span
              className="dist-dot"
              style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            {status} · {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GroupHeader({
  field,
  label,
  records,
  colSpan,
}: {
  field: string;
  label: string;
  records: RecordSummary[];
  colSpan: number;
}) {
  return (
    <tr className="group-header">
      <td colSpan={colSpan}>
        <div className="group-head-row">
          <div className="group-head-left">
            <span className="group-field">{field}</span>
            <span className="group-sep">·</span>
            <span className="group-label">{label}</span>
            <span className="group-sep">·</span>
            <span className="count">{records.length}</span>
            <span className="group-unit">items</span>
          </div>
          <DistributionBar records={records} />
        </div>
      </td>
    </tr>
  );
}
