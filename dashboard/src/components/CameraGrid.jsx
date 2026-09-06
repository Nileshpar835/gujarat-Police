import { useState } from "react";
import LiveVideoPlayer from "./LiveVideoPlayer.jsx";

const GRID_SIZES = [
  { label: "2×2 (4)", cols: 2, max: 4 },
  { label: "3×3 (9)", cols: 3, max: 9 },
  { label: "4×4 (16)", cols: 4, max: 16 },
  { label: "All 30", cols: 5, max: 30 },
];

export default function CameraGrid({ cameras = [], streamGatewayBaseUrl }) {
  const [gridSize, setGridSize] = useState(GRID_SIZES[0]);
  const [slots, setSlots] = useState(Array(4).fill(null)); // null = empty slot
  const [activeSlot, setActiveSlot] = useState(null); // slot index being assigned
  const [all30Page, setAll30Page] = useState(0); // 0: 1-10, 1: 11-20, 2: 21-30, -1: Show All 30

  const activeCameras = (cameras || []).filter((c) => c && c.status === "active");

  const handleSlotClick = (slotIndex) => {
    setActiveSlot(slotIndex === activeSlot ? null : slotIndex);
  };

  const handleAssignCamera = (cam) => {
    if (activeSlot === null) return;
    setSlots((prev) => {
      const next = [...prev];
      next[activeSlot] = cam;
      return next;
    });
    setActiveSlot(null);
  };

  const handleRemoveSlot = (e, slotIndex) => {
    e.stopPropagation();
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
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
      newSlots[i] = cam;
    });
    setSlots(newSlots);
    setActiveSlot(null);
  };

  const handleClearAll = () => {
    setSlots(Array(gridSize.max).fill(null));
    setActiveSlot(null);
  };

  const cols = gridSize.cols || 3;

  // For All-30 layout, optionally filter by page (10 per page) to ensure smooth 60fps
  const displayedSlots = (gridSize.max === 30 && all30Page >= 0)
    ? slots.map((cam, i) => ({ cam, originalIndex: i })).slice(all30Page * 10, (all30Page + 1) * 10)
    : slots.map((cam, i) => ({ cam, originalIndex: i }));

  const displayedCols = (gridSize.max === 30 && all30Page >= 0) ? 5 : cols;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background: "var(--bg-panel)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>Camera Grid</span>
        <div style={{ display: "flex", gap: 4 }}>
          {GRID_SIZES.map((gs) => (
            <button
              key={gs.label}
              onClick={() => handleGridChange(gs)}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background: gridSize.label === gs.label ? "#1a3a5c" : "var(--bg-panel-raised)",
                border: `1px solid ${gridSize.label === gs.label ? "#2563eb" : "var(--border-hairline)"}`,
                borderRadius: 4,
                color: gridSize.label === gs.label ? "#93c5fd" : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: gridSize.label === gs.label ? 600 : 400,
              }}
            >
              {gs.label}
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

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            onClick={handleFillAll}
            style={{
              fontSize: 11,
              padding: "4px 12px",
              background: "#164e63",
              border: "1px solid #0891b2",
              borderRadius: 4,
              color: "#67e8f9",
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
              borderRadius: 4,
              color: "var(--text-tertiary)",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Grid area with smooth scroll & lazy observation */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${displayedCols}, 1fr)`,
            gridAutoRows: gridSize.max > 9 ? "minmax(150px, 1fr)" : "minmax(200px, 1fr)",
            gap: 4,
            background: "var(--bg-void)",
            padding: 6,
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
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Camera picker sidebar */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderLeft: "1px solid var(--border-hairline)",
            overflowY: "auto",
            background: "var(--bg-panel)",
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--border-hairline)",
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
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-hairline)",
                  cursor: activeSlot !== null && !isInGrid ? "pointer" : "default",
                  opacity: isInGrid ? 0.45 : 1,
                  background: "transparent",
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
        </div>
      </div>
    </div>
  );
}