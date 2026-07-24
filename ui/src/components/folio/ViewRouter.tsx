// ViewRouter — the single exhaustive ViewType→renderer map (R01),
// carried from folio's view-router. The view definition's `view` field
// (table | list | kanban | calendar | timeline) selects exactly one
// renderer; every renderer takes the same props (view name, refreshKey,
// onOpen), so the shell never knows which view it is showing. An
// unknown type is a definition error surfaced honestly, not a blank
// pane — the map is the ONE place view types are enumerated.
import type { ComponentType } from "react";
import { TableView } from "../TableView";
import { KanbanView } from "../KanbanView";
import { CalendarView } from "../CalendarView";
import { TimelineView } from "../TimelineView";
import { EmptyState } from "./Feedback";

export interface ViewProps {
  name: string;
  refreshKey: number;
  onOpen: (record: string) => void;
}

// `list` is a grouped table — the same renderer in grouped mode, not a
// second component (the harvested folio rule).
const RENDERERS: Record<string, ComponentType<ViewProps>> = {
  table: TableView,
  list: TableView,
  kanban: KanbanView,
  calendar: CalendarView,
  timeline: TimelineView,
};

export function ViewRouter({
  type,
  ...props
}: ViewProps & { type: string }) {
  const Renderer = RENDERERS[type];
  if (!Renderer)
    return <EmptyState label={`Unknown view type "${type}"`} />;
  return <Renderer {...props} />;
}

export const KNOWN_VIEW_TYPES = Object.keys(RENDERERS);
