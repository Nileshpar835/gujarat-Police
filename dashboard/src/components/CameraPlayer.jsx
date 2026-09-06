import { useEffect, useRef, useState, useCallback, memo } from "react";
import Hls from "hls.js";
import { getCameraStream, normalizeCameraId } from "../utils/streamUrlBuilder.js";

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const WHEP_TIMEOUT_MS = 8000;
const STALL_CHECK_INTERVAL_MS = 6000;
const HLS_STALL_THRESHOLD_S = 8;

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
  const statusRef = useRef("loading");
  const protocolRef = useRef("webrtc");
  const isLiveRef = useRef(false);
  const mountedRef = useRef(true);

  const [status, setStatus] = useState("loading");
  const [protocol, setProtocol] = useState("webrtc");
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

  const updateStatus = useCallback((newStatus, errorMsg = null) => {
    if (!mountedRef.current) return;
    statusRef.current = newStatus;
    isLiveRef.current = newStatus === "live";
    setStatus(newStatus);
    if (errorMsg) {
      setMetrics((m) => ({ ...m, lastError: errorMsg }));
    }
    if (onStatusChange) {
      onStatusChange(camId, newStatus);
    }
  }, [camId, onStatusChange]);

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
    if (whepSessionUrlRef.current) {
      fetch(whepSessionUrlRef.current, { method: "DELETE" }).catch(() => {});
      whepSessionUrlRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch { /* ignore */ }
      pcRef.current = null;
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch { /* ignore */ }
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      try {
        if (video.srcObject) {
          const stream = video.srcObject;
          if (stream.getTracks) stream.getTracks().forEach((t) => t.stop());
          video.srcObject = null;
        }
        video.src = "";
      } catch { /* ignore */ }
    }
  }, []);

  const connectHls = useCallback((useLocal = true) => {
    const video = videoRef.current;
    if (!video || !camId || !mountedRef.current) return;

    cleanupConnections();
    setProtocol("hls");
    protocolRef.current = "hls";
    updateStatus("loading");

    const hlsUrl = useLocal
      ? getCameraStream(camera, "local_hls", { streamGatewayBaseUrl })
      : getCameraStream(camera, "hls");

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 10000,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxBufferLength: 8,
        maxMaxBufferLength: 15,
        startLevel: -1,
        xhrSetup: (xhr) => { xhr.withCredentials = true; },
      });

      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!mountedRef.current) return;
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal || !mountedRef.current) return;
        if (useLocal) {
          connectHls(false);
        } else {
          scheduleReconnect(`HLS fatal: ${data.details || "error"}`);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener("error", () => {
        if (mountedRef.current) {
          if (useLocal) connectHls(false);
          else scheduleReconnect("Safari HLS error");
        }
      }, { once: true });
      video.play().catch(() => {});
    } else {
      scheduleReconnect("Neither WebRTC nor HLS supported");
    }
  }, [camera, camId, streamGatewayBaseUrl, cleanupConnections, updateStatus]);

  const scheduleReconnect = useCallback((reason) => {
    if (!mountedRef.current) return;
    cleanupConnections();
    reconnectAttemptRef.current += 1;
    const attempt = reconnectAttemptRef.current;
    const backoff = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_MS);
    const jitter = Math.floor(Math.random() * 1000) - 500;
    const delay = Math.max(1500, backoff + jitter);
    const seconds = Math.ceil(delay / 1000);

    setReconnectCountdown(seconds);
    updateStatus("reconnecting", reason);
    setMetrics((m) => ({ ...m, reconnectCount: attempt }));

    const countdownInterval = setInterval(() => {
      if (!mountedRef.current) { clearInterval(countdownInterval); return; }
      setReconnectCountdown((s) => {
        if (s <= 1) { clearInterval(countdownInterval); return 0; }
        return s - 1;
      });
    }, 1000);

    reconnectTimerRef.current = setTimeout(() => {
      clearInterval(countdownInterval);
      if (mountedRef.current) connectStream();
    }, delay);
  }, [cleanupConnections, updateStatus]);

  const connectStream = useCallback(() => {
    if (!mountedRef.current || !camId) return;
    cleanupConnections();
    const video = videoRef.current;
    if (!video) return;

    updateStatus("loading");
    startTimeRef.current = performance.now();
    abortCtrlRef.current = new AbortController();

    const whepUrl = getCameraStream(camera, "webrtc");

    if (typeof RTCPeerConnection === "undefined") {
      connectHls(true);
      return;
    }

    setProtocol("webrtc");
    protocolRef.current = "webrtc";

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
        if (evt.streams && evt.streams[0] && mountedRef.current) {
          video.srcObject = evt.streams[0];
          video.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (!pcRef.current || !mountedRef.current) return;
        const state = pc.connectionState;
        if (state === "failed") {
          connectHls(true);
        } else if (state === "disconnected") {
          scheduleReconnect("WebRTC disconnected");
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => new Promise((resolve) => {
          if (pc.iceGatheringState === "complete") { resolve(); return; }
          const check = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", check);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", check);
          setTimeout(resolve, 800);
        }))
        .then(() => {
          if (!pcRef.current || !abortCtrlRef.current || abortCtrlRef.current.signal.aborted) return;
          const sdpOffer = pc.localDescription?.sdp;
          if (!sdpOffer) throw new Error("No local SDP offer generated");
          return fetch(whepUrl, {
            method: "POST",
            headers: { "Content-Type": "application/sdp" },
            body: sdpOffer,
            signal: abortCtrlRef.current.signal,
          });
        })
        .then((res) => {
          if (!res) return;
          if (!res.ok) throw new Error(`WHEP HTTP ${res.status}`);
          const loc = res.headers.get("Location");
          if (loc) whepSessionUrlRef.current = loc;
          return res.text();
        })
        .then((answerSdp) => {
          if (!answerSdp || !pcRef.current || !mountedRef.current) return;
          return pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          if (err.name === "AbortError") return;
          connectHls(true);
        });

      whepTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (!isLiveRef.current) {
          connectHls(true);
        }
      }, WHEP_TIMEOUT_MS);
    } catch {
      if (mountedRef.current) connectHls(true);
    }
  }, [camera, camId, cleanupConnections, updateStatus, connectHls, scheduleReconnect]);

  const handlePlaying = useCallback(() => {
    if (!mountedRef.current) return;
    updateStatus("live");
    reconnectAttemptRef.current = 0;
    setReconnectCountdown(0);

    if (startTimeRef.current > 0) {
      const elapsed = Math.round(performance.now() - startTimeRef.current);
      setMetrics((m) => ({ ...m, firstFrameMs: elapsed, lastError: null }));
    }

    if (stallTimerRef.current) clearInterval(stallTimerRef.current);
    lastCurrentTimeRef.current = videoRef.current?.currentTime || 0;

    stallTimerRef.current = setInterval(() => {
      if (!mountedRef.current || !videoRef.current) return;
      const video = videoRef.current;
      const cur = video.currentTime;

      if (protocolRef.current === "hls") {
        if (cur > 0 && Math.abs(cur - lastCurrentTimeRef.current) < 0.01) {
          scheduleReconnect("HLS stream stalled");
          return;
        }
      }

      lastCurrentTimeRef.current = cur;
    }, STALL_CHECK_INTERVAL_MS);
  }, [updateStatus, scheduleReconnect]);

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

    return () => { if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current); };
  }, [status, showDiagnostics]);

  useEffect(() => {
    if (!camId) return;
    mountedRef.current = true;

    const BATCH_SIZE = 6;
    const BATCH_DELAY_MS = 2000;
    const intraBatchDelay = (staggerIndex % BATCH_SIZE) * 250;
    const batchNumber = Math.floor(staggerIndex / BATCH_SIZE);
    const delay = (batchNumber * BATCH_DELAY_MS) + intraBatchDelay;

    const initTimer = setTimeout(() => {
      if (mountedRef.current) connectStream();
    }, delay);

    return () => {
      clearTimeout(initTimer);
      mountedRef.current = false;
      cleanupConnections();
    };
  }, [camId, staggerIndex, connectStream, cleanupConnections]);

  const handleManualRetry = (e) => {
    e?.stopPropagation();
    reconnectAttemptRef.current = 0;
    mountedRef.current = true;
    connectStream();
  };

  const handleExpandClick = (e) => {
    e?.stopPropagation();
    if (onExpand) onExpand(camera);
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
                  width: 22, height: 22, borderRadius: "50%",
                  border: "2px solid #1e2a3a", borderTop: "2px solid #38bdf8",
                  animation: "cp-spin 0.8s linear infinite",
                }}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                Connecting feed...
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
                Reconnecting...
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>
                Retry in {reconnectCountdown}s
              </div>
              <button
                onClick={handleManualRetry}
                style={{
                  marginTop: 4, fontSize: 10, padding: "2px 8px",
                  background: "#1e293b", border: "1px solid #475569",
                  borderRadius: 3, color: "#cbd5e1", cursor: "pointer",
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
                  marginTop: 4, fontSize: 10, padding: "3px 10px",
                  background: "#1e293b", border: "1px solid #3b82f6",
                  borderRadius: 4, color: "#93c5fd", cursor: "pointer", fontWeight: 500,
                }}
              >
                ↻ Reconnect
              </button>
            </>
          )}
        </div>
      )}

      {status === "live" && (
        <div
          style={{
            position: "absolute", top: 6, left: 6,
            display: "flex", alignItems: "center", gap: 4,
            background: "rgba(10, 14, 20, 0.85)", backdropFilter: "blur(4px)",
            padding: "2px 6px", borderRadius: 3, zIndex: 2,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#22c55e", boxShadow: "0 0 6px #22c55e",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 9, fontWeight: 700, color: "#86efac", letterSpacing: "0.05em" }}>
            LIVE
          </span>
          <span
            style={{
              fontSize: 8, padding: "0 3px", borderRadius: 2,
              background: protocol === "webrtc" ? "#0369a1" : "#854d0e",
              color: protocol === "webrtc" ? "#bae6fd" : "#fef08a",
              fontWeight: 600, marginLeft: 2,
            }}
          >
            {protocol === "webrtc" ? "WHEP" : "HLS"}
          </span>
        </div>
      )}

      <div
        style={{
          position: "absolute", top: 6, right: 6,
          display: "flex", alignItems: "center", gap: 4, zIndex: 2,
        }}
      >
        {status === "live" && showDiagnostics && (
          <div
            style={{
              background: "rgba(10, 14, 20, 0.85)", padding: "1px 5px",
              borderRadius: 3, fontSize: 8, color: "#94a3b8",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {metrics.fps > 0 ? `${metrics.fps} FPS` : ""}
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
              borderRadius: 3, color: "#cbd5e1", fontSize: 10,
              padding: "1px 5px", cursor: "pointer",
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
