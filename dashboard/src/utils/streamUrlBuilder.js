/**
 * Centralized Stream URL Builder for Sentinel Cameras.
 *
 * Requirements:
 *  - Centralized URL generation (no random URLs across components).
 *  - Zero credentials exposed to frontend.
 *  - Normalizes IDs safely (cam01 <-> SENTINEL-cam01).
 *  - Supports WebRTC/WHEP signaling endpoints, CDN HLS, and local MediaMTX HLS.
 */

export function normalizeCameraId(cameraCodeOrId) {
  if (!cameraCodeOrId) return "";
  return String(cameraCodeOrId).replace(/^SENTINEL-/i, "").toLowerCase();
}

export function getCameraStream(camera, protocol = "webrtc", options = {}) {
  if (!camera) return null;
  const rawCode = camera.camera_code || camera.id || "";
  const camId = normalizeCameraId(rawCode);
  const code = rawCode.startsWith("SENTINEL-") ? rawCode : `SENTINEL-${camId}`;
  const gatewayBase = (options.streamGatewayBaseUrl || "/hls").replace(/\/+$/, "");

  switch (protocol) {
    case "webrtc":
    case "whep":
      // Primary WebRTC / WHEP signaling endpoint (proxied to MediaMTX with server-side auth)
      return `/sentinel-whep/stream/${camId}/whep`;

    case "webrtc_backend":
      // Backend FastAPI WHEP proxy fallback
      return `/api/v1/cameras/${code}/whep`;

    case "hls":
    case "hls_cdn":
      // Primary HLS Fallback: Edge CDN pre-muxed HLS (proxied with session cookie)
      return `/sentinel-hls/${camId}/index.m3u8`;

    case "local_hls":
    case "hls_gateway":
      // Secondary HLS Fallback: Local MediaMTX instance
      return `${gatewayBase}/${code}/index.m3u8`;

    default:
      return `/sentinel-whep/stream/${camId}/whep`;
  }
}

