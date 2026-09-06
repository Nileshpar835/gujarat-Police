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
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
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
          width: 820,
          maxWidth: "95vw",
          background: "#080c12",
          border: "1px solid #1e293b",
          borderRadius: 8,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#0f172a",
          }}
        >
          <div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8" }}>
              {camera.camera_code}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {camera.name} · {camera.district || "Surveillance"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
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
