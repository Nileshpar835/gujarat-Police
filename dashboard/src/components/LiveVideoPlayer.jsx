import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

/**
 * Plays a camera's HLS stream from the Stream Gateway (MediaMTX). The
 * gateway exposes one HLS path per camera_code, kept in sync with the
 * Registry & GIS backend by stream-gateway/gateway_sync.py — see HLD
 * Section 10 (video transport is decoupled from the AI analytics path).
 */
export default function LiveVideoPlayer({ cameraCode, streamGatewayBaseUrl }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("connecting"); // connecting | live | error

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src = `${streamGatewayBaseUrl}/${cameraCode}/index.m3u8`;
    setStatus("connecting");

    let hls;
    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("live");
        video.play().catch(() => {
          /* autoplay can be blocked until user interaction — video stays paused, not an error */
        });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setStatus("error");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari has native HLS support
      video.src = src;
      video.addEventListener("loadedmetadata", () => setStatus("live"));
      video.addEventListener("error", () => setStatus("error"));
    } else {
      setStatus("error");
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [cameraCode, streamGatewayBaseUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      {status !== "live" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: status === "error" ? "var(--severity-critical)" : "var(--text-tertiary)",
            background: "rgba(11,15,20,0.7)",
          }}
        >
          {status === "connecting" && "Connecting to stream…"}
          {status === "error" && "Stream unavailable — camera offline or gateway not relaying this path."}
        </div>
      )}
    </div>
  );
}
