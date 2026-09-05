import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

/**
 * LiveVideoPlayer: High-performance, lazy-loading HLS video player.
 *
 * Features:
 *   - Lazy Loading: Only connects when scrolled into view (IntersectionObserver)
 *   - Staggered Scheduling: Jitters stream starts so multiple grid cameras do not
 *     saturate gateway connections concurrently
 *   - On-Demand Gateway Sync: Polite retries give MediaMTX time to pull RTSP keyframes
 *   - Dual-Source Fallback: Sentinel CDN HLS (dashboards) -> local MediaMTX RTSP relay
 */

const SENTINEL_CDN_ORIGIN = "https://cctv.corp8.cloud";

function buildSources(cameraCode, gatewayBase) {
  const camId = cameraCode.replace(/^SENTINEL-/i, "");
  return [
    // 1st: Local MediaMTX relay — low latency, on-demand, same network
    `${gatewayBase}/${cameraCode}/index.m3u8`,
    // 2nd: Sentinel CDN — requires active browser session cookie (auth)
    `/sentinel-hls/${camId}/index.m3u8`,
  ];
}

export default function LiveVideoPlayer({
  cameraCode,
  streamGatewayBaseUrl,
  lazy = true,
  staggerIndex = 0,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const [isVisible, setIsVisible] = useState(!lazy);
  const [status, setStatus] = useState("idle"); // idle | queued | connecting | live | error
  const [sourceIdx, setSourceIdx] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [pausedManually, setPausedManually] = useState(false);

  // 1. Viewport Lazy-Loading with IntersectionObserver
  useEffect(() => {
    if (!lazy) {
      setIsVisible(true);
      return;
    }
    const elem = containerRef.current;
    if (!elem) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          } else {
            // Detach stream if scrolled far away to free decoder memory & gateway bandwidth
            setIsVisible(false);
          }
        });
      },
      { rootMargin: "150px 0px", threshold: 0.05 }
    );

    observer.observe(elem);
    return () => observer.disconnect();
  }, [lazy]);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {
        // ignore
      }
      hlsRef.current = null;
    }
  }, []);

  // 2. Stream lifecycle (staggered connect, on-demand pull & fallback)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraCode || !isVisible || pausedManually) {
      destroyHls();
      setStatus("idle");
      return;
    }

    destroyHls();
    setStatus("queued");

    // Stagger start: each slot waits (index * 150ms) to avoid simultaneous network stampede
    const startDelay = Math.min((staggerIndex % 16) * 150, 2400);

    const timer = setTimeout(() => {
      setStatus("connecting");

      const sources = buildSources(cameraCode, streamGatewayBaseUrl);
      const src = sources[sourceIdx];
      if (!src) {
        setStatus("error");
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          // MediaMTX sourceOnDemand needs 2-4s to dial RTSP and package the 1st HLS fragment
          manifestLoadingTimeOut: 5000,
          manifestLoadingMaxRetry: 8,
          manifestLoadingRetryDelay: 1500,
          levelLoadingTimeOut: 6000,
          fragLoadingTimeOut: 8000,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 6,
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
        });

        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("live");
          video.play().catch(() => {
            // Autoplay policy prevented playback until user interaction
          });
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;

          // If MediaMTX cannot connect or is unavailable, try CDN fallback
          const nextIdx = sourceIdx + 1;
          if (nextIdx < sources.length) {
            destroyHls();
            setSourceIdx(nextIdx);
          } else {
            setStatus("error");
            destroyHls();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.addEventListener("loadedmetadata", () => setStatus("live"), { once: true });
        video.addEventListener("error", () => {
          const nextIdx = sourceIdx + 1;
          if (nextIdx < sources.length) setSourceIdx(nextIdx);
          else setStatus("error");
        }, { once: true });
      } else {
        setStatus("error");
      }
    }, startDelay);

    return () => {
      clearTimeout(timer);
      destroyHls();
    };
  }, [cameraCode, streamGatewayBaseUrl, isVisible, sourceIdx, retryKey, pausedManually, staggerIndex, destroyHls]);

  const handleRetry = (e) => {
    if (e) e.stopPropagation();
    setPausedManually(false);
    setSourceIdx(0);
    setRetryKey((k) => k + 1);
  };

  const togglePause = (e) => {
    if (e) e.stopPropagation();
    setPausedManually((p) => !p);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#080c12",
        minHeight: 120,
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: status === "live" ? "block" : "none",
        }}
      />

      {/* Overlay status screen */}
      {status !== "live" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "#0a0e14",
            padding: 10,
          }}
        >
          {status === "idle" && (
            <>
              <div style={{ fontSize: 22, opacity: 0.6 }}>💤</div>
              <div style={{ fontSize: 11, color: "#5c6b86" }}>
                {pausedManually ? "Stream paused" : "Standby (Lazy Mode)"}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setPausedManually(false); setIsVisible(true); }}
                style={{
                  fontSize: 10,
                  padding: "3px 10px",
                  background: "#1a2a3a",
                  border: "1px solid #3dd6c4",
                  borderRadius: 4,
                  color: "#3dd6c4",
                  cursor: "pointer",
                }}
              >
                ▶ Start Stream
              </button>
            </>
          )}

          {status === "queued" && (
            <>
              <div style={{ fontSize: 18, opacity: 0.7 }}>⏳</div>
              <div style={{ fontSize: 11, color: "#5c6b86" }}>Scheduled connect…</div>
              <div className="mono" style={{ fontSize: 10, color: "#3a4a5c" }}>{cameraCode}</div>
            </>
          )}

          {status === "connecting" && (
            <>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "2px solid #1a3a5c",
                  borderTop: "2px solid #3dd6c4",
                  animation: "lvp-spin 0.9s linear infinite",
                }}
              />
              <div style={{ fontSize: 11, color: "#5c6b86" }}>
                {sourceIdx === 0 ? "Connecting on-demand…" : "Connecting Sentinel CDN…"}
              </div>
              <div className="mono" style={{ fontSize: 10, color: "#3a4a5c" }}>{cameraCode}</div>
            </>
          )}

          {status === "error" && (
            <>
              <div style={{ fontSize: 20 }}>📷</div>
              <div style={{ fontSize: 11, color: "#ef4444", textAlign: "center" }}>
                Stream unavailable
              </div>
              <div className="mono" style={{ fontSize: 9, color: "#5c6b86", textAlign: "center" }}>
                {cameraCode}
              </div>
              <button
                onClick={handleRetry}
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  padding: "3px 12px",
                  background: "#1a2a3a",
                  border: "1px solid #2d4060",
                  borderRadius: 4,
                  color: "#7fa8d8",
                  cursor: "pointer",
                }}
              >
                ↺ Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* Top Left Status Badge */}
      {status === "live" && (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            background: "rgba(10,14,20,0.8)",
            borderRadius: 4,
            padding: "2px 7px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            zIndex: 2,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
              boxShadow: "0 0 5px #22c55e",
              animation: "lvp-pulse 2s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 9, color: "#86efac", fontWeight: 700, letterSpacing: "0.05em" }}>
            LIVE
          </span>
        </div>
      )}

      {/* Top Right Controls & Badges */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          display: "flex",
          gap: 4,
          alignItems: "center",
          zIndex: 2,
        }}
      >
        {sourceIdx > 0 && status === "live" && (
          <div
            style={{
              background: "rgba(30, 20, 50, 0.8)",
              border: "1px solid #8b5cf6",
              borderRadius: 3,
              padding: "1px 5px",
              fontSize: 9,
              color: "#c4b5fd",
            }}
          >
            CDN
          </div>
        )}
        {status === "live" && (
          <button
            onClick={togglePause}
            title="Pause stream to conserve bandwidth"
            style={{
              background: "rgba(10,14,20,0.8)",
              border: "1px solid #253044",
              borderRadius: 3,
              color: "#8b98ab",
              fontSize: 10,
              padding: "1px 6px",
              cursor: "pointer",
            }}
          >
            ⏸
          </button>
        )}
      </div>

      <style>{`
        @keyframes lvp-spin  { to { transform: rotate(360deg); } }
        @keyframes lvp-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </div>
  );
}