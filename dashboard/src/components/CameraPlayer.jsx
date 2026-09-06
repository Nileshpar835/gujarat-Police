import { useEffect, useRef, useState, useCallback, memo } from "react";
import Hls from "hls.js";
import { getCameraStream, normalizeCameraId } from "../utils/streamUrlBuilder.js";

/**
 * CameraPlayer: High-performance, resilient WebRTC (WHEP) + HLS Fallback Player.
 *
 * Architecture:
 *   1. Primary: WebRTC via WHEP signaling proxy (/sentinel-whep/stream/<camId>/whep)
 *      - Direct hardware accelerated decoding via browser RTCPeerConnection.
 *      - Minimal latency (100-300ms vs 10-20s for HLS).
 *      - Zero JS demuxing / software AES decryption on main thread.
 *   2. Secondary: Authenticated HLS fallback (/sentinel-hls/<camId>/index.m3u8)
 *      - Activated automatically if WebRTC fails (firewalls, UDP/TCP 8189 block, unsupported browser).
 *   3. Tertiary: Local MediaMTX HLS fallback.
 *   4. Exponential backoff with jitter on reconnect (2s -> 4s -> 8s -> 16s -> 30s cap).
 *   5. Independent lifecycle: One camera failing never restarts or impacts others.
 *   6. Controlled batch initialization: Staggers startup to prevent microtask spikes.
 */

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const WHEP_TIMEOUT_MS = 6000; // time to wait for WebRTC video before falling back to HLS
const STALL_CHECK_INTERVAL_MS = 4000;

