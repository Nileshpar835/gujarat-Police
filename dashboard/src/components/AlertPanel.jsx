import { useState, useMemo } from "react";

const SEVERITY_STYLE = {
  critical: { fg: "#fca5a5", bg: "rgba(239,68,68,0.18)", border: "rgba(239,68,68,0.4)" },
  high: { fg: "#fbbf24", bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.4)" },
  medium: { fg: "#fbbf24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" },
  low: { fg: "#94a3b8", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)" },
};

const EVENT_LABEL = {
  watchlist_match: "Watchlist Hit",
  system: "System",
};

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function AlertCard({ alert, camera, onAcknowledge, onRoute }) {
  const [acking, setAcking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.low;
  const isNew = alert.status === "new";

  const handleAck = async (e) => {
    e.stopPropagation();
    setAcking(true);
    try { await onAcknowledge(alert.id); }
    finally { setAcking(false); }
  };

  const handleRoute = (e) => {
    e.stopPropagation();
    if (alert.detected_value && onRoute) onRoute(alert.detected_value);
  };

  return (
    <div
      style={{
        padding: "9px 12px",
        borderBottom: "1px solid var(--border-primary)",
        background: isNew ? "rgba(239,68,68,0.04)" : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Top row: severity + time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center", minWidth: 0 }}>
          <span
            className="mono"
            style={{
              fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              color: sev.fg, background: sev.bg,
              padding: "2px 5px", borderRadius: 3,
              border: `1px solid ${sev.border}`,
              flexShrink: 0,
            }}
          >
            {alert.severity}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {EVENT_LABEL[alert.event_type] || alert.event_type}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          {timeAgo(alert.triggered_at)}
        </span>
      </div>

      {/* Plate number */}
      <div className="mono" style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
        {alert.detected_value || "—"}
      </div>

      {/* Camera info */}
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {camera
          ? `${camera.camera_code} · ${camera.name || ""}`
          : alert.camera_id ? `Cam ${String(alert.camera_id).slice(0, 8)}` : "—"}
      </div>

      {/* Fuzzy match indicator */}
      {alert.match_confidence != null && alert.match_confidence < 1.0 && (
        <div style={{ fontSize: 9, color: "var(--accent-yellow)", marginTop: 2 }}>
          Fuzzy · {(alert.match_confidence * 100).toFixed(0)}% match
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div
          style={{
            marginTop: 6, padding: "6px 8px",
            background: "var(--bg-primary)", borderRadius: 4,
            fontSize: 11, color: "var(--text-secondary)",
            lineHeight: 1.8,
            border: "1px solid var(--border-primary)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div><span style={{ color: "var(--text-muted)" }}>Alert:</span> <span className="mono" style={{ fontSize: 10 }}>{String(alert.id).slice(0, 12)}…</span></div>
          <div><span style={{ color: "var(--text-muted)" }}>Time:</span> {new Date(alert.triggered_at).toLocaleString()}</div>
          {alert.entity_type && <div><span style={{ color: "var(--text-muted)" }}>Entity:</span> {alert.entity_type}</div>}
          {alert.acknowledged_at && (
            <div><span style={{ color: "var(--accent-green)" }}>✓ Acked:</span> {new Date(alert.acknowledged_at).toLocaleTimeString()}</div>
          )}
          {alert.evidence_uri && (
            <div>
              <a href={alert.evidence_uri} target="_blank" rel="noreferrer"
                style={{ color: "var(--accent-cyan)", fontSize: 10 }}>
                ↗ View Evidence
              </a>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {isNew && (
          <button
            onClick={handleAck}
            disabled={acking}
            style={{
              fontSize: 10, padding: "3px 8px",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-secondary)",
              borderRadius: 3, color: "var(--text-primary)", cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {acking ? "…" : "✓ Ack"}
          </button>
        )}
        {alert.detected_value && (
          <button
            onClick={handleRoute}
            style={{
              fontSize: 10, padding: "3px 8px",
              background: "var(--accent-blue-dim)",
              border: "1px solid rgba(37,99,235,0.4)",
              borderRadius: 3, color: "var(--accent-blue-light)", cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            ↗ Route
          </button>
        )}
      </div>

      {/* Acknowledged line */}
      {!isNew && alert.status === "acknowledged" && (
        <div style={{ marginTop: 4, fontSize: 9, color: "var(--accent-green)", opacity: 0.7 }}>
          ✓ Acknowledged{alert.acknowledged_at ? ` ${timeAgo(alert.acknowledged_at)} ago` : ""}
        </div>
      )}
    </div>
  );
}

export default function AlertPanel({ alerts = [], onAcknowledge, camerasById = {}, onRoute }) {
  const alertList = useMemo(() => Array.isArray(alerts) ? alerts : [], [alerts]);
  const newCount = alertList.filter((a) => a.status === "new").length;
  const criticalCount = alertList.filter((a) => a.status === "new" && a.severity === "critical").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Alert list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {alertList.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 6, opacity: 0.4 }}>🛡</div>
            No alerts yet
            <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>
              Alerts appear when detected plates match the watchlist.
            </div>
          </div>
        )}
        {alertList.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            camera={camerasById[alert.camera_id]}
            onAcknowledge={onAcknowledge}
            onRoute={onRoute}
          />
        ))}
      </div>
    </div>
  );
}
