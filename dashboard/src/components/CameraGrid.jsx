// import { useState } from "react";
import LiveVideoPlayer from "./LiveVideoPlayer.jsx";
import { useState, useMemo, useCallback, memo } from "react";
import React, { useState, useMemo, useCallback, memo } from "react";
import CameraPlayer from "./CameraPlayer.jsx";
import { normalizeCameraId } from "../utils/streamUrlBuilder.js";

const GRID_SIZES = [
  { label: "2×2 (4)", cols: 2, max: 4 },
  { label: "3×3 (9)", cols: 3, max: 9 },
  { label: "4×4 (16)", cols: 4, max: 16 },
  { label: "All 30", cols: 5, max: 30 },
  
const GRID_PRESETS = [
  { id: "wall30", label: "30-Wall (5×6)", cols: 5, max: 30 },
  { id: "grid16", label: "4×4 (16)", cols: 4, max: 16 },
  { id: "grid9", label: "3×3 (9)", cols: 3, max: 9 },
  { id: "grid4", label: "2×2 (4)", cols: 2, max: 4 },
];

export default function CameraGrid({ cameras = [], streamGatewayBaseUrl }) {
  const [gridSize, setGridSize] = useState(GRID_SIZES[0]);
  const [slots, setSlots] = useState(Array(4).fill(null)); // null = empty slot
  const [activeSlot, setActiveSlot] = useState(null); // slot index being assigned
  const [all30Page, setAll30Page] = useState(0); // 0: 1-10, 1: 11-20, 2: 21-30, -1: Show All 30
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
          minHeight: 120,
          minHeight: 110,
        }}
      >
        <div style={{ fontSize: 18 }}>+</div>
        <div style={{ fontSize: 10 }}>Slot {slotIndex + 1}</div>
      </div>
    );
  }

  const activeCameras = (cameras || []).filter((c) => c && c.status === "active");
  const camId = normalizeCameraId(camera.camera_code || camera.id);
  const displayName = camera.name || `Camera ${camId.toUpperCase()}`;

  const handleSlotClick = (slotIndex) => {
    setActiveSlot(slotIndex === activeSlot ? null : slotIndex);
  };
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

  const handleAssignCamera = (cam) => {
    if (activeSlot === null) return;
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
  const [selectedPreset, setSelectedPreset] = useState(GRID_PRESETS[0]); // Default to 30-Wall
  const [slots, setSlots] = useState(() => {
    // Initialise 30 slots pre-filled with active cameras if available
    const active = (cameras || []).filter((c) => c && c.status === "active");
    const initial = Array(30).fill(null);
    active.slice(0, 30).forEach((cam, i) => {
      initial[i] = cam;
    });
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

  // Auto-fill slots if cameras loaded after initial mount
  useMemo(() => {
    if (activeCameras.length > 0 && slots.every((s) => s === null)) {
      const nextSlots = Array(selectedPreset.max).fill(null);
      activeCameras.slice(0, selectedPreset.max).forEach((cam, i) => {
        nextSlots[i] = cam;
      });
      setSlots(nextSlots);
    }
  }, [activeCameras]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle status update from individual players
  const handleStatusChange = useCallback((camId, status) => {
    setCameraStatuses((prev) => {
      if (prev[camId] === status) return prev;
      return { ...prev, [camId]: status };
    });
  }, []);

  // Compute live summary statistics
  const summaryStats = useMemo(() => {
    const totalAssigned = slots.filter(Boolean).length;
    const displayed = slots.slice(0, selectedPreset.max);
    let totalAssigned = 0;
    let live = 0;
    let reconnecting = 0;
    let loading = 0;
    let offline = 0;

    slots.forEach((cam) => {
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
  }, [slots, cameraStatuses]);
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
      next[activeSlot] = cam;
      next[slotIdx] = null;
      return next;
    });
    setActiveSlot((cur) => (cur === slotIdx ? null : cur));
  }, []);

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setActiveSlot(null);
  };

  const handleRemoveSlot = (e, slotIndex) => {
    e.stopPropagation();
    // Expand or truncate slots to preset.max
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      const next = Array(preset.max).fill(null);
      activeCameras.slice(0, preset.max).forEach((cam, i) => {
        next[i] = prev[i] || cam;
      });
      return next;
    });
    if (activeSlot === slotIndex) setActiveSlot(null);
  };

  const handleGridChange = (gs) => {
    setGridSize(gs);
    setSlots(Array(gs.max).fill(null));
    setActiveSlot(null);
    setAll30Page(0);
  };

  const handleFillAll = () => {
    const newSlots = Array(gridSize.max).fill(null);
    activeCameras.slice(0, gridSize.max).forEach((cam, i) => {
    const newSlots = Array(selectedPreset.max).fill(null);
    activeCameras.slice(0, selectedPreset.max).forEach((cam, i) => {
      newSlots[i] = cam;
    });
    setSlots(newSlots);
    setActiveSlot(null);
  };

  const handleClearAll = () => {
    setSlots(Array(gridSize.max).fill(null));
    setSlots(Array(selectedPreset.max).fill(null));
    setActiveSlot(null);
  };

  const cols = gridSize.cols || 3;
  const displayedSlots = slots.slice(0, selectedPreset.max);

  // For All-30 layout, optionally filter by page (10 per page) to ensure smooth 60fps
  const displayedSlots = (gridSize.max === 30 && all30Page >= 0)
    ? slots.map((cam, i) => ({ cam, originalIndex: i })).slice(all30Page * 10, (all30Page + 1) * 10)
    : slots.map((cam, i) => ({ cam, originalIndex: i }));

  const displayedCols = (gridSize.max === 30 && all30Page >= 0) ? 5 : cols;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#05080c" }}>
      {/* ── Grid Control Header ── */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-hairline, #1e2a3a)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background: "var(--bg-panel)",
          background: "var(--bg-panel, #0f172a)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>Camera Grid</span>
        <div style={{ display: "flex", gap: 4 }}>
          {GRID_SIZES.map((gs) => (
        <span style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc" }}>
          SENTINEL LIVE WALL
        </span>

        {/* Layout Presets */}
        <div style={{ display: "flex", gap: 3 }}>
          {GRID_PRESETS.map((preset) => (
            <button
              key={gs.label}
              onClick={() => handleGridChange(gs)}
              key={preset.id}
              onClick={() => handlePresetChange(preset)}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background: gridSize.label === gs.label ? "#1a3a5c" : "var(--bg-panel-raised)",
                border: `1px solid ${gridSize.label === gs.label ? "#2563eb" : "var(--border-hairline)"}`,
                padding: "3px 9px",
                background: selectedPreset.id === preset.id ? "#1e3a8a" : "var(--bg-panel-raised, #1e293b)",
                border: `1px solid ${selectedPreset.id === preset.id ? "#3b82f6" : "#334155"}`,
                borderRadius: 4,
                color: gridSize.label === gs.label ? "#93c5fd" : "var(--text-secondary)",
                color: selectedPreset.id === preset.id ? "#bfdbfe" : "#94a3b8",
                cursor: "pointer",
                fontWeight: gridSize.label === gs.label ? 600 : 400,
                fontWeight: selectedPreset.id === preset.id ? 600 : 400,
              }}
            >
              {gs.label}
              {preset.label}
            </button>
          ))}
        </div>

        {/* Paging controls for All 30 layout */}
        {gridSize.max === 30 && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", marginLeft: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginRight: 2 }}>Page:</span>
            {[
              { label: "1–10", page: 0 },
              { label: "11–20", page: 1 },
              { label: "21–30", page: 2 },
              { label: "All 30", page: -1 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => setAll30Page(p.page)}
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  background: all30Page === p.page ? "#1e293b" : "transparent",
                  border: `1px solid ${all30Page === p.page ? "#38bdf8" : "#334155"}`,
                  borderRadius: 3,
                  color: all30Page === p.page ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
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

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
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
              background: "#164e63",
              border: "1px solid #0891b2",
              background: "#0284c7",
              border: "1px solid #38bdf8",
              borderRadius: 4,
              color: "#67e8f9",
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
              background: "var(--bg-panel-raised)",
              border: "1px solid var(--border-hairline)",
              background: "transparent",
              border: "1px solid #475569",
              borderRadius: 4,
              color: "var(--text-tertiary)",
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
        {/* Grid area with smooth scroll & lazy observation */}
        {/* Adaptive Video Wall Grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${displayedCols}, 1fr)`,
            gridAutoRows: gridSize.max > 9 ? "minmax(150px, 1fr)" : "minmax(200px, 1fr)",
            gridTemplateColumns: `repeat(${selectedPreset.cols}, minmax(0, 1fr))`,
            gridAutoRows: selectedPreset.max >= 25 ? "minmax(140px, 1fr)" : "minmax(180px, 1fr)",
            gridAutoRows: selectedPreset.max >= 25 ? "minmax(130px, 1fr)" : "minmax(180px, 1fr)",
            gap: 4,
            background: "var(--bg-void)",
            padding: 6,
            padding: 5,
            background: "#05080c",
            overflowY: "auto",
          }}
        >
          {displayedSlots.map(({ cam, originalIndex }) => (
            <div
              key={originalIndex}
              onClick={() => handleSlotClick(originalIndex)}
              style={{
                position: "relative",
                background: "#0a0e14",
                border: activeSlot === originalIndex
                  ? "2px solid #3b82f6"
                  : "1px solid var(--border-hairline)",
                borderRadius: 5,
                overflow: "hidden",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {cam ? (
                <>
                  <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
                    <LiveVideoPlayer
                      cameraCode={cam.camera_code}
                      streamGatewayBaseUrl={streamGatewayBaseUrl}
                      lazy={true}
                      staggerIndex={originalIndex}
                    />
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
                    background: activeSlot !== null && !isAssigned ? "transparent" : "transparent",
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
                  {/* Overlay label with camera code and location */}
                  <div
                    style={{
                      padding: "3px 8px",
                      background: "rgba(10,14,20,0.88)",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      zIndex: 3,
                      fontSize: 10,
                      color: "#94a3b8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: "#93c5fd", marginRight: 6 }}>
                        {cam.camera_code}
                      </span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        {cam.name || ""}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleRemoveSlot(e, originalIndex)}
                      style={{
                        fontSize: 13,
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: "0 2px",
                        lineHeight: 1,
                      }}
                      title="Remove from grid"
                    >
                      ×
                    </button>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cam.name}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 6,
                    color: activeSlot === originalIndex ? "#3b82f6" : "var(--text-tertiary)",
                  }}
                >
                  <div style={{ fontSize: 20 }}>+</div>
                  <div style={{ fontSize: 11 }}>Slot {originalIndex + 1}</div>
                  {isAssigned && (
                    <div style={{ fontSize: 9, color: "#22c55e", marginTop: 1 }}>✓ On wall</div>
                  )}
                </div>
              )}
            </div>
          ))}
              );
            })}
          </div>
        </div>
      </div>

        {/* Camera picker sidebar */}
      {/* ── High Quality Focused / Fullscreen Overlay ── */}
      {focusedCamera && (
        <div
          onClick={() => setFocusedCamera(null)}
          style={{
            width: 200,
            flexShrink: 0,
            borderLeft: "1px solid var(--border-hairline)",
            overflowY: "auto",
            background: "var(--bg-panel)",
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
              padding: "8px 10px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--border-hairline)",
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
            Active Cameras ({activeCameras.length})
          </div>
          {activeCameras.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
              No active cameras
            </div>
          )}
          {activeCameras.map((cam) => {
            const isInGrid = slots.some((s) => s?.id === cam.id);
            return (
              <div
                key={cam.id}
                onClick={() => activeSlot !== null && !isInGrid && handleAssignCamera(cam)}
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
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-hairline)",
                  cursor: activeSlot !== null && !isInGrid ? "pointer" : "default",
                  opacity: isInGrid ? 0.45 : 1,
                  background: "transparent",
                  background: "none",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: 18,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (activeSlot !== null && !isInGrid)
                    e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1" }}>
                  {cam.camera_code}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cam.name}
                </div>
                {isInGrid && (
                  <div style={{ fontSize: 9, color: "var(--accent-active)", marginTop: 2 }}>✓ In grid</div>
                )}
              </div>
            );
          })}
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
      </div>
      )}
    </div>
  );
}