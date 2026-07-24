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
import { TableView } from "./components/TableView";
import { RecordPanel } from "./components/RecordPanel";

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
        if (!url.view && r.views.length) navigate({ view: r.views[0].name });
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
        <div className="rail-brand">worktable</div>
        <ul>
          {(views || []).map((v) => (
            <li key={v.name}>
              <button
                className={url.view === v.name ? "nav active" : "nav"}
                onClick={() => navigate({ view: v.name, record: null })}
              >
                {v.name}
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
          <TableView
            name={url.view}
            refreshKey={refreshKey}
            onOpen={(record) => navigate({ record })}
          />
        ) : (
          <div className="pane-msg muted">Select a view.</div>
        )}
      </main>

      {url.record && (
        <RecordPanel
          record={url.record}
          refreshKey={refreshKey}
          onClose={() => navigate({ record: null })}
          onSealed={bump}
        />
      )}
    </div>
  );
}
