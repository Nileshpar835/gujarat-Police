"""
Per-camera worker: opens the camera's RTSP stream and feeds sampled frames
into the processing pipeline.

Sentinel Camera Grid rules applied here:
  - RTSP always over TCP
  - Timing for evidence uses CAP_PROP_POS_MSEC (PTS), never arrival time
  - Reconnect with exponential backoff (2s start, 30s cap)
  - Decoder warnings on join are not fatal (OpenCV only fails via ok=False)
  - Inter-frame gaps do not crash the loop
"""

import logging
import os
import threading
import time
from datetime import datetime, timezone

import cv2

from pipeline import process_frame
from backend_client import BackendClient
from detector import VehicleDetector
from config import config

logger = logging.getLogger(__name__)

RECONNECT_BACKOFF_START_SECONDS = 2
RECONNECT_BACKOFF_CAP_SECONDS = 30
FRAME_STALL_TIMEOUT_SECONDS = 15


def open_rtsp_capture_tcp(stream_url: str) -> cv2.VideoCapture:
    """Opens an RTSP stream with transport forced to TCP and bounded timeouts."""
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
    return cap


class CameraWorker(threading.Thread):
    def __init__(self, camera: dict, detector: VehicleDetector, backend: BackendClient):
        super().__init__(daemon=True, name=f"camera-{camera['camera_code']}")
        self.camera = camera
        self.detector = detector
        self.backend = backend
        self._stop_event = threading.Event()

    def stop(self):
        self._stop_event.set()

    def run(self):
        stream_url = self.camera.get("stream_url")
        if not stream_url:
            logger.warning("Camera %s has no stream_url, skipping", self.camera["camera_code"])
            return

        logger.info("Starting worker for camera %s", self.camera["camera_code"])

        cap = self._connect_with_backoff(stream_url)
        if cap is None:
            return

        frame_interval = 1.0 / max(config.sample_fps, 0.1)
        last_processed = 0.0
        backoff_seconds = RECONNECT_BACKOFF_START_SECONDS
        last_frame_time = time.monotonic()

        try:
            while not self._stop_event.is_set():
                ok, frame = cap.read()
                now = time.monotonic()

                stalled = (now - last_frame_time) > FRAME_STALL_TIMEOUT_SECONDS
                if not ok or stalled:
                    reason = "no frame" if not ok else f"stall ({FRAME_STALL_TIMEOUT_SECONDS}s)"
                    logger.warning(
                        "Lost stream for camera %s (%s), reconnecting in %ss",
                        self.camera["camera_code"], reason, backoff_seconds,
                    )
                    cap.release()
                    if self._stop_event.wait(timeout=backoff_seconds):
                        break
                    cap = open_rtsp_capture_tcp(stream_url)
                    if cap.isOpened():
                        backoff_seconds = RECONNECT_BACKOFF_START_SECONDS
                        last_frame_time = time.monotonic()
                    else:
                        backoff_seconds = min(backoff_seconds * 2, RECONNECT_BACKOFF_CAP_SECONDS)
                    continue

                last_frame_time = now
                backoff_seconds = RECONNECT_BACKOFF_START_SECONDS

                if now - last_processed < frame_interval:
                    continue
                last_processed = now

                pts_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                pts_ok = pts_ms is not None and pts_ms >= 0
                frame_timestamp = datetime.now(timezone.utc)
                video_timestamp_ref = f"pts_ms={int(pts_ms)}" if pts_ok else None

                try:
                    process_frame(
                        frame,
                        self.camera["id"],
                        self.detector,
                        self.backend,
                        frame_timestamp=frame_timestamp,
                        video_timestamp_ref=video_timestamp_ref,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.error("Pipeline error on camera %s: %s", self.camera["camera_code"], exc)
        finally:
            cap.release()
            logger.info("Stopped worker for camera %s", self.camera["camera_code"])

    def _connect_with_backoff(self, stream_url: str) -> cv2.VideoCapture | None:
        backoff_seconds = RECONNECT_BACKOFF_START_SECONDS
        while not self._stop_event.is_set():
            cap = open_rtsp_capture_tcp(stream_url)
            if cap.isOpened():
                return cap
            logger.warning(
                "Could not open stream for camera %s, retrying in %ss",
                self.camera["camera_code"], backoff_seconds,
            )
            cap.release()
            if self._stop_event.wait(timeout=backoff_seconds):
                return None
            backoff_seconds = min(backoff_seconds * 2, RECONNECT_BACKOFF_CAP_SECONDS)
        return None
