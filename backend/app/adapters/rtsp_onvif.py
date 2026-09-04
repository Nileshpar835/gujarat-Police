"""
Generic RTSP / ONVIF adapter.

Covers the large majority of the ~50 heterogeneous hackathon test cameras,
since RTSP is the near-universal video transport and ONVIF is the most
common discovery/PTZ/event standard across vendors.

Two concrete adapters:
  - RTSPAdapter:  camera exposes a known RTSP URL directly.
  - ONVIFAdapter:  camera is discovered/managed via ONVIF (Profile S), and
                    the RTSP stream URL is resolved through ONVIF's media
                    service rather than being hard-coded.

IMPORTANT — RTSP transport: every RTSP connection in this file forces TCP
(never UDP). This isn't optional: UDP is silently accepted by most RTSP
sources but fails across NAT and most corporate/government firewalls,
producing partial/corrupt frames that look exactly like a model or codec
bug rather than a network issue. This matches the explicit integration
requirement for the Sentinel Camera Grid sandbox ("Force RTSP over TCP" —
Section 3 of the Sentinel integration reference) and is good practice for
any real deployment regardless of source.
"""

import time
import asyncio
import logging
import os

import cv2
from tenacity import retry, stop_after_attempt, wait_fixed

from app.adapters.base import CameraAdapter, HealthResult, StreamInfo

logger = logging.getLogger(__name__)


def open_rtsp_capture_tcp(url: str) -> cv2.VideoCapture:
    """
    Opens an RTSP stream with transport forced to TCP. OpenCV's FFmpeg
    backend reads this from an environment variable rather than a
    per-capture parameter, so we set it immediately before each open call
    — safe even with multiple concurrent captures, since FFmpeg reads the
    env var at open time, not continuously.
    """
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
    return cv2.VideoCapture(url, cv2.CAP_FFMPEG)


class RTSPAdapter(CameraAdapter):
    """
    connection_config expects:
      {
        "rtsp_url": "rtsp://user:pass@host:554/stream1",
        "codec": "h264",         # optional
        "resolution": "1920x1080"  # optional, informational
      }
    Credentials should be resolved from a secrets manager before being
    placed into this config — never store them in the database in plaintext
    (see vms_systems.auth_config_ref in the schema).
    """

    async def connect(self) -> bool:
        health = await self.get_health()
        return health.is_reachable

    async def get_stream_url(self) -> StreamInfo:
        return StreamInfo(
            stream_url=self.config["rtsp_url"],
            codec=self.config.get("codec"),
            resolution=self.config.get("resolution"),
            fps=self.config.get("fps"),
        )

    @retry(stop=stop_after_attempt(2), wait=wait_fixed(1))
    async def get_health(self) -> HealthResult:
        """
        Health is verified by attempting to open the stream and read a single
        frame with a bounded timeout, run in a thread since OpenCV's
        VideoCapture is blocking.
        """
        url = self.config["rtsp_url"]
        loop = asyncio.get_event_loop()
        start = time.monotonic()
        try:
            is_ok, err = await loop.run_in_executor(None, self._probe_frame, url)
            latency_ms = int((time.monotonic() - start) * 1000)
            if is_ok:
                return HealthResult(is_reachable=True, latency_ms=latency_ms)
            return HealthResult(is_reachable=False, latency_ms=latency_ms, error_message=err)
        except Exception as exc:  # noqa: BLE001 - surface any capture failure as unreachable
            return HealthResult(is_reachable=False, error_message=str(exc))

    @staticmethod
    def _probe_frame(url: str, timeout_ms: int = 5000):
        cap = open_rtsp_capture_tcp(url)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)
        try:
            if not cap.isOpened():
                return False, "Could not open RTSP stream (connection refused or invalid URL)"
            ok, _frame = cap.read()
            if not ok:
                return False, "Stream opened but no frame could be read"
            return True, None
        finally:
            cap.release()


class ONVIFAdapter(CameraAdapter):
    """
    connection_config expects:
      {
        "host": "10.1.2.3", "port": 80,
        "username": "...", "password": "...",
        "wsdl_dir": "/path/to/onvif/wsdl"   # optional override
      }
    Resolves the actual RTSP stream URL via ONVIF's Media service rather
    than requiring it to be hard-coded — this is what lets a heterogeneous
    fleet of ONVIF-compliant cameras be onboarded generically.
    """

    def __init__(self, camera_id: str, connection_config: dict):
        super().__init__(camera_id, connection_config)
        self._cached_stream_info: StreamInfo | None = None

    async def connect(self) -> bool:
        try:
            from onvif import ONVIFCamera  # onvif-zeep-async

            cam = ONVIFCamera(
                self.config["host"],
                self.config.get("port", 80),
                self.config["username"],
                self.config["password"],
            )
            await cam.update_xaddrs()
            media_service = await cam.create_media_service()
            profiles = await media_service.GetProfiles()
            if not profiles:
                return False
            uri_response = await media_service.GetStreamUri(
                {
                    "StreamSetup": {
                        "Stream": "RTP-Unicast",
                        "Transport": {"Protocol": "RTSP"},
                    },
                    "ProfileToken": profiles[0].token,
                }
            )
            self._cached_stream_info = StreamInfo(
                stream_url=uri_response.Uri,
                resolution=f"{profiles[0].VideoEncoderConfiguration.Resolution.Width}x"
                           f"{profiles[0].VideoEncoderConfiguration.Resolution.Height}"
                if getattr(profiles[0], "VideoEncoderConfiguration", None) else None,
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("ONVIF connect failed for camera %s: %s", self.camera_id, exc)
            return False

    async def get_stream_url(self) -> StreamInfo:
        if not self._cached_stream_info:
            connected = await self.connect()
            if not connected:
                raise ConnectionError(f"Unable to resolve ONVIF stream for camera {self.camera_id}")
        return self._cached_stream_info

    async def get_health(self) -> HealthResult:
        start = time.monotonic()
        ok = await self.connect()
        latency_ms = int((time.monotonic() - start) * 1000)
        if ok:
            return HealthResult(is_reachable=True, latency_ms=latency_ms)
        return HealthResult(is_reachable=False, latency_ms=latency_ms, error_message="ONVIF handshake failed")
