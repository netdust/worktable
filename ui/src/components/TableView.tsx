import { useEffect, useState } from "react";
import { resolveView, type ResolvedView, type RecordSummary } from "../api";
import { columnsOf, groupRecords, type Column } from "../lib/records";
import { GroupHeader } from "./folio/GroupHeader";
import { FieldCell } from "./folio/FieldCell";
import { TableSkeleton, EmptyState, ErrorState } from "./folio/Feedback";

// One renderer for both `table` and `list` (grouped) — grouping is a
// mode driven by the view's group_by, not a second component (the
// harvested folio rule). Columns come from the ported `columns`
// machinery; each cell renders by inferred field type (FieldCell);
// group headers carry counts + the ported distribution bar. Records are
// body-less here; the panel loads detail.
export function TableView({
  name,
  refreshKey,
  onOpen,
}: {
  name: string;
  refreshKey: number;
  onOpen: (record: string) => void;
}) {
  const [view, setView] = useState<ResolvedView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    resolveView(name)
      .then((v) => live && setView(v))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [name, refreshKey]);

  if (error) return <ErrorState message={error} />;
  if (!view) return <TableSkeleton />;
  if (view.records.length === 0)
    return <EmptyState label="No records in this view." />;

  const columns = columnsOf(view.definition);
  const groupBy = view.definition.group_by;
  const groups = groupRecords(view.records, view.groups, groupBy);
  const colSpan = columns.length + 1;

  return (
    <div className="table-wrap">
      <table className="records">
        <thead>
          <tr>
            <th>Record</th>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows
              key={g.value ?? "_all"}
              value={g.value}
              records={g.records}
              columns={columns}
              colSpan={colSpan}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  value,
  records,
  columns,
  colSpan,
  onOpen,
}: {
  value: string | null;
  records: RecordSummary[];
  columns: Column[];
  colSpan: number;
  onOpen: (record: string) => void;
}) {
  return (
    <>
      {value !== null && (
        <GroupHeader label={value} records={records} colSpan={colSpan} />
      )}
      {records.map((r) => {
        const id = `${r.domain}/${r.slug}`;
        return (
          <tr key={id} className="record-row" onClick={() => onOpen(id)}>
            <td className="record-link">{r.frontmatter.title || r.slug}</td>
            {columns.map((c) => (
              <td key={c.key}>
                <FieldCell field={c.key} value={r.frontmatter[c.key]} />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
