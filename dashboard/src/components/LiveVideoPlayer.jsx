import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

/**
 * LiveVideoPlayer: High-performance, resilient HLS video player.
 *
 * Architecture:
 *   1. Primary: Official Sentinel CDN (/sentinel-hls/<camId>/index.m3u8)
 *      - Hosted on Cloudflare edge: pre-buffered, pre-muxed, instant (~0.5s) delivery.
 *      - Authenticated automatically via Vite proxy with cached session cookie
 *        and AES-128 (/enc.key) decryption key support.
 *   2. Secondary: Local MediaMTX Relay (/hls/<cameraCode>/index.m3u8)
 *      - Local Docker network fallback if CDN ever experiences rate limiting.
 *   3. Concurrency Protection:
 *      - Strict IntersectionObserver detaches HLS decoders when scrolled away,
 *        releasing browser network sockets immediately.
 */

function buildSources(cameraCode, gatewayBase) {
  const camId = cameraCode.replace(/^SENTINEL-/i, "");
  return [
    // 1st: Sentinel CDN (fastest: ~0.5s playback, pre-buffered at edge)
    `/sentinel-hls/${camId}/index.m3u8`,
    // 2nd: Local MediaMTX relay (fallback)
    `${gatewayBase}/${cameraCode}/index.m3u8`,
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
  const retryTimerRef = useRef(null);
  const warmupCountRef = useRef(0);

  const [isVisible, setIsVisible] = useState(!lazy);
  const [status, setStatus] = useState("idle"); // idle | queued | connecting | live | retrying | error
  const [sourceIdx, setSourceIdx] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [pausedManually, setPausedManually] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);

  // 1. Viewport Lazy-Loading with strict threshold
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
            // Cleanly detach stream when off-screen to free browser sockets
            setIsVisible(false);
          }
        });
      },
      { rootMargin: "60px 0px", threshold: 0.05 }
    );

    observer.observe(elem);
    return () => observer.disconnect();
  }, [lazy]);

  const destroyHls = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {
        // ignore
      }
      hlsRef.current = null;
    }
  }, []);

  // 2. Stream lifecycle (instant connect & fallback)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraCode || !isVisible || pausedManually) {
      destroyHls();
      setStatus("idle");
      return;
    }

    destroyHls();
    setStatus("queued");
    warmupCountRef.current = 0;

    // Small jitter (0 to 300ms) to spread initial microtask execution
    const startDelay = Math.min((staggerIndex % 8) * 40, 320);

    const timer = setTimeout(() => {
      setStatus("connecting");
      setErrorDetails(null);

      const sources = buildSources(cameraCode, streamGatewayBaseUrl);
      const src = sources[sourceIdx];
      if (!src) {
        setStatus("error");
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: false,
          manifestLoadingTimeOut: 6000,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 800,
          levelLoadingTimeOut: 6000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 600,
          fragLoadingTimeOut: 8000,
          fragLoadingMaxRetry: 4,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          liveDurationInfinity: true,
          maxBufferLength: 8,
          maxMaxBufferLength: 16,
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
        });

        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("live");
          warmupCountRef.current = 0;
          video.play().catch(() => {
            // Autoplay policy prevented playback until user interaction
          });
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;

          // If on MediaMTX fallback and getting on-demand warmup 500
          const is500Error = data.response && data.response.code === 500;
          if (sourceIdx === 1 && is500Error && warmupCountRef.current < 4) {
            warmupCountRef.current += 1;
            setStatus("connecting");
            retryTimerRef.current = setTimeout(() => {
              if (hlsRef.current && !pausedManually && isVisible) {
                hlsRef.current.loadSource(src);
                hlsRef.current.startLoad();
              }
            }, 1000);
            return;
          }

          // Try next source
          const nextSrcIdx = sourceIdx + 1;
          if (nextSrcIdx < sources.length) {
            destroyHls();
            setSourceIdx(nextSrcIdx);
            setStatus("connecting");
          } else {
            destroyHls();
            setStatus("error");
            setErrorDetails(data.details || "Stream unavailable");
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native Safari HLS
        video.src = src;
        video.addEventListener("loadedmetadata", () => setStatus("live"), { once: true });
        video.addEventListener("error", () => {
          const nextSrcIdx = sourceIdx + 1;
          if (nextSrcIdx < sources.length) {
            setSourceIdx(nextSrcIdx);
          } else {
            setStatus("error");
          }
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
    destroyHls();
    warmupCountRef.current = 0;
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
              <div style={{ fontSize: 16, opacity: 0.7 }}>⏳</div>
              <div style={{ fontSize: 10, color: "#5c6b86" }}>Loading feed…</div>
              <div className="mono" style={{ fontSize: 9, color: "#3a4a5c" }}>{cameraCode}</div>
            </>
          )}

          {status === "connecting" && (
            <>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "2px solid #1a3a5c",
                  borderTop: "2px solid #3dd6c4",
                  animation: "lvp-spin 0.8s linear infinite",
                }}
              />
              <div style={{ fontSize: 10, color: "#5c6b86" }}>
                Connecting feed…
              </div>
              <div className="mono" style={{ fontSize: 9, color: "#3a4a5c" }}>{cameraCode}</div>
            </>
          )}

          {status === "error" && (
            <>
              <div style={{ fontSize: 18 }}>📷</div>
              <div style={{ fontSize: 10, color: "#ef4444", textAlign: "center" }}>
                Feed unavailable
              </div>
              <div className="mono" style={{ fontSize: 9, color: "#5c6b86", textAlign: "center" }}>
                {cameraCode}
              </div>
              <button
                onClick={handleRetry}
                style={{
                  marginTop: 2,
                  fontSize: 10,
                  padding: "2px 10px",
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
            background: "rgba(10,14,20,0.85)",
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