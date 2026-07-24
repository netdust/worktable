import { useEffect, useMemo, useState } from "react";
import { resolveView, type ResolvedView } from "../api";
import { applyControls, effectiveGroup, type ViewControls } from "../view-controls";
import { ViewRouter } from "./folio/ViewRouter";
import { FilterBar } from "./folio/FilterBar";
import { TableSkeleton, ErrorState } from "./folio/Feedback";

// ViewFrame — the one place a view's data + controls live. It resolves
// the view once, hoists the shared filter/group/sort bar above every
// renderer (folio's model), applies the ephemeral controls to the
// loaded records, and hands the already-filtered set to the type's
// renderer. The renderers are purely presentational; only this frame
// fetches and filters.
export function ViewFrame({
  name,
  type,
  controls,
  onControlsChange,
  refreshKey,
  onOpen,
}: {
  name: string;
  type: string;
  controls: ViewControls;
  onControlsChange: (next: ViewControls) => void;
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

  const records = useMemo(
    () => (view ? applyControls(view.records, controls) : []),
    [view, controls],
  );

  if (error) return <ErrorState message={error} />;
  if (!view) return <TableSkeleton />;

  const group = effectiveGroup(controls.group, view.definition.group_by);

  return (
    <div className="view-frame">
      <FilterBar
        view={view}
        type={type}
        records={view.records}
        controls={controls}
        onChange={onControlsChange}
      />
      <div className="view-body">
        <ViewRouter
          type={type}
          view={view}
          records={records}
          groupBy={group}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}
