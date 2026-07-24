// Skeletons + empty-state — the per-view loading and empty chrome, so
// no view flashes a bare "Loading…" or a blank pane. Carried from
// folio's skeleton set (4 shapes) and empty-state leaf, rebuilt lean.

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="empty-state">
      <div className="empty-mark" aria-hidden>
        ∅
      </div>
      <div className="empty-label">{label}</div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <div className="pane-msg error">{message}</div>;
}

// One skeleton primitive; each view composes it into its own shape so
// the loading state resembles the content that replaces it.
function Bar({ w }: { w: string }) {
  return <span className="skel-bar" style={{ width: w }} />;
}

export function TableSkeleton() {
  return (
    <div className="skel skel-table" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skel-row">
          <Bar w="30%" />
          <Bar w="18%" />
          <Bar w="14%" />
        </div>
      ))}
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="skel skel-board" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skel-col">
          <Bar w="60%" />
          <div className="skel-card" />
          <div className="skel-card" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="skel skel-grid" aria-hidden>
      {Array.from({ length: 21 }).map((_, i) => (
        <div key={i} className="skel-cell" />
      ))}
    </div>
  );
}

export function LanesSkeleton() {
  return (
    <div className="skel skel-lanes" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skel-lane">
          <Bar w={`${20 + ((i * 13) % 50)}%`} />
        </div>
      ))}
    </div>
  );
}
