// api.ts — the whole server contract in one thin module. No fetch
// library: the API is six reads plus one write, so a single helper
// does it. The bearer token lives in localStorage (owner-only app),
// is sent on every request, and is never logged or put in a URL.

const TOKEN_KEY = "worktable_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// A 401 anywhere means the token is gone/wrong — subscribers (the
// shell) return the user to token entry rather than showing stale data.
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => {};
export function setUnauthorizedHandler(h: UnauthorizedHandler): void {
  onUnauthorized = h;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getToken()}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, "unauthorized");
  }
  return res;
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await request(path);
  if (!res.ok) throw new ApiError(res.status, await errorText(res));
  return (await res.json()) as T;
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ── the shapes the server returns (docs/SERVER.md) ──────────────────

export interface Frontmatter {
  [key: string]: string;
}
export interface RecordSummary {
  domain: string;
  slug: string;
  frontmatter: Frontmatter;
  artifacts: string[];
  reviews: number;
}
export interface RecordDetail extends RecordSummary {
  body: string;
}
export interface ViewDef {
  [key: string]: string;
}
export interface ViewListItem {
  name: string;
  definition: ViewDef;
}
export interface ViewGroup {
  value: string;
  records: string[];
}
export interface ResolvedView {
  name: string;
  definition: ViewDef;
  records: RecordSummary[];
  groups: ViewGroup[];
}
export interface FlowDef {
  flow: string;
  nodes: { id: string; kind?: string; out?: string[] }[];
}
export interface SealResult {
  sealed: boolean;
  record: string;
  node: string;
  decision: string;
  detail?: string;
}

// ── the six reads ───────────────────────────────────────────────────

export const listViews = () => getJSON<{ views: ViewListItem[] }>("/views");
export const resolveView = (name: string) =>
  getJSON<ResolvedView>(`/views/${encodeURIComponent(name)}`);
export const getRecord = (domain: string, slug: string) =>
  getJSON<RecordDetail>(
    `/records/${encodeURIComponent(domain)}/${encodeURIComponent(slug)}`,
  );
export const getFlow = (name: string) =>
  getJSON<FlowDef>(`/flows/${encodeURIComponent(name)}`);

export async function getArtifact(
  domain: string,
  slug: string,
  file: string,
): Promise<string> {
  const res = await request(
    `/records/${encodeURIComponent(domain)}/${encodeURIComponent(slug)}` +
      `/artifacts/${encodeURIComponent(file)}`,
  );
  if (!res.ok) throw new ApiError(res.status, await errorText(res));
  return res.text();
}

// ── the one write ───────────────────────────────────────────────────

export async function seal(
  record: string,
  node: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<SealResult> {
  const res = await request("/seal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record, node, decision, note }),
  });
  if (!res.ok) throw new ApiError(res.status, await errorText(res));
  return (await res.json()) as SealResult;
}
