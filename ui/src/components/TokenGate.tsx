import { useState } from "react";
import { setToken } from "../api";

// The token gate: entered once, kept in the browser. Shown on first
// load and whenever a request 401s. Not a login — a single-owner app
// where the bearer token IS the principal.
export function TokenGate({ onReady }: { onReady: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            setToken(value.trim());
            onReady();
          }
        }}
      >
        <h1>worktable</h1>
        <p className="muted">Enter your access token to continue.</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="token"
          aria-label="access token"
        />
        <button type="submit">Open</button>
      </form>
    </div>
  );
}
