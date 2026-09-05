import { useState } from "react";
import LiveVideoPlayer from "./LiveVideoPlayer.jsx";

const GRID_SIZES = [
  { label: "2×2", cols: 2, max: 4 },
  { label: "3×3", cols: 3, max: 9 },
  { label: "1+5", cols: null, max: 6 }, // special layout
];

export default function CameraGrid({ cameras, streamGatewayBaseUrl }) {
  const [gridSize, setGridSize] = useState(GRID_SIZES[0]);
  const [slots, setSlots] = useState(Array(4).fill(null)); // null = empty slot
  const [activeSlot, setActiveSlot] = useState(null); // slot index being assigned

  const activeCameras = cameras.filter((c) => c.status === "active");

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
  };

  const cols = gridSize.cols || 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>Camera Grid</span>
        <div style={{ display: "flex", gap: 4 }}>
          {GRID_SIZES.map((gs) => (
            <button
              key={gs.label}
              onClick={() => handleGridChange(gs)}
              style={{
                fontSize: 11, padding: "3px 9px",
                background: gridSize.label === gs.label ? "#1a3a5c" : "var(--bg-panel-raised)",
                border: `1px solid ${gridSize.label === gs.label ? "#2563eb" : "var(--border-hairline)"}`,
                borderRadius: 4, color: gridSize.label === gs.label ? "#93c5fd" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {gs.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: "auto" }}>
          {activeSlot !== null
            ? `Click a camera below to assign to slot ${activeSlot + 1}`
            : "Click a slot to select it, then pick a camera"}
        </span>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Grid area */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 2,
            background: "var(--bg-void)",
            padding: 2,
          }}
        >
          {slots.map((cam, i) => (
            <div
              key={i}
              onClick={() => handleSlotClick(i)}
              style={{
                position: "relative",
                background: "#0a0e14",
                border: activeSlot === i
                  ? "2px solid #3b82f6"
                  : "1px solid var(--border-hairline)",
                borderRadius: 4,
                overflow: "hidden",
                minHeight: 140,
                cursor: "pointer",
              }}
            >
              {cam ? (
                <>
                  <LiveVideoPlayer
                    cameraCode={cam.camera_code}
                    streamGatewayBaseUrl={streamGatewayBaseUrl}
                  />
                  {/* Overlay label */}
                  <div
                    style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      padding: "4px 8px",
                      background: "rgba(10,14,20,0.75)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10, color: "#a0aec0" }}>
                      {cam.camera_code}
                    </span>
                    <button
                      onClick={(e) => handleRemoveSlot(e, i)}
                      style={{
                        fontSize: 12, background: "none", border: "none",
                        color: "#ef4444", cursor: "pointer", padding: "0 2px",
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
                    height: "100%", display: "flex", alignItems: "center",
                    justifyContent: "center", flexDirection: "column", gap: 6,
                    color: activeSlot === i ? "#3b82f6" : "var(--text-tertiary)",
                  }}
                >
                  <div style={{ fontSize: 22 }}>+</div>
                  <div style={{ fontSize: 11 }}>Slot {i + 1}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Camera picker sidebar */}
        <div
          style={{
            width: 180, flexShrink: 0,
            borderLeft: "1px solid var(--border-hairline)",
            overflowY: "auto",
            background: "var(--bg-panel)",
          }}
        >
          <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border-hairline)" }}>
            Active Cameras
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
                  opacity: isInGrid ? 0.4 : 1,
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
                <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                  {cam.camera_code}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
                  {cam.name}
                </div>
                {isInGrid && (
                  <div style={{ fontSize: 10, color: "var(--accent-active)", marginTop: 1 }}>In grid</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

