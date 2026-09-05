"""
Per-camera worker: opens the camera's RTSP stream and feeds sampled frames
into the processing pipeline. Runs at config.sample_fps rather than full
camera FPS — decouples analytics load from raw stream rate, per HLD
Section 10 ("Real-Time Streaming" — separate video transport from analytics).

This file's connection handling follows the Sentinel Camera Grid
integration reference (the official sandbox integration guide) point by
point, since those rules apply to any live RTSP source, not just Sentinel
specifically:

  - RTSP is always forced over TCP (never UDP) — UDP is silently accepted
    by most sources but fails across NAT/firewalls, producing corrupt
    frames that look like model bugs rather than a network issue.
  - Reconnects use exponential backoff (2s start, 30s cap), not a fixed
    sleep or a tight loop.
  - A failed frame read (ok=False) triggers reconnect logic; stderr-level
    decoder warnings from FFmpeg (e.g. "Error constructing the frame RPS"
    on join, before the first keyframe) are NOT treated as fatal — OpenCV
    only signals failure via ok=False, so this is automatic here, not
    something we have to suppress.
  - No motion/velocity/dwell-time arithmetic is derived from inter-frame
    timing anywhere in this pipeline. detected_at is wall-clock time and
    is used ONLY to timestamp when a plate was actually seen (for alerts
    and investigation), not to compute speed — if a future feature needs
    real elapsed-time-between-frames, use cap.get(cv2.CAP_PROP_POS_MSEC)
    (PTS), never arrival time or the source's declared FPS.
"""

import logging
import os
import threading
import time

import cv2

from pipeline import process_frame
from backend_client import BackendClient
from detector import VehicleDetector
from config import config

logger = logging.getLogger(__name__)

RECONNECT_BACKOFF_START_SECONDS = 2
RECONNECT_BACKOFF_CAP_SECONDS = 10   # reduced from 30s — fail-fast for dropped Sentinel streams
# Seconds without a successful frame read before we treat the stream as dead.
FRAME_STALL_TIMEOUT_SECONDS = 15


def open_rtsp_capture_tcp(stream_url: str) -> cv2.VideoCapture:
    """Opens an RTSP stream with transport forced to TCP (see module docstring)."""
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    # Give the decoder up to 5 s to produce its first frame
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
            return  # stop() was called while we were retrying the initial connect

        frame_interval = 1.0 / config.sample_fps
        last_processed = 0.0
        backoff_seconds = RECONNECT_BACKOFF_START_SECONDS
        last_frame_time = time.monotonic()

        try:
            while not self._stop_event.is_set():
                ok, frame = cap.read()

                # Stall detection: if we haven't received ANY frame in the timeout window,
                # treat it the same as ok=False to force a reconnect.
                now = time.monotonic()
                if not ok or (now - last_frame_time) > FRAME_STALL_TIMEOUT_SECONDS:
                    if not ok:
                        logger.warning(
                            "Lost stream for camera %s, reconnecting in %ss",
                            self.camera["camera_code"], backoff_seconds,
                        )
                    else:
                        logger.warning(
                            "Stream stall detected for camera %s (no frame for %ss), reconnecting",
                            self.camera["camera_code"], FRAME_STALL_TIMEOUT_SECONDS,
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

                last_frame_time = now  # got a valid frame

                if now - last_processed < frame_interval:
                    continue  # drop frame — keeps us at sample_fps regardless of source FPS
                last_processed = now

                try:
                    process_frame(frame, self.camera["id"], self.detector, self.backend)
                except Exception as exc:  # noqa: BLE001 - keep the camera loop alive on pipeline errors
                    logger.error("Pipeline error on camera %s: %s", self.camera["camera_code"], exc)
        finally:
            cap.release()
            logger.info("Stopped worker for camera %s", self.camera["camera_code"])

    def _connect_with_backoff(self, stream_url: str) -> cv2.VideoCapture | None:
        """Retries the initial connection with exponential backoff rather than giving up
        after one failed open — feeds are supervised and may be mid-restart when we first
        try, per the Sentinel integration reference's 'feeds are supervised and may restart'
        note. Returns None only if stop() was called while retrying."""
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
