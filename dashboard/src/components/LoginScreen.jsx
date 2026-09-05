import { useState } from "react";
import { login } from "../api.js";

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const doLogin = async (u, p) => {
    setLoading(true);
    setError(null);
    try {
      const { access_token } = await login(u, p);
      localStorage.setItem("cctv_access_token", access_token);
      onLoginSuccess();
    } catch (err) {
      setError(
        err.response?.status === 401
          ? "Incorrect username or password."
          : "Could not reach the backend. Is it running?"
      );
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    doLogin(username, password);
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-void)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 360,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 8,
          padding: 28,
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-active)" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            Gujarat CCTV Command Dashboard
          </span>
        </div>
        <div style={{ marginBottom: 16, fontSize: 12, color: "var(--text-secondary)" }}>
          Gujarat Police · State CCTV Network
        </div>

        {/* Demo credentials hint badge */}
        <div
          style={{
            marginBottom: 16,
            padding: "8px 12px",
            background: "rgba(61, 214, 196, 0.08)",
            border: "1px solid rgba(61, 214, 196, 0.2)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--text-secondary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Demo User: <strong style={{ color: "var(--accent-active)" }}>admin</strong> / <strong style={{ color: "var(--accent-active)" }}>admin123</strong></span>
          <button
            type="button"
            onClick={() => { setUsername("admin"); setPassword("admin123"); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-active)",
              fontSize: 11,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Reset
          </button>
        </div>

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            marginBottom: 14,
            background: "var(--bg-panel-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 6,
            padding: "8px 10px",
            color: "var(--text-primary)",
            fontSize: 13,
          }}
        />

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 18,
            background: "var(--bg-panel-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 6,
            padding: "8px 10px",
            color: "var(--text-primary)",
            fontSize: 13,
          }}
        />

        {error && (
          <div style={{ marginBottom: 14, fontSize: 12, color: "var(--severity-critical)" }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "var(--accent-active-dim)",
            color: "var(--accent-active)",
            border: "1px solid var(--accent-active)",
            borderRadius: 6,
            padding: "10px 0",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {loading ? "Signing in…" : "⚡ Sign in to Command Centre"}
        </button>
      </form>
    </div>
  );
}