import React from "react";
import CameraPlayer from "./CameraPlayer.jsx";

export default function CameraViewerModal({ camera, streamGatewayBaseUrl, onClose }) {
  if (!camera) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 900,
          maxWidth: "95vw",
          background: "#000",
          border: "1px solid var(--border-secondary)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-secondary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-accent)" }}>
              {camera.camera_code}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {camera.name} · {camera.district || "Surveillance"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              color: "var(--text-secondary)",
              fontSize: 18,
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ aspectRatio: "16/9", position: "relative" }}>
          <CameraPlayer
            camera={camera}
            streamGatewayBaseUrl={streamGatewayBaseUrl}
            isFocused={true}
            showDiagnostics={true}
          />
        </div>
      </div>
    </div>
  );
}
