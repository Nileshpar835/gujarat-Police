import { useMemo } from "react";

export default function RouteDetail({ route, onClose, onCameraClick }) {
  const stops = useMemo(() => {
    if (!route) return [];
    return Array.isArray(route.route) ? route.route : [];
  }, [route]);

  if (!route) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--border-primary)",
          background: "linear-gradient(135deg, rgba(6,182,212,0.08), transparent)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.03em" }}>
              {route.registration_number}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {[route.vehicle_type, route.color].filter(Boolean).join(" · ") || "Vehicle"}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {route.total_detections ?? stops.length} sighting{(route.total_detections ?? stops.length) === 1 ? "" : "s"} · {new Set(stops.map((s) => s.camera_code)).size} camera{(new Set(stops.map((s) => s.camera_code)).size) === 1 ? "" : "s"}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close route"
            style={{
              width: 26, height: 26,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, fontSize: 14,
              color: "var(--text-muted)", background: "transparent",
              border: "1px solid transparent",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "var(--border-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
          >
            ✕
          </button>
        </div>

        {/* Route progress bar */}
        {stops.length > 1 && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "var(--accent-green)", fontWeight: 600 }}>START</span>
            <div style={{ flex: 1, height: 3, background: "var(--bg-primary)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, var(--accent-green), var(--accent-cyan), var(--accent-red))", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, color: "var(--accent-red)", fontWeight: 600 }}>NOW</span>
          </div>
        )}
      </div>

      {/* Stops list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {stops.length === 0 && (
          <div style={{ padding: 20, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            No detections recorded yet.
          </div>
        )}

        {stops.map((stop, i) => {
          const isFirst = i === 0;
          const isLast = i === stops.length - 1;
          const dotColor = isFirst ? "var(--accent-green)" : isLast ? "var(--accent-red)" : "var(--accent-cyan)";
          const isActive = isFirst || isLast;

          return (
            <div
              key={stop.detection_id || i}
              style={{
                padding: "8px 14px",
                display: "flex",
                gap: 10,
                background: isActive ? "rgba(255,255,255,0.02)" : "transparent",
                borderLeft: isActive ? `2px solid ${dotColor}` : "2px solid transparent",
                transition: "background 0.15s",
              }}
            >
              {/* Timeline dot + connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                <div
                  style={{
                    width: isFirst || isLast ? 12 : 8,
                    height: isFirst || isLast ? 12 : 8,
                    borderRadius: "50%",
                    background: dotColor,
                    border: `2px solid ${dotColor}44`,
                    boxShadow: isActive ? `0 0 8px ${dotColor}44` : undefined,
                    flexShrink: 0,
                  }}
                />
                {i < stops.length - 1 && (
                  <div style={{
                    width: 1, flex: 1, minHeight: 16,
                    background: `linear-gradient(180deg, ${dotColor}44, var(--border-primary))`,
                  }} />
                )}
              </div>

              {/* Stop content */}
              <div style={{ minWidth: 0, flex: 1, paddingBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {stop.camera_name || stop.camera_code}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>
                  {stop.camera_code}
                  {stop.district ? ` · ${stop.district}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {stop.timestamp ? new Date(stop.timestamp).toLocaleString() : "—"}
                  </span>
                  {stop.ocr_confidence != null && (
                    <span style={{ fontSize: 9, color: "var(--accent-cyan)", opacity: 0.7 }}>
                      OCR {(stop.ocr_confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* Camera action */}
                {stop.camera_code && onCameraClick && (
                  <button
                    onClick={() => onCameraClick(stop)}
                    style={{
                      marginTop: 4, fontSize: 9, padding: "2px 6px",
                      background: "var(--accent-blue-dim)",
                      border: "1px solid rgba(37,99,235,0.3)",
                      borderRadius: 3, color: "var(--accent-blue-light)",
                      cursor: "pointer",
                    }}
                  >
                    ▶ View Feed
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 14px",
        borderTop: "1px solid var(--border-primary)",
        fontSize: 9, color: "var(--text-muted)",
        display: "flex", justifyContent: "space-between",
      }}>
        <span>{stops.length} stop{stops.length === 1 ? "" : "s"}</span>
        <span>{route.first_seen_at ? new Date(route.first_seen_at).toLocaleDateString() : ""} — {route.last_seen_at ? new Date(route.last_seen_at).toLocaleDateString() : ""}</span>
      </div>
    </div>
  );
}
