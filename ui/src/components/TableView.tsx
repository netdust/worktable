import type { RecordSummary } from "../api";
import { columnsOf, type Column } from "../lib/records";
import { groupRecordsBy } from "../view-controls";
import { GroupHeader } from "./folio/GroupHeader";
import { FieldCell } from "./folio/FieldCell";
import { Icon } from "./folio/Icon";
import { EmptyState } from "./folio/Feedback";
import type { RenderProps } from "./folio/ViewRouter";

// One renderer for both `table` and `list` (grouped) — grouping is a
// mode driven by the effective group field, not a second component (the
// harvested folio rule). Presentational: the records arrive already
// filtered + sorted by the ViewFrame; columns come from the ported
// `columns` machinery; each cell renders by inferred field type.
export function TableView({ view, records, groupBy, onOpen }: RenderProps) {
  if (records.length === 0)
    return <EmptyState label="No records match." />;

  const columns = columnsOf(view.definition);
  const groups = groupBy
    ? groupRecordsBy(records, groupBy)
    : [{ value: null as string | null, records }];
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
              field={groupBy || ""}
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
  field,
  value,
  records,
  columns,
  colSpan,
  onOpen,
}: {
  field: string;
  value: string | null;
  records: RecordSummary[];
  columns: Column[];
  colSpan: number;
  onOpen: (record: string) => void;
}) {
  return (
    <>
      {value !== null && (
        <GroupHeader
          field={field}
          label={value}
          records={records}
          colSpan={colSpan}
        />
      )}
      {records.map((r) => {
        const id = `${r.domain}/${r.slug}`;
        return (
          <tr key={id} className="record-row" onClick={() => onOpen(id)}>
            <td className="record-link">
              <span className="row-open" aria-hidden>
                <Icon name="open" size={14} />
              </span>
              <span className="row-title">{r.frontmatter.title || r.slug}</span>
            </td>
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
