import { useState } from "react";

export default function VehicleSearch({ onSearch, loading, error }) {
  const [value, setValue] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim());
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        placeholder="Enter registration number (e.g. GJ01AB1234)"
        className="mono"
        style={{
          background: "var(--bg-panel-raised)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 6,
          padding: "8px 12px",
          color: "var(--text-primary)",
          fontSize: 13,
          width: 280,
        }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          background: "var(--accent-active-dim)",
          color: "var(--accent-active)",
          border: "1px solid var(--accent-active)",
          borderRadius: 6,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {loading ? "Tracing…" : "Trace vehicle"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "var(--severity-critical)" }}>{error}</span>
      )}
    </form>
  );
}
