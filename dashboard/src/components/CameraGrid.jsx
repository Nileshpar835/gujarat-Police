import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import CameraPlayer from "./CameraPlayer.jsx";
import { normalizeCameraId } from "../utils/streamUrlBuilder.js";

const GRID_SIZES = [
  { id: "1x1", cols: 1, rows: 1, label: "1×1" },
  { id: "2x2", cols: 2, rows: 2, label: "2×2" },
  { id: "3x3", cols: 3, rows: 3, label: "3×3" },
  { id: "4x4", cols: 4, rows: 4, label: "4×4" },
  { id: "5x5", cols: 5, rows: 5, label: "5×5" },
];

function getResponsiveGrid() {
  if (typeof window === "undefined") return "3x3";
  const w = window.innerWidth;
  if (w < 900) return "2x2";
  if (w < 1300) return "3x3";
  return "4x4";
}

const CameraTile = memo(function CameraTile({
  camera,
  slotIndex,
  streamGatewayBaseUrl,
  showDiagnostics,
  onExpand,
  onStatusChange,
  tileSize,
}) {
  if (!camera) {
    return (
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px dashed var(--border-secondary)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "var(--text-muted)",
          cursor: "pointer",
          transition: "border-color 0.15s",
          minHeight: 140,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-secondary)"; }}
      >
        <div style={{ fontSize: 28, opacity: 0.3 }}>+</div>
        <div style={{ fontSize: 11, fontWeight: 500 }}>ASSIGN</div>
      </div>
    );
  }

  const camId = normalizeCameraId(camera.camera_code || camera.id);
  const displayName = camera.name || `Camera ${camId.toUpperCase()}`;
  const channelNum = slotIndex + 1;

  return (
    <div
      style={{
        position: "relative",
        background: "#000",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--border-primary)",
        display: "flex",
        flexDirection: "column",
        minHeight: 140,
      }}
    >
      {/* Video */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <CameraPlayer
          camera={camera}
          streamGatewayBaseUrl={streamGatewayBaseUrl}
          staggerIndex={slotIndex}
          showDiagnostics={showDiagnostics}
          onStatusChange={onStatusChange}
          onExpand={onExpand}
        />
      </div>

      {/* Bottom bar */}
      <div
        style={{
          padding: "4px 8px",
          background: "rgba(10,15,26,0.92)",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 3,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-accent)",
              fontFamily: "var(--font-mono)",
            }}
          >
            CH{String(channelNum).padStart(2, "0")}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onExpand?.(camera); }}
            title="Expand"
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
});

