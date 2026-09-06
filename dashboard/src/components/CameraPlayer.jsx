import { useEffect, useRef, useState, useCallback, memo } from "react";
import Hls from "hls.js";
import { getCameraStream, normalizeCameraId } from "../utils/streamUrlBuilder.js";

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const WHEP_TIMEOUT_MS = 8000;
const STALL_CHECK_INTERVAL_MS = 6000;

function formatTimestamp(date) {
  const d = date || new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const h12 = d.getHours() % 12 || 12;
  return `${dd}/${mm}/${yyyy} ${days[d.getDay()]} ${String(h12).padStart(2, "0")}:${min}:${ss} ${ampm}`;
}

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
  const timestampIntervalRef = useRef(null);

  const [status, setStatus] = useState("loading");
  const [protocol, setProtocol] = useState("webrtc");
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [timestamp, setTimestamp] = useState(formatTimestamp());
  const [metrics, setMetrics] = useState({
    fps: 0,
    firstFrameMs: null,
    reconnectCount: 0,
    lastError: null,
  });

  const rawCode = camera?.camera_code || camera?.id || "";
  const camId = normalizeCameraId(rawCode);
  const channelNum = (staggerIndex || 0) + 1;

  const updateStatus = useCallback((newStatus, errorMsg = null) => {
    if (!mountedRef.current) return;
    statusRef.current = newStatus;
    isLiveRef.current = newStatus === "live";
    setStatus(newStatus);
    if (errorMsg) setMetrics((m) => ({ ...m, lastError: errorMsg }));
    if (onStatusChange) onStatusChange(camId, newStatus);
  }, [camId, onStatusChange]);

  const cleanupConnections = useCallback(() => {
    if (abortCtrlRef.current) { abortCtrlRef.current.abort(); abortCtrlRef.current = null; }
    if (whepTimeoutRef.current) { clearTimeout(whepTimeoutRef.current); whepTimeoutRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
    if (fpsIntervalRef.current) { clearInterval(fpsIntervalRef.current); fpsIntervalRef.current = null; }
    if (whepSessionUrlRef.current) { fetch(whepSessionUrlRef.current, { method: "DELETE" }).catch(() => {}); whepSessionUrlRef.current = null; }
    if (pcRef.current) {
      try { pcRef.current.onconnectionstatechange = null; pcRef.current.oniceconnectionstatechange = null; pcRef.current.ontrack = null; pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    const video = videoRef.current;
    if (video) {
      try {
        if (video.srcObject) { const s = video.srcObject; if (s.getTracks) s.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
        video.src = "";
      } catch {}
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
      : getCameraStream(camera, "hls_cdn");

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
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (mountedRef.current) video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal || !mountedRef.current) return;
        if (useLocal) connectHls(false);
        else scheduleReconnect(`HLS fatal: ${data.details}`);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener("error", () => { if (mountedRef.current) { if (useLocal) connectHls(false); else scheduleReconnect("Safari HLS error"); } }, { once: true });
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

    const countdown = setInterval(() => {
      if (!mountedRef.current) { clearInterval(countdown); return; }
      setReconnectCountdown((s) => { if (s <= 1) { clearInterval(countdown); return 0; } return s - 1; });
    }, 1000);
    reconnectTimerRef.current = setTimeout(() => { clearInterval(countdown); if (mountedRef.current) connectStream(); }, delay);
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
    if (typeof RTCPeerConnection === "undefined") { connectHls(true); return; }

    setProtocol("webrtc");
    protocolRef.current = "webrtc";

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;
      pc.addTransceiver("video", { direction: "recvonly" });

      pc.ontrack = (evt) => {
        if (evt.streams?.[0] && mountedRef.current) { video.srcObject = evt.streams[0]; video.play().catch(() => {}); }
      };
      pc.onconnectionstatechange = () => {
        if (!pcRef.current || !mountedRef.current) return;
        if (pc.connectionState === "failed") connectHls(true);
        else if (pc.connectionState === "disconnected") scheduleReconnect("WebRTC disconnected");
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => new Promise((resolve) => {
          if (pc.iceGatheringState === "complete") { resolve(); return; }
          const check = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", check); resolve(); } };
          pc.addEventListener("icegatheringstatechange", check);
          setTimeout(resolve, 800);
        }))
        .then(() => {
          if (!pcRef.current || abortCtrlRef.current?.signal.aborted) return;
          const sdp = pc.localDescription?.sdp;
          if (!sdp) throw new Error("No SDP");
          return fetch(whepUrl, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: sdp, signal: abortCtrlRef.current.signal });
        })
        .then((res) => { if (!res) return; if (!res.ok) throw new Error(`WHEP ${res.status}`); const loc = res.headers.get("Location"); if (loc) whepSessionUrlRef.current = loc; return res.text(); })
        .then((sdp) => { if (sdp && pcRef.current && mountedRef.current) return pc.setRemoteDescription({ type: "answer", sdp }); })
        .catch((err) => { if (mountedRef.current && err.name !== "AbortError") connectHls(true); });

      whepTimeoutRef.current = setTimeout(() => { if (mountedRef.current && !isLiveRef.current) connectHls(true); }, WHEP_TIMEOUT_MS);
    } catch { if (mountedRef.current) connectHls(true); }
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
      if (protocolRef.current === "hls") {
        const cur = videoRef.current.currentTime;
        if (cur > 0 && Math.abs(cur - lastCurrentTimeRef.current) < 0.01) { scheduleReconnect("HLS stalled"); return; }
        lastCurrentTimeRef.current = cur;
      }
    }, STALL_CHECK_INTERVAL_MS);
  }, [updateStatus, scheduleReconnect]);

  useEffect(() => {
    if (status !== "live" || !showDiagnostics) { if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current); return; }
    const video = videoRef.current;
    if (!video?.getVideoPlaybackQuality) return;
    let prev = video.getVideoPlaybackQuality().totalVideoFrames || 0;
    fpsIntervalRef.current = setInterval(() => {
      const q = video.getVideoPlaybackQuality();
      const cur = q.totalVideoFrames || 0;
      setMetrics((m) => ({ ...m, fps: cur - prev }));
      prev = cur;
    }, 1000);
    return () => { if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current); };
  }, [status, showDiagnostics]);

  useEffect(() => {
    timestampIntervalRef.current = setInterval(() => setTimestamp(formatTimestamp()), 1000);
    return () => { if (timestampIntervalRef.current) clearInterval(timestampIntervalRef.current); };
  }, []);

  useEffect(() => {
    if (!camId) return;
    mountedRef.current = true;
    const BATCH_SIZE = 6;
    const BATCH_DELAY_MS = 2000;
    const intraBatchDelay = (staggerIndex % BATCH_SIZE) * 250;
    const batchNumber = Math.floor(staggerIndex / BATCH_SIZE);
    const delay = (batchNumber * BATCH_DELAY_MS) + intraBatchDelay;
    const timer = setTimeout(() => { if (mountedRef.current) connectStream(); }, delay);
    return () => { clearTimeout(timer); mountedRef.current = false; cleanupConnections(); };
  }, [camId, staggerIndex, connectStream, cleanupConnections]);

  const handleManualRetry = (e) => { e?.stopPropagation(); reconnectAttemptRef.current = 0; mountedRef.current = true; connectStream(); };

  const isOnline = status === "live";
  const camIp = "192.168.1.210:90";

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", background: "#000", overflow: "hidden" }}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        onPlaying={handlePlaying}
        style={{
          width: "100%", height: "100%",
          objectFit: isFocused ? "contain" : "cover",
          display: status === "live" ? "block" : "none",
        }}
      />

      {/* Top-left: Channel + status badge */}
      <div style={{ position: "absolute", top: 6, left: 6, display: "flex", alignItems: "center", gap: 6, zIndex: 2 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(10,15,26,0.88)",
            backdropFilter: "blur(4px)",
            padding: "3px 8px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: isOnline ? "var(--accent-green)" : status === "reconnecting" ? "var(--accent-yellow)" : "var(--accent-red)",
              boxShadow: isOnline ? "0 0 6px var(--accent-green)" : "none",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.04em" }}>
            CHANNEL {String(channelNum).padStart(2, "0")}
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: "var(--radius-sm)",
            background: protocol === "webrtc" ? "rgba(37,99,235,0.85)" : "rgba(139,92,246,0.85)",
            color: "#fff",
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
          }}
        >
          {camIp}
        </span>
      </div>

      {/* Top-right: timestamp + REC */}
      <div style={{ position: "absolute", top: 6, right: 6, display: "flex", alignItems: "center", gap: 6, zIndex: 2 }}>
        {status === "live" && (
          <span
            style={{
              fontSize: 9,
              padding: "2px 6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(10,15,26,0.88)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              backdropFilter: "blur(4px)",
            }}
          >
            {timestamp}
          </span>
        )}
      </div>

      {/* Bottom-left: REC badge */}
      {status === "live" && (
        <div style={{ position: "absolute", bottom: 6, left: 6, zIndex: 2, display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(10,15,26,0.88)",
              padding: "2px 7px",
              borderRadius: "var(--radius-sm)",
              backdropFilter: "blur(4px)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-red)", animation: "pulse 1.5s infinite" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent-red)", letterSpacing: "0.05em" }}>REC</span>
          </div>
        </div>
      )}

      {/* Bottom-right: expand button */}
      {onExpand && (
        <button
          onClick={(e) => { e.stopPropagation(); onExpand(camera); }}
          title="Expand"
          style={{
            position: "absolute", bottom: 6, right: 6, zIndex: 2,
            background: "rgba(10,15,26,0.7)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            fontSize: 11,
            padding: "2px 5px",
          }}
        >
          ⛶
        </button>
      )}

      {/* Center: Status overlays when not live */}
      {status !== "live" && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(10,15,26,0.95)", padding: 10, gap: 6, zIndex: 1,
          }}
        >
          {status === "loading" && (
            <>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--border-secondary)", borderTop: "2px solid var(--accent-blue)", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>Connecting...</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)" }}>
                {protocol === "webrtc" ? "WHEP" : "HLS"}
              </div>
            </>
          )}
          {status === "reconnecting" && (
            <>
              <div style={{ fontSize: 16, color: "var(--accent-yellow)" }}>↺</div>
              <div style={{ fontSize: 11, color: "var(--accent-yellow)", fontWeight: 600 }}>Reconnecting...</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{reconnectCountdown}s</div>
              <button onClick={handleManualRetry} style={{ marginTop: 4, fontSize: 10, padding: "2px 8px", background: "var(--bg-tertiary)", border: "1px solid var(--border-secondary)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)" }}>
                Retry
              </button>
            </>
          )}
          {(status === "offline" || status === "error") && (
            <>
              <div style={{ fontSize: 18, opacity: 0.4 }}>📷</div>
              <div style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 600 }}>Offline</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{metrics.lastError || "Camera unavailable"}</div>
              <button onClick={handleManualRetry} style={{ marginTop: 4, fontSize: 10, padding: "3px 10px", background: "var(--accent-blue-dim)", border: "1px solid var(--accent-blue)", borderRadius: "var(--radius-sm)", color: "var(--text-accent)", fontWeight: 500 }}>
                ↻ Reconnect
              </button>
            </>
          )}
        </div>
      )}

      {/* Diagnostics overlay */}
      {status === "live" && showDiagnostics && (
        <div
          style={{
            position: "absolute", bottom: 28, left: 6, zIndex: 2,
            background: "rgba(10,15,26,0.88)", padding: "2px 6px",
            borderRadius: "var(--radius-sm)", fontSize: 8, color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", backdropFilter: "blur(4px)",
          }}
        >
          {metrics.fps > 0 ? `${metrics.fps} FPS` : ""}
          {metrics.firstFrameMs ? ` · ${metrics.firstFrameMs}ms` : ""}
          {` · ${protocol.toUpperCase()}`}
        </div>
      )}
    </div>
  );
}

export default memo(CameraPlayer);
