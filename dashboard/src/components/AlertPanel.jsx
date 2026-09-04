import { useState } from "react";

const SEVERITY_STYLE = {
  critical: { fg: "var(--severity-critical)", bg: "var(--severity-critical-dim)" },
  high: { fg: "var(--severity-high)", bg: "var(--severity-high-dim)" },
  medium: { fg: "var(--severity-medium)", bg: "var(--severity-medium-dim)" },
  low: { fg: "var(--severity-low)", bg: "var(--severity-low-dim)" },
};

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function AlertPanel({ alerts, onAcknowledge, camerasById }) {
  const [ackingId, setAckingId] = useState(null);

  const handleAck = async (alertId) => {
    setAckingId(alertId);
    try {
      await onAcknowledge(alertId);
    } finally {
      setAckingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>Alerts</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {alerts.filter((a) => a.status === "new").length} new
        </span>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {alerts.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            No alerts yet. Alerts appear here the moment a detected plate matches the watchlist.
          </div>
        )}
        {alerts.map((alert) => {
          const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.low;
          const camera = camerasById[alert.camera_id];
          return (
            <div
              key={alert.id}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-hairline)",
                opacity: alert.status === "acknowledged" ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: style.fg,
                    background: style.bg,
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  {alert.severity}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {timeAgo(alert.triggered_at)}
                </span>
              </div>

              <div className="mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>
                {alert.detected_value}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {camera ? `${camera.camera_code} · ${camera.district || "—"}` : alert.camera_id}
              </div>

              {alert.status === "new" && (
                <button
                  onClick={() => handleAck(alert.id)}
                  disabled={ackingId === alert.id}
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    padding: "4px 10px",
                    background: "var(--bg-panel-raised)",
                    border: "1px solid var(--border-hairline)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                  }}
                >
                  {ackingId === alert.id ? "Acknowledging…" : "Acknowledge"}
                </button>
              )}
              {alert.status === "acknowledged" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>Acknowledged</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
