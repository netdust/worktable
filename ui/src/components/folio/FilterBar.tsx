import type { RecordSummary, ResolvedView } from "../../api";
import { parseList, humanize } from "../../lib/records";
import {
  controllableFields,
  FILTER_OPS,
  GROUP_NONE,
  type FilterClause,
  type FilterOp,
  type ViewControls,
} from "../../view-controls";
import { Icon } from "./Icon";

// Grouping is meaningless on the calendar (records placed by date) and
// timeline (lanes per record), so the Group control is hidden there.
const GROUPLESS = new Set(["calendar", "timeline"]);

// The shared control bar above every view (folio's FilterBar shape):
// filter clauses as removable pills, a `+ Filter` field-picker, and
// Group / Sort dropdowns. The controls are EPHEMERAL — this only edits
// the ViewControls object (held in the URL); no file is written.
export function FilterBar({
  view,
  type,
  records,
  controls,
  onChange,
}: {
  view: ResolvedView;
  type: string;
  records: RecordSummary[];
  controls: ViewControls;
  onChange: (next: ViewControls) => void;
}) {
  // the raw declared columns (INCLUDING title — unlike columnsOf, which
  // drops title as the row-link column; title is a valid sort/filter key)
  const columns = parseList(view.definition.columns);
  const fields = controllableFields(columns, [
    view.definition.group_by,
    view.definition.date_field,
    view.definition.start_field,
    view.definition.end_field,
  ].filter(Boolean) as string[]);

  const defaultGroup = view.definition.group_by || "";
  // the select reflects the effective group: an explicit control, else
  // the view default, else "None" (GROUP_NONE) when the view has none.
  const groupValue = controls.group ?? (defaultGroup || GROUP_NONE);

  const setFilters = (filters: FilterClause[]) =>
    onChange({ ...controls, filters });
  const addFilter = (field: string) => {
    if (!field) return;
    setFilters([...controls.filters, { field, op: "is", value: "" }]);
  };
  const editFilter = (i: number, patch: Partial<FilterClause>) =>
    setFilters(controls.filters.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeFilter = (i: number) =>
    setFilters(controls.filters.filter((_, j) => j !== i));

  return (
    <div className="filterbar">
      {controls.filters.map((c, i) => (
        <span className="filter-pill" key={i}>
          <span className="fp-field">{humanize(c.field)}</span>
          <select
            className="fp-op"
            value={c.op}
            aria-label={`${c.field} operator`}
            onChange={(e) => editFilter(i, { op: e.target.value as FilterOp })}
          >
            {FILTER_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            className="fp-value"
            list={`vals-${c.field}`}
            value={c.value}
            placeholder="value"
            aria-label={`${c.field} value`}
            onChange={(e) => editFilter(i, { value: e.target.value })}
          />
          <datalist id={`vals-${c.field}`}>
            {distinctValues(records, c.field).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <button
            className="fp-x"
            onClick={() => removeFilter(i)}
            aria-label="remove filter"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}

      <label className="filter-add">
        <span className="fa-plus">+ Filter</span>
        <select
          value=""
          aria-label="add filter"
          onChange={(e) => {
            addFilter(e.target.value);
            e.currentTarget.value = "";
          }}
        >
          <option value="" disabled>
            field…
          </option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {humanize(f)}
            </option>
          ))}
        </select>
      </label>

      <div className="ctrl-spacer" />

      {!GROUPLESS.has(type) && (
        <label className="ctrl ctrl-group">
          <span className="ctrl-key">Group</span>
          <select
            value={groupValue}
            aria-label="group by"
            onChange={(e) => onChange({ ...controls, group: e.target.value })}
          >
            <option value={GROUP_NONE}>None</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {humanize(f)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="ctrl ctrl-sort">
        <span className="ctrl-key">Sort</span>
        <select
          value={controls.sortKey ?? ""}
          aria-label="sort by"
          onChange={(e) =>
            onChange({ ...controls, sortKey: e.target.value || null })
          }
        >
          <option value="">default</option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {humanize(f)}
            </option>
          ))}
        </select>
        <button
          className="sort-dir"
          aria-label="toggle sort direction"
          disabled={!controls.sortKey}
          onClick={() =>
            onChange({
              ...controls,
              sortDir: controls.sortDir === "asc" ? "desc" : "asc",
            })
          }
        >
          {controls.sortDir === "asc" ? "↑" : "↓"}
        </button>
      </label>
    </div>
  );
}

function distinctValues(records: RecordSummary[], field: string): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    const v = r.frontmatter[field];
    if (v) seen.add(v);
  }
  return [...seen].sort();
}
