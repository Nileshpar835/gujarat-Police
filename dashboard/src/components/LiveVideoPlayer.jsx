import { memo } from "react";
import CameraPlayer from "./CameraPlayer.jsx";

function LiveVideoPlayer({
  cameraCode,
  camera,
  streamGatewayBaseUrl = "/hls",
  staggerIndex = 0,
  isFocused = false,
  showDiagnostics = false,
  onStatusChange,
  onExpand,
  lazy = true,
  ...rest
}) {
  const camObj =
    camera ||
    (cameraCode
      ? { camera_code: cameraCode, name: cameraCode }
      : null);

  return (
    <CameraPlayer
      camera={camObj}
      streamGatewayBaseUrl={streamGatewayBaseUrl}
      staggerIndex={staggerIndex}
      isFocused={isFocused}
      showDiagnostics={showDiagnostics}
      onStatusChange={onStatusChange}
      onExpand={onExpand}
      {...rest}
    />
  );
}

export default memo(LiveVideoPlayer);
