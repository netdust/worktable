import { useState } from "react";
import type { ViewListItem } from "../api";
import { projectsOf } from "../lib/records";
import { Icon } from "./folio/Icon";

// The left rail: worktable brand + the project → view tree (folio's
// rail shape). Views are grouped by their source folder (the project);
// each project is collapsible and lists its views with type icons. No
// create affordances — files are authored in obsidian / by agents / in
// git (the deferred-UI doc tracks create-from-UI as future work).
function viewIcon(
  type: string | undefined,
): "table" | "list" | "kanban" | "calendar" | "timeline" {
  switch (type) {
    case "table":
    case "kanban":
    case "calendar":
    case "timeline":
      return type;
    default:
      return "list";
  }
}

export function Rail({
  views,
  activeView,
  onSelect,
  onSignOut,
}: {
  views: ViewListItem[];
  activeView: string | null;
  onSelect: (view: string) => void;
  onSignOut: () => void;
}) {
  const projects = projectsOf(views);
  return (
    <nav className="rail">
      <div className="rail-brand">
        <span className="rail-mark">w</span>
        <span className="rail-name">worktable</span>
      </div>
      <div className="rail-tree">
        {projects.map((p) => (
          <Project
            key={p.source}
            label={p.label}
            views={p.views}
            activeView={activeView}
            onSelect={onSelect}
          />
        ))}
        {projects.length === 0 && (
          <div className="rail-empty muted">No views yet.</div>
        )}
      </div>
      <button className="rail-signout" onClick={onSignOut}>
        Sign out
      </button>
    </nav>
  );
}

function Project({
  label,
  views,
  activeView,
  onSelect,
}: {
  label: string;
  views: ViewListItem[];
  activeView: string | null;
  onSelect: (view: string) => void;
}) {
  // Default open; a project holding the active view can never be
  // collapsed shut on load (the active row must be reachable).
  const [open, setOpen] = useState(true);
  const holdsActive = views.some((v) => v.name === activeView);
  const isOpen = open || holdsActive;

  return (
    <div className="rail-project">
      <button
        className="rail-project-head"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <Icon
          name="right"
          size={12}
          className={isOpen ? "rail-chevron open" : "rail-chevron"}
        />
        <span className="rail-project-name">{label}</span>
      </button>
      {isOpen && (
        <ul className="rail-views">
          {views.map((v) => (
            <li key={v.name}>
              <button
                className={v.name === activeView ? "nav active" : "nav"}
                onClick={() => onSelect(v.name)}
              >
                <Icon name={viewIcon(v.definition.view)} size={15} />
                <span className="nav-label">{v.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
