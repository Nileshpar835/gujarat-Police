import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

/**
 * Plays a camera's HLS stream from the Stream Gateway (MediaMTX).
 *
 * Strategy:
 *  1. Primary:  /hls/<SENTINEL-camXX>/index.m3u8  (MediaMTX, local gateway)
 *  2. Fallback: https://cctv.corp8.cloud/<camXX>/index.m3u8 (Sentinel CDN — needs browser login session)
 *
 * The fallback fires automatically if the primary manifest fails to load
 * after 3 retries, so cameras that aren't yet being pulled by the AI worker
 * still show a picture from the CDN as long as the user has an active
 * Sentinel browser session.
 */

const SENTINEL_CDN_BASE = "https://cctv.corp8.cloud";

function buildSources(cameraCode, gatewayBase) {
  // Normalise camera code: "SENTINEL-cam03" → "cam03"
  const camId = cameraCode.replace(/^SENTINEL-/i, "").toLowerCase();
  return [
    `${gatewayBase}/${cameraCode}/index.m3u8`,      // MediaMTX
    `${SENTINEL_CDN_BASE}/${camId}/index.m3u8`,     // Sentinel CDN fallback
  ];
}

export default function LiveVideoPlayer({ cameraCode, streamGatewayBaseUrl }) {
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const [status, setStatus]       = useState("connecting"); // connecting | live | error
  const [sourceIdx, setSourceIdx] = useState(0);
  const [retryKey, setRetryKey]   = useState(0); // bump to force full restart

  const destroy = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraCode) return;

    destroy();
    setStatus("connecting");

    const sources = buildSources(cameraCode, streamGatewayBaseUrl);
    const src = sources[sourceIdx];

    if (!src) { setStatus("error"); return; }

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        // Give each manifest attempt up to 3 s before we fail it
        manifestLoadingTimeOut:  3000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 1000,
        // Segment tolerance
        levelLoadingTimeOut:  5000,
        fragLoadingTimeOut:   8000,
        // Adjust live sync for low-latency
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 6,
        xhrSetup: (xhr) => {
          // send any Sentinel login cookie the browser already has
          xhr.withCredentials = true;
        },
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
        if (!data.fatal) return;

        // Fatal error on primary → try next source
        const nextIdx = sourceIdx + 1;
        if (nextIdx < sources.length) {
          destroy();
          setSourceIdx(nextIdx);
        } else {
          setStatus("error");
          destroy();
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = src;
      video.addEventListener("loadedmetadata", () => setStatus("live"), { once: true });
      video.addEventListener("error", () => {
        const nextIdx = sourceIdx + 1;
        if (nextIdx < sources.length) { setSourceIdx(nextIdx); }
        else { setStatus("error"); }
      }, { once: true });
    } else {
      setStatus("error");
    }

    return destroy;
  }, [cameraCode, streamGatewayBaseUrl, sourceIdx, retryKey, destroy]);

  const handleRetry = () => {
    setSourceIdx(0);
    setRetryKey((k) => k + 1);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000", minHeight: 120 }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: "100%", height: "100%",
          objectFit: "contain",
          display: status === "live" ? "block" : "none",
        }}
      />

      {/* Status overlay */}
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
              {/* Pulsing ring */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: "3px solid #1a3a5c",
                borderTop: "3px solid #3dd6c4",
                animation: "spin 0.9s linear infinite",
              }} />
              <div style={{ fontSize: 12, color: "#5c6b86" }}>Connecting…</div>
              <div style={{ fontSize: 10, color: "#3a4a5c", textAlign: "center", maxWidth: 180 }}>
                {cameraCode}
              </div>
            </>
          )}
          {status === "error" && (
            <>
              <div style={{ fontSize: 24 }}>📷</div>
              <div style={{ fontSize: 12, color: "#ef4444", textAlign: "center", maxWidth: 200 }}>
                Stream unavailable
              </div>
              <div style={{ fontSize: 10, color: "#5c6b86", textAlign: "center", maxWidth: 200 }}>
                {cameraCode}
              </div>
              <button
                onClick={handleRetry}
                style={{
                  marginTop: 4, fontSize: 11, padding: "4px 14px",
                  background: "#1a2a3a", border: "1px solid #2d4060",
                  borderRadius: 4, color: "#7fa8d8", cursor: "pointer",
                }}
              >
                ↺ Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* LIVE badge */}
      {status === "live" && (
        <div
          style={{
            position: "absolute", top: 8, left: 8,
            background: "rgba(10,14,20,0.75)", borderRadius: 4,
            padding: "2px 8px", display: "flex", alignItems: "center", gap: 5,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block",
            boxShadow: "0 0 6px #22c55e", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 10, color: "#86efac", fontWeight: 700, letterSpacing: "0.05em" }}>LIVE</span>
        </div>
      )}

      {/* Fallback source indicator (CDN) */}
      {sourceIdx > 0 && status === "live" && (
        <div
          style={{
            position: "absolute", top: 8, right: 8,
            background: "rgba(10,14,20,0.75)", borderRadius: 4,
            padding: "2px 7px", fontSize: 9, color: "#a78bfa",
          }}
        >
          CDN
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
