import { useState } from "react";
import { login } from "../api.js";
import gujLogo from "../gujlogo.png";

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
        background: "var(--bg-primary)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 400,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          borderRadius: "var(--radius-lg)",
          padding: 36,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Logo + Department */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <img src={gujLogo} alt="Gujarat Police" style={{ width: 72, height: 86, marginBottom: 12, borderRadius: 8, objectFit: "contain" }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", textAlign: "center" }}>
            Government of Gujarat
          </div>
          <div style={{ fontSize: 13, color: "var(--text-accent)", fontWeight: 500, textAlign: "center" }}>
            Home Department
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
            Gujarat CCTV Surveillance Platform
          </div>
        </div>

        {/* Demo credentials */}
        <div
          style={{
            marginBottom: 20,
            padding: "8px 12px",
            background: "var(--accent-blue-dim)",
            border: "1px solid rgba(37,99,235,0.3)",
            borderRadius: "var(--radius-sm)",
            fontSize: 11,
            color: "var(--text-secondary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Demo: <strong style={{ color: "var(--text-accent)" }}>admin</strong> / <strong style={{ color: "var(--text-accent)" }}>admin123</strong></span>
          <button
            type="button"
            onClick={() => { setUsername("admin"); setPassword("admin123"); }}
            style={{
              background: "none", border: "none", color: "var(--text-accent)",
              fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0,
            }}
          >
            Reset
          </button>
        </div>

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5, fontWeight: 500 }}>
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          style={{
            width: "100%", marginBottom: 16,
            background: "var(--bg-input)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 12px",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5, fontWeight: 500 }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%", marginBottom: 20,
            background: "var(--bg-input)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 12px",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />

        {error && (
          <div style={{ marginBottom: 14, fontSize: 12, color: "var(--accent-red)" }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? "var(--bg-tertiary)" : "var(--accent-blue)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "10px 0",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "background 0.15s",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
