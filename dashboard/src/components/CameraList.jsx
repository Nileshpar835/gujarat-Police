import { useState } from "react";
import { runHealthCheck } from "../api.js";

const STATUS_COLOR = {
  active: "var(--accent-green)",
  inactive: "var(--text-muted)",
  maintenance: "var(--accent-yellow)",
  decommissioned: "var(--accent-red)",
};

export default function CameraList({ cameras, onSelectCamera }) {
  const [healthResults, setHealthResults] = useState({});
  const [checking, setChecking] = useState({});
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
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Cameras</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {activeCount}/{cameras.length} online
        </span>
      </div>

      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border-primary)" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter cameras..."
          style={{
            width: "100%", background: "var(--bg-input)",
            border: "1px solid var(--border-primary)", borderRadius: "var(--radius-sm)",
            padding: "6px 8px", fontSize: 12, color: "var(--text-primary)", outline: "none",
          }}
        />
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
            {cameras.length === 0 ? "No cameras onboarded yet." : "No cameras match filter."}
          </div>
        )}
        {filtered.map((cam) => {
          const isWatchable = cam.status === "active";
          const health = healthResults[cam.id];
          const isChecking = checking[cam.id];

          return (
            <div key={cam.id} style={{ padding: "8px 14px", borderBottom: "1px solid var(--border-primary)" }}>
              <div
                onClick={() => isWatchable && onSelectCamera(cam)}
                title={isWatchable ? "View live stream" : "Camera inactive"}
                style={{ display: "flex", alignItems: "center", gap: 9, cursor: isWatchable ? "pointer" : "default" }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[cam.status] || STATUS_COLOR.inactive, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{cam.camera_code}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cam.name} · {cam.district || "---"}
                  </div>
                </div>
                <button
                  onClick={(e) => handleHealthCheck(e, cam)}
                  disabled={isChecking}
                  title="Health check"
                  style={{ fontSize: 10, padding: "2px 6px", background: "transparent", border: "1px solid var(--border-primary)", borderRadius: 3, color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}
                >
                  {isChecking ? "..." : "⟳"}
                </button>
              </div>
              {health && (
                <div style={{ marginTop: 4, fontSize: 10, color: health.is_reachable ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {health.is_reachable ? `✓ Reachable · ${health.latency_ms ?? "?"}ms` : `✗ Unreachable · ${health.error_message || "timeout"}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
