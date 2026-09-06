export default function RouteDetail({ route, onClose }) {
  if (!route) return null;

  const stops = Array.isArray(route.route) ? route.route : [];

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        width: 320,
        maxHeight: "calc(100% - 32px)",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-primary)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
            {route.registration_number}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {route.vehicle_type || "vehicle"} · {route.color || "—"} · {route.total_detections ?? stops.length} sighting
            {(route.total_detections ?? stops.length) === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}
        >
          ×
        </button>
      </div>

      <div style={{ overflowY: "auto", padding: "8px 0" }}>
        {stops.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: "var(--text-muted)" }}>
            No detections recorded for this plate yet.
          </div>
        )}
        {stops.map((stop, i) => (
          <div key={stop.detection_id || i} style={{ padding: "8px 16px", display: "flex", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                marginTop: 4,
                flexShrink: 0,
                background:
                  i === 0 ? "var(--accent-green)" : i === stops.length - 1 ? "var(--accent-red)" : "var(--text-muted)",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{stop.camera_name || stop.camera_code}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {stop.camera_code} {stop.district ? `· ${stop.district}` : ""}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {stop.timestamp ? new Date(stop.timestamp).toLocaleString() : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}