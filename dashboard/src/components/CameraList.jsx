import { useState, useMemo } from "react";
import { runHealthCheck } from "../api.js";

const STATUS_COLOR = {
  active: "var(--accent-green)",
  inactive: "var(--text-muted)",
  maintenance: "var(--accent-yellow)",
  decommissioned: "var(--accent-red)",
};

const STATUS_LABEL = {
  active: "Online",
  inactive: "Offline",
  maintenance: "Maint.",
  decommissioned: "Retired",
};

export default function CameraList({ cameras, onSelectCamera, compact = false }) {
  const [healthResults, setHealthResults] = useState({});
  const [checking, setChecking] = useState({});
  const [filter, setFilter] = useState("");
  const [hoveredCam, setHoveredCam] = useState(null);

  const activeCount = cameras.filter((c) => c.status === "active").length;
  const totalCount = cameras.length;

  const filtered = useMemo(() => {
    if (!filter) return cameras;
    const q = filter.toLowerCase();
    return cameras.filter(
      (c) =>
        c.camera_code?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.district?.toLowerCase().includes(q)
    );
  }, [cameras, filter]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((cam) => {
      const district = cam.district || "Unknown";
      if (!groups[district]) groups[district] = [];
      groups[district].push(cam);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const handleHealthCheck = async (e, cam) => {
    e.stopPropagation();
    setChecking((p) => ({ ...p, [cam.id]: true }));
    try {
      const result = await runHealthCheck(cam.id);
      setHealthResults((p) => ({ ...p, [cam.id]: result }));
    } catch {
      setHealthResults((p) => ({ ...p, [cam.id]: { is_reachable: false, error_message: "Failed" } }));
    } finally {
      setChecking((p) => ({ ...p, [cam.id]: false }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-primary)" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)" }}>⌕</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter cameras..."
            style={{
              width: "100%",
              background: "var(--bg-input)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-sm)",
              padding: "5px 8px 5px 24px",
              fontSize: 11,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                fontSize: 10, color: "var(--text-muted)", cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Camera list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
            {cameras.length === 0 ? "No cameras onboarded" : "No matches"}
          </div>
        )}

        {grouped.map(([district, cams]) => (
          <div key={district}>
            {/* District header */}
            <div
              style={{
                padding: "5px 10px",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                background: "var(--bg-primary)",
                borderTop: "1px solid var(--border-primary)",
                borderBottom: "1px solid var(--border-primary)",
              }}
            >
              {district} ({cams.length})
            </div>

            {cams.map((cam) => {
              const isWatchable = cam.status === "active";
              const health = healthResults[cam.id];
              const isChecking = checking[cam.id];
              const isHovered = hoveredCam === cam.id;
              const isViewing = false;

              return (
                <div
                  key={cam.id}
                  onMouseEnter={() => setHoveredCam(cam.id)}
                  onMouseLeave={() => setHoveredCam(null)}
                  onClick={() => isWatchable && onSelectCamera?.(cam)}
                  style={{
                    padding: "7px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: isWatchable ? "pointer" : "default",
                    background: isHovered ? "var(--bg-hover)" : "transparent",
                    borderLeft: isViewing ? "2px solid var(--accent-blue)" : "2px solid transparent",
                    transition: "background 0.1s",
                  }}
                >
                  {/* Status indicator */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: STATUS_COLOR[cam.status] || STATUS_COLOR.inactive,
                        boxShadow: cam.status === "active" ? `0 0 6px ${STATUS_COLOR.active}66` : undefined,
                      }}
                    />
                  </div>

                  {/* Camera info */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
                        {cam.camera_code}
                      </span>
                      <span style={{
                        fontSize: 8, fontWeight: 600, textTransform: "uppercase",
                        padding: "1px 4px", borderRadius: 2,
                        background: STATUS_COLOR[cam.status] + "22",
                        color: STATUS_COLOR[cam.status],
                      }}>
                        {STATUS_LABEL[cam.status]}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 10, color: "var(--text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      maxWidth: compact ? 120 : 180,
                    }}>
                      {cam.name || "—"}
                    </div>
                  </div>

                  {/* Actions */}
                  {isHovered && (
                    <button
                      onClick={(e) => handleHealthCheck(e, cam)}
                      disabled={isChecking}
                      title="Health check"
                      style={{
                        fontSize: 9, padding: "2px 5px",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: 3,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {isChecking ? "…" : "⟳"}
                    </button>
                  )}

                  {/* View button */}
                  {isHovered && isWatchable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectCamera?.(cam); }}
                      style={{
                        fontSize: 9, padding: "2px 6px",
                        background: "var(--accent-blue-dim)",
                        border: "1px solid var(--accent-blue)",
                        borderRadius: 3,
                        color: "var(--accent-blue-light)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      ▶
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
