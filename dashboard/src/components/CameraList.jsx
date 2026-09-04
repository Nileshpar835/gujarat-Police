const STATUS_LABEL = {
  active: "active",
  inactive: "inactive",
  maintenance: "maintenance",
  decommissioned: "decommissioned",
};

const STATUS_COLOR = {
  active: "var(--accent-active)",
  inactive: "var(--text-tertiary)",
  maintenance: "var(--severity-high)",
  decommissioned: "var(--severity-critical)",
};

export default function CameraList({ cameras, onSelectCamera }) {
  const activeCount = cameras.filter((c) => c.status === "active").length;

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
        <span style={{ fontWeight: 600, fontSize: 13 }}>Cameras</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {activeCount}/{cameras.length} online
        </span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {cameras.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            No cameras onboarded yet.
          </div>
        )}
        {cameras.map((cam) => {
          const isWatchable = cam.status === "active";
          return (
            <div
              key={cam.id}
              onClick={() => isWatchable && onSelectCamera(cam)}
              title={isWatchable ? "View live stream" : "Camera is not active — no stream to view"}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-hairline)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: isWatchable ? "pointer" : "default",
              }}
              onMouseEnter={(e) => {
                if (isWatchable) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: STATUS_COLOR[cam.status] || STATUS_COLOR.inactive,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                  {cam.camera_code}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cam.name} · {cam.district || "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
