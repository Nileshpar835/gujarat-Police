import { useState } from "react";
import { login } from "../api.js";

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { access_token } = await login(username, password);
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
          width: 340,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 8,
          padding: 28,
        }}
      >
        <div style={{ marginBottom: 4, fontSize: 16, fontWeight: 700 }}>
          Gujarat CCTV Command Dashboard
        </div>
        <div style={{ marginBottom: 20, fontSize: 12, color: "var(--text-secondary)" }}>
          Sign in to continue
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
            padding: "9px 0",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
