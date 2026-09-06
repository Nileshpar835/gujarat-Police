import { useState, useCallback, useRef, useEffect } from "react";

export default function SlidingPanel({
  side = "left",
  width = 280,
  minWidth = 60,
  maxWidth = 500,
  collapsed = false,
  onToggle,
  header,
  children,
  accent,
  badge,
  className = "",
}) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const startRef = useRef({ x: 0, w: 0 });

  const isLeft = side === "left";
  const currentWidth = collapsed ? 0 : width;

  const handleMouseDown = useCallback(
    (e) => {
      if (collapsed) return;
      e.preventDefault();
      setDragging(true);
      startRef.current = { x: e.clientX, w: width };
    },
    [collapsed, width]
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const dx = isLeft ? e.clientX - startRef.current.x : startRef.current.x - e.clientX;
      const newW = Math.max(minWidth, Math.min(maxWidth, startRef.current.w + dx));
      onToggle?.("resize", newW);
    };
    const handleUp = () => setDragging(false);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, isLeft, minWidth, maxWidth, onToggle]);

  return (
    <div
      className={`sliding-panel ${className}`}
      data-side={side}
      data-collapsed={collapsed}
      style={{
        width: collapsed ? 40 : width,
        minWidth: collapsed ? 40 : width,
        maxWidth: collapsed ? 40 : maxWidth,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-secondary)",
        borderLeft: isLeft ? "none" : "1px solid var(--border-primary)",
        borderRight: isLeft ? "1px solid var(--border-primary)" : "none",
        transition: dragging ? "none" : "width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 42,
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          borderBottom: "1px solid var(--border-primary)",
          gap: 8,
          background: accent ? `linear-gradient(135deg, ${accent}11, transparent)` : undefined,
        }}
      >
        {!collapsed && header}
        <div style={{ flex: 1 }} />
        {badge && !collapsed && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 3,
              background: badge.color ? `${badge.color}22` : "var(--accent-red-dim)",
              color: badge.color || "var(--accent-red)",
            }}
          >
            {badge.text}
          </span>
        )}
        <button
          onClick={() => onToggle?.("toggle")}
          title={collapsed ? `Expand ${side} panel` : `Collapse ${side} panel`}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "pointer",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "var(--border-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          {collapsed ? (isLeft ? "»" : "«") : (isLeft ? "«" : "»")}
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      )}

      {/* Drag handle */}
      {!collapsed && (
        <div
          ref={dragRef}
          onMouseDown={handleMouseDown}
          style={{
            position: "absolute",
            top: 0,
            [isLeft ? "right" : "left"]: 0,
            width: 5,
            height: "100%",
            cursor: "col-resize",
            zIndex: 10,
            background: "transparent",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent-blue)";
          }}
          onMouseLeave={(e) => {
            if (!dragging) e.currentTarget.style.background = "transparent";
          }}
        />
      )}

      {/* Drag overlay to prevent iframe interference */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: "col-resize",
          }}
        />
      )}
    </div>
  );
}
