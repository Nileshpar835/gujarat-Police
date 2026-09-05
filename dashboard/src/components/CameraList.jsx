import { useState } from "react";
import { runHealthCheck } from "../api.js";

const STATUS_COLOR = {
  active: "var(--accent-active)",
  inactive: "var(--text-tertiary)",
  maintenance: "var(--severity-high)",
  decommissioned: "var(--severity-critical)",
};

export default function CameraList({ cameras, onSelectCamera }) {
  const [healthResults, setHealthResults] = useState({}); // camera_id -> result
  const [checking, setChecking] = useState({}); // camera_id -> bool
  const [filter, setFilter] = useState("");

  const activeCount = cameras.filter((c) => c.status === "active").length;

  const handleHealthCheck = async (e, cam) => {
    e.stopPropagation();
    setChecking((p) => ({ ...p, [cam.id]: true }));
    try {
      const result = await runHealthCheck(cam.id);
      setHealthResults((p) => ({ ...p, [cam.id]: result }));
    } catch {
      setHealthResults((p) => ({ ...p, [cam.id]: { is_reachable: false, error_message: "Request failed" } }));
    } finally {
      setChecking((p) => ({ ...p, [cam.id]: false }));
    }
  };

  const filtered = filter
    ? cameras.filter(
        (c) =>
          c.camera_code.toLowerCase().includes(filter.toLowerCase()) ||
          c.name?.toLowerCase().includes(filter.toLowerCase()) ||
          c.district?.toLowerCase().includes(filter.toLowerCase())
      )
    : cameras;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-hairline)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>Cameras</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {activeCount}/{cameras.length} online
        </span>
      </div>

      {/* Search filter */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border-hairline)" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter cameras…"
          style={{
            width: "100%", background: "var(--bg-void)",
            border: "1px solid var(--border-hairline)", borderRadius: 4,
            padding: "5px 8px", fontSize: 12, color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Camera list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            {cameras.length === 0 ? "No cameras onboarded yet." : "No cameras match filter."}
          </div>
        )}
        {filtered.map((cam) => {
          const isWatchable = cam.status === "active";
          const health = healthResults[cam.id];
          const isChecking = checking[cam.id];

          return (
            <div
              key={cam.id}
              style={{
                padding: "9px 14px",
                borderBottom: "1px solid var(--border-hairline)",
              }}
            >
              {/* Camera row */}
              <div
                onClick={() => isWatchable && onSelectCamera(cam)}
                title={isWatchable ? "View live stream" : "Camera is not active"}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  cursor: isWatchable ? "pointer" : "default",
                }}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: STATUS_COLOR[cam.status] || STATUS_COLOR.inactive,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                    {cam.camera_code}
                  </div>
                  <div
                    style={{
                      fontSize: 11, color: "var(--text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {cam.name} · {cam.district || "—"}
                  </div>
                </div>
                {/* Health check button */}
                <button
                  onClick={(e) => handleHealthCheck(e, cam)}
                  disabled={isChecking}
                  title="Run health check"
                  style={{
                    fontSize: 10, padding: "2px 6px",
                    background: "var(--bg-void)",
                    border: "1px solid var(--border-hairline)",
                    borderRadius: 3, color: "var(--text-tertiary)",
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  {isChecking ? "…" : "⟳"}
                </button>
              </div>

              {/* Health result */}
              {health && (
                <div
                  style={{
                    marginTop: 4, fontSize: 11,
                    color: health.is_reachable ? "var(--accent-active)" : "var(--severity-critical)",
                  }}
                >
                  {health.is_reachable
                    ? `✓ Reachable · ${health.latency_ms ?? "?"}ms`
                    : `✗ Unreachable · ${health.error_message || "timeout"}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
