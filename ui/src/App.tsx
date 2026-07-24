import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listViews,
  getToken,
  clearToken,
  setUnauthorizedHandler,
  type ViewListItem,
} from "./api";
import { subscribeChanges } from "./live";
import { useUrlState } from "./url";
import { decodeControls, encodeControls, type ViewControls } from "./view-controls";
import { TokenGate } from "./components/TokenGate";
import { Rail } from "./components/Rail";
import { ViewFrame } from "./components/ViewFrame";
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

  // the ephemeral view controls, decoded from the URL
  const controls = useMemo(
    () => decodeControls(url.group, url.sort, url.filters),
    [url.group, url.sort, url.filters],
  );
  const onControlsChange = useCallback(
    (next: ViewControls) => navigate(encodeControls(next)),
    [navigate],
  );
  // switching views resets the ephemeral controls (a dossier filter
  // must not carry to the tasks view) and closes any open record
  const selectView = useCallback(
    (view: string) =>
      navigate({ view, record: null, group: null, sort: null, filters: null }),
    [navigate],
  );

  if (!authed) return <TokenGate onReady={() => setAuthed(true)} />;

  const activeType =
    (views || []).find((v) => v.name === url.view)?.definition.view || "table";

  return (
    <div className="app">
      <Rail
        views={views || []}
        activeView={url.view}
        onSelect={selectView}
        onSignOut={() => {
          clearToken();
          setAuthed(false);
        }}
      />

      <main className="content">
        {error && <div className="pane-msg error">{error}</div>}
        {url.view ? (
          // Wait for the view list before choosing a renderer: deriving
          // the type from an unloaded list would flash the wrong renderer
          // on a deep-link. Once loaded, an unknown view name is surfaced
          // by the router, not defaulted.
          views === null ? (
            <div className="pane-msg muted">Loading…</div>
          ) : (
            <ViewFrame
              key={url.view}
              name={url.view}
              type={activeType}
              controls={controls}
              onControlsChange={onControlsChange}
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
