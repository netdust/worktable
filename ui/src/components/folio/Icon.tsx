// Icon — a tiny inline-SVG set (no icon dependency, staying lean). Only
// the glyphs worktable actually uses: the view-type marks for the rail,
// plus chevrons, an open-arrow, close, and zoom. Stroke-based, 1.5px, to
// match folio's line-icon weight (folio uses lucide; these mirror it).
type Name =
  | "table"
  | "list"
  | "kanban"
  | "calendar"
  | "timeline"
  | "open"
  | "close"
  | "left"
  | "right";

const PATHS: Record<Name, JSX.Element> = {
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M3 15h18M9 4v16" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="14" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  timeline: (
    <>
      <path d="M4 7h9M4 12h14M4 17h6" />
    </>
  ),
  open: <path d="M7 17L17 7M9 7h8v8" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: Name;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
