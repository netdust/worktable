import { useEffect, useMemo, useState } from "react";
import {
  getRecord,
  getFlow,
  getArtifact,
  seal,
  type RecordDetail,
  type FlowDef,
} from "../api";
import { orderArtifacts } from "../lib/records";
import { StatusChip } from "./StatusChip";
import { Slideover } from "./folio/Slideover";

// The record panel: a folder presented as ONE thing. Header from the
// frontmatter core, a Cover tab (item.md body), one read-only tab per
// artifact (lazy-loaded, ordered by the flow), and — when the record
// is parked at a human node — the seal actions, the UI's only write.
//
// "Awaiting a decision" is a FLOW-OWNED signal: the gate that parks
// the record at a human node writes `awaiting_seal: <name>` into the
// frontmatter (bin/gate-then-status.py --seal), and every other status
// write clears it. The UI never infers it and never reads a
// hand-authored field — absent awaiting_seal, no seal UI (fail closed:
// never invent an approvable state).
export function RecordPanel({
  record,
  refreshKey,
  onClose,
  onSealed,
}: {
  record: string;
  refreshKey: number;
  onClose: () => void;
  onSealed: () => void;
}) {
  const [domain, slug] = record.split("/");
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [flow, setFlow] = useState<FlowDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("__cover__");

  useEffect(() => {
    let live = true;
    setError(null);
    getRecord(domain, slug)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        const flowName = d.frontmatter.flow;
        if (flowName) getFlow(flowName).then((f) => live && setFlow(f)).catch(() => {});
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [domain, slug, refreshKey]);

  const tabs = useMemo(
    () => (detail ? orderArtifacts(detail.artifacts, flow) : []),
    [detail, flow],
  );

  return (
    <Slideover label={`record ${slug}`} onClose={onClose}>
      {error && <div className="pane-msg error">{error}</div>}
        {detail && (
          <>
            <header className="panel-head">
              <h2>{detail.frontmatter.title || slug}</h2>
              <div className="panel-meta">
                <StatusChip status={detail.frontmatter.status || ""} />
                {detail.frontmatter.updated && (
                  <span className="muted">updated {detail.frontmatter.updated}</span>
                )}
                {detail.frontmatter.run && (
                  <span className="muted mono">{detail.frontmatter.run}</span>
                )}
                {detail.reviews > 0 && (
                  <span className="reviews-badge" title="attested reviews">
                    ✓ {detail.reviews} review{detail.reviews > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </header>

            <nav className="tabs">
              <button
                className={tab === "__cover__" ? "tab active" : "tab"}
                onClick={() => setTab("__cover__")}
              >
                Cover
              </button>
              {tabs.map((a) => (
                <button
                  key={a}
                  className={tab === a ? "tab active" : "tab"}
                  onClick={() => setTab(a)}
                >
                  {a}
                </button>
              ))}
            </nav>

            <div className="tab-body">
              {tab === "__cover__" ? (
                <pre className="doc">{detail.body || "(empty)"}</pre>
              ) : (
                <ArtifactTab domain={domain} slug={slug} file={tab} />
              )}
            </div>

            <SealBar
              record={record}
              node={detail.frontmatter.awaiting_seal || ""}
              onSealed={onSealed}
            />
          </>
        )}
    </Slideover>
  );
}

function ArtifactTab({
  domain,
  slug,
  file,
}: {
  domain: string;
  slug: string;
  file: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setContent(null);
    setError(null);
    getArtifact(domain, slug, file)
      .then((c) => live && setContent(c))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [domain, slug, file]);
  if (error) return <div className="pane-msg error">{error}</div>;
  if (content === null) return <div className="pane-msg muted">Loading…</div>;
  // Server content is rendered as TEXT, never HTML — records may hold
  // hostile strings (threat model). <pre> keeps it inert and readable.
  return <pre className="doc">{content}</pre>;
}

function SealBar({
  record,
  node,
  onSealed,
}: {
  record: string;
  node: string;
  onSealed: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // No seal node declared → no seal UI. Never invent an approvable
  // state; the human seals only where the flow says a human decides.
  if (!node) return null;

  async function act(decision: "approved" | "rejected") {
    setBusy(true);
    setMsg(null);
    try {
      await seal(record, node, decision, note.trim() || undefined);
      onSealed();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="seal-bar">
      <div className="seal-label">
        Decision on <span className="mono">{node}</span>
      </div>
      <input
        className="seal-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="note (optional)"
        aria-label="seal note"
      />
      <div className="seal-actions">
        <button className="approve" disabled={busy} onClick={() => act("approved")}>
          Approve
        </button>
        <button className="reject" disabled={busy} onClick={() => act("rejected")}>
          Reject
        </button>
      </div>
      {msg && <div className="pane-msg error">{msg}</div>}
    </div>
  );
}
