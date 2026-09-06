export function normalizeCameraId(cameraCodeOrId) {
  if (!cameraCodeOrId) return "";
  return String(cameraCodeOrId).replace(/^SENTINEL-/i, "").toLowerCase();
}

export function getCameraStream(camera, protocol = "webrtc", options = {}) {
  if (!camera) return null;
  const rawCode = camera.camera_code || camera.id || "";
  const camId = normalizeCameraId(rawCode);
  const gatewayBase = (options.streamGatewayBaseUrl || "/hls").replace(/\/+$/, "");

  switch (protocol) {
    case "webrtc":
    case "whep":
      return `/sentinel-whep/stream/${camId}/whep`;

    case "hls":
    case "local_hls":
    case "hls_gateway":
      return `${gatewayBase}/${camId}/index.m3u8`;

    case "hls_cdn":
      return `/sentinel-hls/${camId}/index.m3u8`;

    default:
      return `/sentinel-whep/stream/${camId}/whep`;
  }
}
