import { useCallback, useEffect, useState } from "react";
import {
  listViews,
  getToken,
  clearToken,
  setUnauthorizedHandler,
  type ViewListItem,
} from "./api";
import { subscribeChanges } from "./live";
import { useUrlState } from "./url";
import { TokenGate } from "./components/TokenGate";
import { ViewRouter } from "./components/folio/ViewRouter";
import { Icon } from "./components/folio/Icon";
import { RecordPanel } from "./components/RecordPanel";

// The rail glyph for a view type — falls back to the list mark for an
// unknown/absent type so a mis-typed view still gets an icon.
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

export function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));
  const [views, setViews] = useState<ViewListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [url, navigate] = useUrlState();

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setAuthed(false);
    });
  }, []);

  // load the view list once authed; pick a default view if none in URL
  useEffect(() => {
    if (!authed) return;
    let live = true;
    listViews()
      .then((r) => {
        if (!live) return;
        setViews(r.views);
        // seed the default view without a history push (Back stays live)
        if (!url.view && r.views.length)
          navigate({ view: r.views[0].name }, { replace: true });
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [authed, refreshKey, url.view, navigate]);

  // live refresh: a change tick re-reads whatever is on screen
  useEffect(() => {
    if (!authed) return;
    return subscribeChanges(bump);
  }, [authed, bump]);

  if (!authed) return <TokenGate onReady={() => setAuthed(true)} />;

  return (
    <div className="app">
      <nav className="rail">
        <div className="rail-brand">
          <span className="rail-mark">w</span>
          <span className="rail-name">worktable</span>
        </div>
        <div className="rail-section">Views</div>
        <ul>
          {(views || []).map((v) => (
            <li key={v.name}>
              <button
                className={url.view === v.name ? "nav active" : "nav"}
                onClick={() => navigate({ view: v.name, record: null })}
              >
                <Icon name={viewIcon(v.definition.view)} size={15} />
                <span className="nav-label">{v.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          className="rail-signout"
          onClick={() => {
            clearToken();
            setAuthed(false);
          }}
        >
          Sign out
        </button>
      </nav>

      <main className="content">
        {error && <div className="pane-msg error">{error}</div>}
        {url.view ? (
          // Wait for the view list before choosing a renderer: deriving
          // the type from an unloaded list would flash TableView on a
          // deep-link to a calendar/kanban view. Once loaded, an unknown
          // view name is surfaced by the router, not defaulted.
          views === null ? (
            <div className="pane-msg muted">Loading…</div>
          ) : (
            <ViewRouter
              key={url.view}
              type={
                views.find((v) => v.name === url.view)?.definition.view ||
                "table"
              }
              name={url.view}
              refreshKey={refreshKey}
              onOpen={(record) => navigate({ record })}
            />
          )
        ) : (
          <div className="pane-msg muted">Select a view.</div>
        )}
      </main>

      {url.record && (
        <RecordPanel
          key={url.record}
          record={url.record}
          refreshKey={refreshKey}
          onClose={() => navigate({ record: null })}
          onSealed={bump}
        />
      )}
    </div>
  );
}
