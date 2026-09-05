import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

/**
 * Plays a camera's HLS stream from the Stream Gateway (MediaMTX).
 * The gateway exposes one HLS path per camera_code, kept alive by
 * gateway_sync.py polling the backend's active camera list.
 *
 * Why the stream shows "unavailable":
 *   - Camera has no stream_url registered in the backend
 *   - Camera is registered but status != active → gateway_sync skips it
 *   - MediaMTX has no path for this camera_code yet
 *   Run: POST /api/v1/cameras/{id}/health-check to flip status to active
 *   Then gateway_sync will register the path within 30s.
 */
export default function LiveVideoPlayer({ cameraCode, streamGatewayBaseUrl }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [status, setStatus] = useState("connecting"); // connecting | live | error
  const [retryCount, setRetryCount] = useState(0);

  const startStream = useCallback(() => {
    const video = videoRef.current;
    if (!video || !cameraCode) return;

    // Clean up previous hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const src = `${streamGatewayBaseUrl}/${cameraCode}/index.m3u8`;
    setStatus("connecting");

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        // Retry manifest load a few times before giving up — gateway_sync
        // may take up to 30s to register a newly-activated camera path.
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 2000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("live");
        video.play().catch(() => {
          // Autoplay blocked until user interaction — not an error.
        });
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setStatus("error");
          hls.destroy();
          hlsRef.current = null;
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = src;
      video.addEventListener("loadedmetadata", () => setStatus("live"), { once: true });
      video.addEventListener("error", () => setStatus("error"), { once: true });
    } else {
      setStatus("error");
    }
  }, [cameraCode, streamGatewayBaseUrl, retryCount]); // retryCount triggers re-run on manual retry

  useEffect(() => {
    startStream();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [startStream]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000", minHeight: 120 }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "contain", display: status === "live" ? "block" : "none" }}
      />

      {/* Status overlay — shown until stream is live */}
      {status !== "live" && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 10,
            background: "#0a0e14",
          }}
        >
          {status === "connecting" && (
            <>
              <div style={{ fontSize: 20 }}>📡</div>
              <div style={{ fontSize: 12, color: "#5c6b86" }}>Connecting to stream…</div>
              <div style={{ fontSize: 11, color: "#3a4a5c", textAlign: "center", maxWidth: 200 }}>
                {cameraCode}
              </div>
            </>
          )}
          {status === "error" && (
            <>
              <div style={{ fontSize: 20 }}>📷</div>
              <div style={{ fontSize: 12, color: "#ef4444", textAlign: "center", maxWidth: 220 }}>
                Stream unavailable
              </div>
              <div style={{ fontSize: 11, color: "#5c6b86", textAlign: "center", maxWidth: 220 }}>
                Camera may be offline or not yet registered in the gateway
              </div>
              <button
                onClick={() => setRetryCount((n) => n + 1)}
                style={{
                  marginTop: 4, fontSize: 11, padding: "4px 12px",
                  background: "#1a2a3a", border: "1px solid #2d4060",
                  borderRadius: 4, color: "#7fa8d8", cursor: "pointer",
                }}
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* Live indicator badge */}
      {status === "live" && (
        <div
          style={{
            position: "absolute", top: 8, left: 8,
            background: "rgba(10,14,20,0.7)", borderRadius: 4,
            padding: "2px 7px", display: "flex", alignItems: "center", gap: 5,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ fontSize: 10, color: "#86efac", fontWeight: 700 }}>LIVE</span>
        </div>
      )}
    </div>
  );
}