export default function CameraGrid({ cameras = [], streamGatewayBaseUrl = "/hls" }) {
  const [selectedGrid, setSelectedGrid] = useState(getResponsiveGrid);
  const [slots, setSlots] = useState(() => {
    const active = (cameras || []).filter((c) => c && c.status === "active");
    const count = GRID_SIZES.find((g) => g.id === "3x3")?.cols ** 2 || 9;
    const initial = Array(count).fill(null);
    active.slice(0, count).forEach((cam, i) => { initial[i] = cam; });
    return initial;
  });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [focusedCamera, setFocusedCamera] = useState(null);
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [layoutName, setLayoutName] = useState("Main Display");
  const [editingName, setEditingName] = useState(false);

  const gridConfig = GRID_SIZES.find((g) => g.id === selectedGrid) || GRID_SIZES[2];
  const totalSlots = gridConfig.cols * gridConfig.rows;

  useEffect(() => {
    const onResize = () => setSelectedGrid(getResponsiveGrid());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const activeCameras = useMemo(
    () => (cameras || []).filter((c) => c && c.status === "active"),
    [cameras]
  );

  useEffect(() => {
    setSlots((prev) => {
      if (prev.length === totalSlots) return prev;
      const next = Array(totalSlots).fill(null);
      for (let i = 0; i < Math.min(prev.length, totalSlots); i++) next[i] = prev[i];
      return next;
    });
  }, [totalSlots]);

  useEffect(() => {
    if (activeCameras.length > 0 && slots.every((s) => s === null)) {
      const next = Array(totalSlots).fill(null);
      activeCameras.slice(0, totalSlots).forEach((cam, i) => { next[i] = cam; });
      setSlots(next);
    }
  }, [activeCameras, totalSlots]);

  const handleStatusChange = useCallback((camId, status) => {
    setCameraStatuses((prev) => {
      if (prev[camId] === status) return prev;
      return { ...prev, [camId]: status };
    });
  }, []);

  const summaryStats = useMemo(() => {
    let live = 0, reconnecting = 0, loading = 0, offline = 0;
    slots.forEach((cam) => {
      if (!cam) return;
      const id = normalizeCameraId(cam.camera_code || cam.id);
      const st = cameraStatuses[id] || "loading";
      if (st === "live") live++;
      else if (st === "reconnecting") reconnecting++;
      else if (st === "loading") loading++;
      else offline++;
    });
    return { live, reconnecting, loading, offline, total: slots.filter(Boolean).length };
  }, [slots, cameraStatuses]);

  const handleFillAll = () => {
    const next = Array(totalSlots).fill(null);
    activeCameras.slice(0, totalSlots).forEach((cam, i) => { next[i] = cam; });
    setSlots(next);
  };

  const handleClearAll = () => setSlots(Array(totalSlots).fill(null));

  const handleAssignSlot = (slotIdx) => {
    const unassigned = activeCameras.find(
      (cam) => !slots.some((s) => s && (s.id === cam.id || s.camera_code === cam.camera_code))
    );
    if (unassigned) {
      setSlots((prev) => { const next = [...prev]; next[slotIdx] = unassigned; return next; });
    }
  };

  const displayedSlots = slots.slice(0, totalSlots);
  const liveCount = summaryStats.live;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top toolbar */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-secondary)",
            flexShrink: 0,
          }}
        >
          {/* Layout name */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {editingName ? (
              <input
                autoFocus
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  background: "var(--bg-input)",
                  border: "1px solid var(--accent-blue)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  padding: "2px 6px",
                  outline: "none",
                  width: 160,
                }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {layoutName}
              </span>
            )}
            <button
              onClick={() => setEditingName(true)}
              style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 4px" }}
            >
              ✏
            </button>
          </div>

          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {gridConfig.label} · {summaryStats.total} / {totalSlots} cameras
          </span>

          {/* Grid size buttons */}
          <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
            {GRID_SIZES.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGrid(g.id)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: selectedGrid === g.id ? 600 : 400,
                  background: selectedGrid === g.id ? "var(--accent-blue)" : "transparent",
                  color: selectedGrid === g.id ? "#fff" : "var(--text-secondary)",
                  border: selectedGrid === g.id ? "1px solid var(--accent-blue-light)" : "1px solid var(--border-secondary)",
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDiagnostics((d) => !d)}
            style={{
              fontSize: 10,
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              background: showDiagnostics ? "var(--accent-cyan)" : "transparent",
              border: `1px solid ${showDiagnostics ? "var(--accent-cyan)" : "var(--border-secondary)"}`,
              color: showDiagnostics ? "#fff" : "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            SURVEILLANCE
          </button>
        </div>

        {/* Camera Grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
            gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
            gap: 4,
            padding: 4,
            background: "var(--bg-primary)",
            overflow: "hidden",
          }}
        >
          {displayedSlots.map((cam, idx) => (
            <CameraTile
              key={cam ? cam.id || cam.camera_code : `empty-${idx}`}
              camera={cam}
              slotIndex={idx}
              streamGatewayBaseUrl={streamGatewayBaseUrl}
              showDiagnostics={showDiagnostics}
              onExpand={setFocusedCamera}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>

        {/* Bottom status bar */}
        <div
          style={{
            padding: "4px 16px",
            borderTop: "1px solid var(--border-primary)",
            background: "var(--bg-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <span>
            Page 1 of 1 · {summaryStats.live} live, {summaryStats.reconnecting > 0 ? `${summaryStats.reconnecting} reconnecting, ` : ""}{summaryStats.loading > 0 ? `${summaryStats.loading} connecting, ` : ""}{totalSlots - summaryStats.total} empty
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleFillAll}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                background: "var(--accent-blue-dim)",
                border: "1px solid var(--accent-blue)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-accent)",
                fontWeight: 500,
              }}
            >
              Auto-Fill ({activeCameras.length})
            </button>
            <button
              onClick={handleClearAll}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                background: "transparent",
                border: "1px solid var(--border-secondary)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
              }}
            >
              Clear
            </button>
          </div>
        </div>

      {/* ── Fullscreen Focused Camera ── */}
      {focusedCamera && (
        <div
          onClick={() => setFocusedCamera(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 1100,
              aspectRatio: "16/9",
              background: "#000",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              border: "1px solid var(--border-secondary)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                background: "var(--bg-secondary)",
                borderBottom: "1px solid var(--border-primary)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="mono" style={{ fontWeight: 700, color: "var(--text-accent)", fontSize: 13 }}>
                  {focusedCamera.camera_code}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {focusedCamera.name}
                </span>
              </div>
              <button
                onClick={() => setFocusedCamera(null)}
                style={{ color: "var(--text-secondary)", fontSize: 18, padding: "0 4px" }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <CameraPlayer
                camera={focusedCamera}
                streamGatewayBaseUrl={streamGatewayBaseUrl}
                isFocused={true}
                showDiagnostics={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