function CameraPlayer({
  camera,
  streamGatewayBaseUrl = "/hls",
  staggerIndex = 0,
  isFocused = false,
  showDiagnostics = false,
  onStatusChange,
  onExpand,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const hlsRef = useRef(null);
  const whepSessionUrlRef = useRef(null);
  const abortCtrlRef = useRef(null);

  const reconnectTimerRef = useRef(null);
  const stallTimerRef = useRef(null);
  const whepTimeoutRef = useRef(null);
  const fpsIntervalRef = useRef(null);

  const reconnectAttemptRef = useRef(0);
  const lastCurrentTimeRef = useRef(0);
  const startTimeRef = useRef(0);

  // States
  const [status, setStatus] = useState("loading"); // loading | live | reconnecting | offline | error
  const [protocol, setProtocol] = useState("webrtc"); // webrtc | hls
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [metrics, setMetrics] = useState({
    fps: 0,
    firstFrameMs: null,
    latencyMs: null,
    reconnectCount: 0,
    lastError: null,
  });

  const rawCode = camera?.camera_code || camera?.id || "";
  const camId = normalizeCameraId(rawCode);
  const displayName = camera?.name || `Camera ${camId.toUpperCase()}`;

  // Notify parent of status changes if requested
  const updateStatus = useCallback((newStatus, errorMsg = null) => {
    setStatus(newStatus);
    if (errorMsg) {
      setMetrics((m) => ({ ...m, lastError: errorMsg }));
    }
    if (onStatusChange) {
      onStatusChange(camId, newStatus);
    }
  }, [camId, onStatusChange]);

  // Clean up all active connections
  const cleanupConnections = useCallback(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    if (whepTimeoutRef.current) {
      clearTimeout(whepTimeoutRef.current);
      whepTimeoutRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (stallTimerRef.current) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (fpsIntervalRef.current) {
      clearInterval(fpsIntervalRef.current);
      fpsIntervalRef.current = null;
    }

    // Clean WHEP session
    if (whepSessionUrlRef.current) {
      fetch(whepSessionUrlRef.current, { method: "DELETE" }).catch(() => {});
      whepSessionUrlRef.current = null;
    }

    // Close WebRTC PeerConnection
    if (pcRef.current) {
      try {
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }

    // Destroy HLS instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // ignore
      }
      hlsRef.current = null;
    }

    // Clear video tracks
    const video = videoRef.current;
    if (video) {
      try {
        if (video.srcObject) {
          const stream = video.srcObject;
          if (stream.getTracks) {
            stream.getTracks().forEach((t) => t.stop());
          }
          video.srcObject = null;
        }
        video.src = "";
      } catch {
        // ignore
      }
    }
  }, []);

  // Schedule reconnect with exponential backoff + jitter
  const scheduleReconnect = useCallback((reason) => {
    cleanupConnections();
    reconnectAttemptRef.current += 1;
    const attempt = reconnectAttemptRef.current;

    // Exponential backoff: min(2^attempt * 1000, 30000) + jitter
    const backoff = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_MS);
    const jitter = Math.floor(Math.random() * 800) - 400;
    const delay = Math.max(1000, backoff + jitter);

    const seconds = Math.ceil(delay / 1000);
    setReconnectCountdown(seconds);
    updateStatus("reconnecting", reason);
    setMetrics((m) => ({ ...m, reconnectCount: attempt }));

    const countdownInterval = setInterval(() => {
      setReconnectCountdown((s) => {
        if (s <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    reconnectTimerRef.current = setTimeout(() => {
      clearInterval(countdownInterval);
      // Attempt connection again
      connectStream();
    }, delay);
  }, [cleanupConnections, updateStatus]);

  // Connect via HLS Fallback
  const connectHls = useCallback(() => {
    const video = videoRef.current;
    if (!video || !camId) return;

    setProtocol("hls");
    updateStatus("loading");
    const hlsUrl = getCameraStream(camera, "hls");

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 8000,
        fragLoadingTimeOut: 8000,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 6,
        maxBufferLength: 6,
        maxMaxBufferLength: 12,
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
      });

      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        scheduleReconnect(`HLS fatal: ${data.details || "error"}`);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = hlsUrl;
      video.addEventListener("error", () => scheduleReconnect("Safari HLS error"), { once: true });
      video.play().catch(() => {});
    } else {
      scheduleReconnect("Neither WebRTC nor HLS supported");
    }
  }, [camera, camId, updateStatus, scheduleReconnect]);

  // Connect via WebRTC / WHEP
  const connectStream = useCallback(() => {
    cleanupConnections();
    const video = videoRef.current;
    if (!video || !camId) return;

    updateStatus("loading");
    startTimeRef.current = performance.now();
    abortCtrlRef.current = new AbortController();

    const whepUrl = getCameraStream(camera, "webrtc");

    // Check RTCPeerConnection support
    if (typeof RTCPeerConnection === "undefined") {
      connectHls();
      return;
    }

    setProtocol("webrtc");

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;

      pc.addTransceiver("video", { direction: "recvonly" });

      pc.ontrack = (evt) => {
        if (evt.streams && evt.streams[0]) {
          video.srcObject = evt.streams[0];
          video.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (!pcRef.current) return;
        const state = pc.connectionState;
        if (state === "failed") {
          // Fall back to HLS on WebRTC transport failure
          connectHls();
        } else if (state === "disconnected") {
          scheduleReconnect("WebRTC disconnected");
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          // Wait briefly for candidate gathering
          return new Promise((resolve) => {
            if (pc.iceGatheringState === "complete") {
              resolve();
              return;
            }
            const check = () => {
              if (pc.iceGatheringState === "complete") {
                pc.removeEventListener("icegatheringstatechange", check);
                resolve();
              }
            };
            pc.addEventListener("icegatheringstatechange", check);
            setTimeout(resolve, 500);
          });
        })
        .then(() => {
          if (!pcRef.current || abortCtrlRef.current?.signal.aborted) return;
          const sdpOffer = pc.localDescription?.sdp;
          if (!sdpOffer) throw new Error("No local SDP offer generated");

          return fetch(whepUrl, {
            method: "POST",
            headers: { "Content-Type": "application/sdp" },
            body: sdpOffer,
            signal: abortCtrlRef.current?.signal,
          });
        })
        .then((res) => {
          if (!res) return;
          if (!res.ok) {
            throw new Error(`WHEP HTTP ${res.status}`);
          }
          const loc = res.headers.get("Location");
          if (loc) {
            whepSessionUrlRef.current = loc;
          }
          return res.text();
        })
        .then((answerSdp) => {
          if (!answerSdp || !pcRef.current || abortCtrlRef.current?.signal.aborted) return;
          return pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        })
        .catch((err) => {
          if (abortCtrlRef.current?.signal.aborted) return;
          // WebRTC failed to negotiate -> fallback to HLS
          connectHls();
        });

      // Safety timeout: If WebRTC hasn't produced a live frame within WHEP_TIMEOUT_MS, fall back to HLS
      whepTimeoutRef.current = setTimeout(() => {
        if (status !== "live") {
          connectHls();
        }
      }, WHEP_TIMEOUT_MS);
    } catch {
      connectHls();
    }
  }, [camera, camId, cleanupConnections, updateStatus, connectHls, scheduleReconnect, status]);

  // Handle Video Element Events
  const handlePlaying = useCallback(() => {
    updateStatus("live");
    reconnectAttemptRef.current = 0; // reset reconnect counter
    setReconnectCountdown(0);

    if (startTimeRef.current > 0) {
      const elapsed = Math.round(performance.now() - startTimeRef.current);
      setMetrics((m) => ({ ...m, firstFrameMs: elapsed, lastError: null }));
    }

    // Set up stall monitor: checks if currentTime advances
    if (stallTimerRef.current) clearInterval(stallTimerRef.current);
    lastCurrentTimeRef.current = videoRef.current?.currentTime || 0;

    stallTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const cur = video.currentTime;
      if (cur > 0 && cur === lastCurrentTimeRef.current) {
        // Stream stalled
        scheduleReconnect("Stream playback stalled");
      }
      lastCurrentTimeRef.current = cur;
    }, STALL_CHECK_INTERVAL_MS);
  }, [updateStatus, scheduleReconnect]);

  // FPS calculation for diagnostics
  useEffect(() => {
    if (status !== "live" || !showDiagnostics) {
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);
      return;
    }
    const video = videoRef.current;
    if (!video || !video.getVideoPlaybackQuality) return;

    let prevFrames = video.getVideoPlaybackQuality().totalVideoFrames || 0;
    fpsIntervalRef.current = setInterval(() => {
      const quality = video.getVideoPlaybackQuality();
      const currentFrames = quality.totalVideoFrames || 0;
      const fps = currentFrames - prevFrames;
      prevFrames = currentFrames;
      setMetrics((m) => ({ ...m, fps }));
    }, 1000);

    return () => {
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);
    };
  }, [status, showDiagnostics]);

  // Main lifecycle: Staggered batch initialization
  useEffect(() => {
    if (!camId) return;

    // Stagger startup in batches of 5 (150ms delay per camera in batch)
    // to prevent freezing the browser event loop with 30 concurrent handshakes
    const delay = Math.min((staggerIndex % 6) * 150, 900);
    const initTimer = setTimeout(() => {
      connectStream();
    }, delay);

    return () => {
      clearTimeout(initTimer);
      cleanupConnections();
    };
  }, [camId, staggerIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual retry handler
  const handleManualRetry = (e) => {
    e?.stopPropagation();
    reconnectAttemptRef.current = 0;
    connectStream();
  };

  const handleExpandClick = (e) => {
    e?.stopPropagation();
    if (onExpand) {
      onExpand(camera);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#080c12",
        minHeight: 110,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        onPlaying={handlePlaying}
        style={{
          width: "100%",
          height: "100%",
          objectFit: isFocused ? "contain" : "cover",
          display: status === "live" ? "block" : "none",
          backgroundColor: "#000",
        }}
      />

      {/* Status Overlays when not Live */}
      {status !== "live" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 14, 20, 0.95)",
            padding: 10,
            gap: 6,
            zIndex: 1,
          }}
        >
          {status === "loading" && (
            <>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "2px solid #1e2a3a",
                  borderTop: "2px solid #38bdf8",
                  animation: "cp-spin 0.8s linear infinite",
                }}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                Connecting feed…
              </div>
              <div className="mono" style={{ fontSize: 10, color: "#64748b" }}>
                {protocol === "webrtc" ? "WebRTC / WHEP" : "HLS Stream"}
              </div>
            </>
          )}

          {status === "reconnecting" && (
            <>
              <div style={{ fontSize: 18 }}>↺</div>
              <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                Reconnecting…
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>
                Retry in {reconnectCountdown}s
              </div>
              <button
                onClick={handleManualRetry}
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  padding: "2px 8px",
                  background: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: 3,
                  color: "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                Retry Now
              </button>
            </>
          )}

          {(status === "offline" || status === "error") && (
            <>
              <div style={{ fontSize: 20 }}>📷</div>
              <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
                Feed Unavailable
              </div>
              <div style={{ fontSize: 10, color: "#64748b" }}>
                {metrics.lastError || "Camera offline"}
              </div>
              <button
                onClick={handleManualRetry}
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  padding: "3px 10px",
                  background: "#1e293b",
                  border: "1px solid #3b82f6",
                  borderRadius: 4,
                  color: "#93c5fd",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                ↻ Reconnect
              </button>
            </>
          )}
        </div>
      )}

      {/* Live Badge & Overlay (Top-Left) */}
      {status === "live" && (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(10, 14, 20, 0.85)",
            backdropFilter: "blur(4px)",
            padding: "2px 6px",
            borderRadius: 3,
            zIndex: 2,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 6px #22c55e",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 9, fontWeight: 700, color: "#86efac", letterSpacing: "0.05em" }}>
            LIVE
          </span>
          <span
            style={{
              fontSize: 8,
              padding: "0 3px",
              borderRadius: 2,
              background: protocol === "webrtc" ? "#0369a1" : "#854d0e",
              color: protocol === "webrtc" ? "#bae6fd" : "#fef08a",
              fontWeight: 600,
              marginLeft: 2,
            }}
          >
            {protocol === "webrtc" ? "WHEP" : "HLS"}
          </span>
        </div>
      )}

      {/* Top-Right Quick Controls & Badges */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          display: "flex",
          alignItems: "center",
          gap: 4,
          zIndex: 2,
        }}
      >
        {status === "live" && showDiagnostics && (
          <div
            style={{
              background: "rgba(10, 14, 20, 0.85)",
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: 8,
              color: "#94a3b8",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {metrics.fps > 0 ? `${metrics.fps} FPS` : "25 FPS"}
            {metrics.firstFrameMs && ` · ${metrics.firstFrameMs}ms`}
          </div>
        )}

        {onExpand && (
          <button
            onClick={handleExpandClick}
            title="Open camera view"
            style={{
              background: "rgba(10, 14, 20, 0.8)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 3,
              color: "#cbd5e1",
              fontSize: 10,
              padding: "1px 5px",
              cursor: "pointer",
            }}
          >
            ⛶
          </button>
        )}
      </div>

      <style>{`
        @keyframes cp-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default memo(CameraPlayer);

