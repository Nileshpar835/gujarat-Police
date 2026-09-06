import React, { useState, useMemo, useEffect, useCallback, memo } from "react";
import CameraPlayer from "./CameraPlayer.jsx";
import { normalizeCameraId } from "../utils/streamUrlBuilder.js";

const GRID_PRESETS = [
  { id: "wall30", label: "30-Wall (5×6)", cols: 5, max: 30 },
  { id: "grid16", label: "4×4 (16)", cols: 4, max: 16 },
  { id: "grid9", label: "3×3 (9)", cols: 3, max: 9 },
  { id: "grid4", label: "2×2 (4)", cols: 2, max: 4 },
];

function getResponsiveColumns() {
  if (typeof window === "undefined") return 5;
  const w = window.innerWidth;
  if (w < 640) return 1;
  if (w < 900) return 2;
  if (w < 1200) return 3;
  if (w < 1600) return 4;
  return 5;
}

// Memoized individual camera tile to prevent re-renders of all tiles when one changes
const CameraTile = memo(function CameraTile({
  camera,
  slotIndex,
  isActiveSlot,
  streamGatewayBaseUrl,
  showDiagnostics,
  onSlotClick,
  onRemove,
  onExpand,
  onStatusChange,
}) {
  if (!camera) {
    return (
      <div
        onClick={() => onSlotClick(slotIndex)}
        style={{
          position: "relative",
          background: "#0a0e14",
          border: isActiveSlot ? "2px solid #3b82f6" : "1px dashed var(--border-hairline, #1e2a3a)",
          borderRadius: 6,
          overflow: "hidden",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: isActiveSlot ? "#3b82f6" : "var(--text-tertiary, #64748b)",
          minHeight: 110,
        }}
      >
        <div style={{ fontSize: 18 }}>+</div>
        <div style={{ fontSize: 10 }}>Slot {slotIndex + 1}</div>
      </div>
    );
  }

  const camId = normalizeCameraId(camera.camera_code || camera.id);
  const displayName = camera.name || `Camera ${camId.toUpperCase()}`;

  return (
    <div
      onClick={() => onSlotClick(slotIndex)}
      style={{
        position: "relative",
        background: "#070b10",
        border: isActiveSlot ? "2px solid #3b82f6" : "1px solid var(--border-hairline, #1a2434)",
        borderRadius: 5,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 110,
      }}
    >
      {/* Video stream container */}
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

      {/* Sleek bottom camera label bar */}
      <div
        style={{
          padding: "3px 8px",
          background: "rgba(10, 14, 20, 0.92)",
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 3,
        }}
      >
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          <span
            className="mono"
            style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", marginRight: 6 }}
          >
            {camera.camera_code || camId.toUpperCase()}
          </span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{displayName}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand(camera);
            }}
            title="Focus / Expand Camera"
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 10,
              padding: "0 2px",
            }}
          >
            ⛶
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(slotIndex);
            }}
            title="Clear slot"
            style={{
              background: "none",
              border: "none",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: 12,
              padding: "0 2px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
});

