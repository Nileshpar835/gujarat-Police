import { useState } from "react";

const SEVERITY_STYLE = {
  critical: { fg: "var(--severity-critical)", bg: "var(--severity-critical-dim)" },
  high: { fg: "var(--severity-high)", bg: "var(--severity-high-dim)" },
  medium: { fg: "var(--severity-medium)", bg: "var(--severity-medium-dim)" },
  low: { fg: "var(--severity-low)", bg: "var(--severity-low-dim)" },
};

const EVENT_TYPE_LABEL = {
  watchlist_match: "Watchlist Match",
  system: "System",
};

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function AlertCard({ alert, camera, onAcknowledge }) {
  const [acking, setAcking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.low;

  const handleAck = async () => {
    setAcking(true);
    try { await onAcknowledge(alert.id); }
    finally { setAcking(false); }
  };

  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border-hairline)",
        opacity: alert.status === "acknowledged" ? 0.55 : 1,
        cursor: "pointer",
      }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Row 1: severity badge + event type + time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            className="mono"
            style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              color: style.fg, background: style.bg,
              padding: "2px 6px", borderRadius: 3,
            }}
          >
            {alert.severity}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {EVENT_TYPE_LABEL[alert.event_type] || alert.event_type}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {timeAgo(alert.triggered_at)}
        </span>
      </div>

      {/* Row 2: detected plate */}
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 5, color: "var(--text-primary)" }}>
        {alert.detected_value || "—"}
      </div>

      {/* Row 3: camera info */}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
        {camera
          ? `${camera.camera_code} · ${camera.name || ""} · ${camera.district || "—"}`
          : alert.camera_id
            ? `Camera ${String(alert.camera_id).slice(0, 8)}…`
            : "No camera info"}
      </div>

      {/* Row 4: match confidence (if fuzzy match) */}
      {alert.match_confidence != null && alert.match_confidence < 1.0 && (
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
          Fuzzy match · confidence: {(alert.match_confidence * 100).toFixed(0)}%
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            marginTop: 8, padding: "8px 10px",
            background: "var(--bg-void)", borderRadius: 4,
            fontSize: 12, color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div><strong>Alert ID:</strong> <span className="mono" style={{ fontSize: 11 }}>{String(alert.id).slice(0, 16)}…</span></div>
          <div><strong>Triggered:</strong> {new Date(alert.triggered_at).toLocaleString()}</div>
          {alert.entity_type && <div><strong>Entity:</strong> {alert.entity_type}</div>}
          {alert.acknowledged_at && (
            <div><strong>Acknowledged:</strong> {new Date(alert.acknowledged_at).toLocaleString()}</div>
          )}
          {alert.evidence_uri && (
            <div>
              <strong>Evidence:</strong>{" "}
              <a href={alert.evidence_uri} target="_blank" rel="noreferrer"
                style={{ color: "var(--accent-active)" }}>
                View
              </a>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {alert.status === "new" && (
        <button
          onClick={(e) => { e.stopPropagation(); handleAck(); }}
          disabled={acking}
          style={{
            marginTop: 8, fontSize: 11, padding: "4px 10px",
            background: "var(--bg-panel-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 4, color: "var(--text-primary)", cursor: "pointer",
          }}
        >
          {acking ? "Acknowledging…" : "✓ Acknowledge"}
        </button>
      )}
      {alert.status === "acknowledged" && (
        <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-tertiary)" }}>
          ✓ Acknowledged {alert.acknowledged_at ? new Date(alert.acknowledged_at).toLocaleTimeString() : ""}
        </div>
      )}
    </div>
  );
}

export default function AlertPanel({ alerts = [], onAcknowledge, camerasById = {} }) {
  const alertList = Array.isArray(alerts) ? alerts : [];
  const newCount = alertList.filter((a) => a.status === "new").length;

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
        <span style={{ fontWeight: 600, fontSize: 13 }}>Live Alerts</span>
        <span
          className="mono"
          style={{
            fontSize: 11, fontWeight: 700,
            color: newCount > 0 ? "var(--severity-critical)" : "var(--text-tertiary)",
          }}
        >
          {newCount} new
        </span>
      </div>

      {/* Alert list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {alertList.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            No alerts yet.<br />
            <span style={{ fontSize: 11, lineHeight: 1.6 }}>
              Alerts appear when a detected plate matches the watchlist.
            </span>
          </div>
        )}
        {alertList.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            camera={camerasById[alert.camera_id]}
            onAcknowledge={onAcknowledge}
          />
        ))}
      </div>
    </div>
  );
}
