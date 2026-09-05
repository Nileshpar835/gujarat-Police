import LiveVideoPlayer from "./LiveVideoPlayer.jsx";

export default function CameraViewerModal({ camera, streamGatewayBaseUrl, onClose }) {
  if (!camera) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxWidth: "90vw",
          background: "var(--bg-panel)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-hairline)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
              {camera.camera_code}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {camera.name} · {camera.district || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-tertiary)", fontSize: 20 }}
          >
            ×
          </button>
        </div>
        <div style={{ aspectRatio: "16/9" }}>
          <LiveVideoPlayer cameraCode={camera.camera_code} streamGatewayBaseUrl={streamGatewayBaseUrl} lazy={false} />
        </div>
      </div>
    </div>
  );
}