export default function CameraGrid({ cameras = [], streamGatewayBaseUrl = "/hls" }) {
  const [selectedPreset, setSelectedPreset] = useState(GRID_PRESETS[0]);
  const [responsiveCols, setResponsiveCols] = useState(getResponsiveColumns);
  const [slots, setSlots] = useState(() => {
    const active = (cameras || []).filter((c) => c && c.status === "active");
    const initial = Array(30).fill(null);
    active.slice(0, 30).forEach((cam, i) => { initial[i] = cam; });
    return initial;
  });

  const [activeSlot, setActiveSlot] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [focusedCamera, setFocusedCamera] = useState(null);
  const [cameraStatuses, setCameraStatuses] = useState({});

  const activeCameras = useMemo(
    () => (cameras || []).filter((c) => c && c.status === "active"),
    [cameras]
  );

  useEffect(() => {
    const onResize = () => setResponsiveCols(getResponsiveColumns());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (activeCameras.length > 0 && slots.every((s) => s === null)) {
      const nextSlots = Array(selectedPreset.max).fill(null);
      activeCameras.slice(0, selectedPreset.max).forEach((cam, i) => { nextSlots[i] = cam; });
      setSlots(nextSlots);
    }
  }, [activeCameras, selectedPreset.max]);

  // Handle status update from individual players
  const handleStatusChange = useCallback((camId, status) => {
    setCameraStatuses((prev) => {
      if (prev[camId] === status) return prev;
      return { ...prev, [camId]: status };
    });
  }, []);

  // Compute live summary statistics
  const summaryStats = useMemo(() => {
    const displayed = slots.slice(0, selectedPreset.max);
    let totalAssigned = 0;
    let live = 0;
    let reconnecting = 0;
    let loading = 0;
    let offline = 0;

    displayed.forEach((cam) => {
      if (!cam) return;
      totalAssigned += 1;
      const id = normalizeCameraId(cam.camera_code || cam.id);
      const st = cameraStatuses[id] || "loading";
      if (st === "live") live += 1;
      else if (st === "reconnecting") reconnecting += 1;
      else if (st === "loading") loading += 1;
      else offline += 1;
    });

    return { total: totalAssigned, live, reconnecting, loading, offline };
  }, [slots, selectedPreset.max, cameraStatuses]);

  const handleSlotClick = useCallback((slotIdx) => {
    setActiveSlot((cur) => (cur === slotIdx ? null : slotIdx));
  }, []);

  const handleAssignCamera = useCallback(
    (cam) => {
      if (activeSlot === null) return;
      setSlots((prev) => {
        const next = [...prev];
        next[activeSlot] = cam;
        return next;
      });
      setActiveSlot(null);
    },
    [activeSlot]
  );

  const handleRemoveSlot = useCallback((slotIdx) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
    setActiveSlot((cur) => (cur === slotIdx ? null : cur));
  }, []);

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setActiveSlot(null);
    setSlots((prev) => {
      const next = Array(preset.max).fill(null);
      activeCameras.slice(0, preset.max).forEach((cam, i) => {
        next[i] = prev[i] || cam;
      });
      return next;
    });
  };

  const handleFillAll = () => {
    const newSlots = Array(selectedPreset.max).fill(null);
    activeCameras.slice(0, selectedPreset.max).forEach((cam, i) => {
      newSlots[i] = cam;
    });
    setSlots(newSlots);
    setActiveSlot(null);
  };

  const handleClearAll = () => {
    setSlots(Array(selectedPreset.max).fill(null));
    setActiveSlot(null);
  };

  const effectiveCols = Math.min(responsiveCols, selectedPreset.cols);
  const displayedSlots = slots.slice(0, selectedPreset.max);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#05080c" }}>
      {/* ── Grid Control Header ── */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-hairline, #1e2a3a)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background: "var(--bg-panel, #0f172a)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc" }}>
          SENTINEL LIVE WALL
        </span>

        {/* Layout Presets */}
        <div style={{ display: "flex", gap: 3 }}>
          {GRID_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetChange(preset)}
              style={{
                fontSize: 11,
                padding: "3px 9px",
                background: selectedPreset.id === preset.id ? "#1e3a8a" : "var(--bg-panel-raised, #1e293b)",
                border: `1px solid ${selectedPreset.id === preset.id ? "#3b82f6" : "#334155"}`,
                borderRadius: 4,
                color: selectedPreset.id === preset.id ? "#bfdbfe" : "#94a3b8",
                cursor: "pointer",
                fontWeight: selectedPreset.id === preset.id ? 600 : 400,
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Live Grid Status Summary Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "2px 10px",
            background: "rgba(15, 23, 42, 0.7)",
            border: "1px solid #334155",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
            {summaryStats.total} / {selectedPreset.max} Active
          </span>
          <span style={{ color: "#4ade80", fontWeight: 600 }}>
            ● {summaryStats.live} Live
          </span>
          {summaryStats.reconnecting > 0 && (
            <span style={{ color: "#facc15", fontWeight: 600 }}>
              ↺ {summaryStats.reconnecting} Reconnecting
            </span>
          )}
          {summaryStats.loading > 0 && (
            <span style={{ color: "#38bdf8" }}>
              ⏳ {summaryStats.loading} Connecting
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <button
            onClick={() => setShowDiagnostics((d) => !d)}
            style={{
              fontSize: 10,
              padding: "4px 8px",
              background: showDiagnostics ? "#0e7490" : "transparent",
              border: `1px solid ${showDiagnostics ? "#06b6d4" : "#475569"}`,
              borderRadius: 4,
              color: showDiagnostics ? "#cffafe" : "#94a3b8",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {showDiagnostics ? "✓ Diagnostics On" : "⚡ Diagnostics"}
          </button>

          <button
            onClick={handleFillAll}
            style={{
              fontSize: 11,
              padding: "4px 12px",
              background: "#0284c7",
              border: "1px solid #38bdf8",
              borderRadius: 4,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ⚡ Auto-Fill All ({activeCameras.length})
          </button>

          <button
            onClick={handleClearAll}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              background: "transparent",
              border: "1px solid #475569",
              borderRadius: 4,
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Main Viewport ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Adaptive Video Wall Grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
            gridAutoRows: selectedPreset.max >= 25 ? "minmax(130px, 1fr)" : "minmax(180px, 1fr)",
            gap: 4,
            padding: 5,
            background: "#05080c",
            overflowY: "auto",
          }}
        >
          {displayedSlots.map((cam, idx) => (
            <CameraTile
              key={cam ? cam.id || cam.camera_code : `slot-${idx}`}
              camera={cam}
              slotIndex={idx}
              isActiveSlot={activeSlot === idx}
              streamGatewayBaseUrl={streamGatewayBaseUrl}
              showDiagnostics={showDiagnostics}
              onSlotClick={handleSlotClick}
              onRemove={handleRemoveSlot}
              onExpand={(c) => setFocusedCamera(c)}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>

        {/* Active Camera Sidebar for manual assignment */}
        <div
          style={{
            width: 210,
            flexShrink: 0,
            borderLeft: "1px solid #1e293b",
            background: "#0b121e",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: 10,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: "1px solid #1e293b",
            }}
          >
            Camera Pool ({activeCameras.length})
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {activeCameras.map((cam) => {
              const isAssigned = slots.some((s) => s && (s.id === cam.id || s.camera_code === cam.camera_code));
              return (
                <div
                  key={cam.id}
                  onClick={() => activeSlot !== null && !isAssigned && handleAssignCamera(cam)}
                  style={{
                    padding: "7px 10px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                    cursor: activeSlot !== null && !isAssigned ? "pointer" : "default",
                    opacity: isAssigned ? 0.45 : 1,
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (activeSlot !== null && !isAssigned) e.currentTarget.style.background = "#1e293b";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>
                    {cam.camera_code}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cam.name}
                  </div>
                  {isAssigned && (
                    <div style={{ fontSize: 9, color: "#22c55e", marginTop: 1 }}>✓ On wall</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── High Quality Focused / Fullscreen Overlay ── */}
      {focusedCamera && (
        <div
          onClick={() => setFocusedCamera(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(6px)",
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
              maxWidth: 960,
              aspectRatio: "16/9",
              background: "#080c12",
              border: "1px solid #334155",
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                background: "#0f172a",
                borderBottom: "1px solid #1e293b",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span className="mono" style={{ fontWeight: 700, color: "#38bdf8", marginRight: 8 }}>
                  {focusedCamera.camera_code}
                </span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  {focusedCamera.name} · High-Quality Live Stream
                </span>
              </div>
              <button
                onClick={() => setFocusedCamera(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: 18,
                  cursor: "pointer",
                }}
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
