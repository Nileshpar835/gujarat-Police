"""
AI Analytics Pipeline entrypoint.

Polls the Registry & GIS backend for active cameras and maintains one
CameraWorker thread per camera, restarting the camera list periodically
so newly-onboarded cameras are picked up without redeploying this service
(the model discovery pattern implied by the Federation Middleware in the
HLD — this worker doesn''t need to know about specific vendors, only the
normalised camera list the backend already exposes).
"""

import os
import logging
import time

# Suppress verbose ffmpeg / libav decoder messages (h264 "error while decoding
# MB …", hevc "Could not find ref with POC …", etc.).  These are produced by
# OpenCV''s FFmpeg backend writing directly to stderr.  Per the Sentinel guide,
# decoder warnings must not be treated as fatal — they are safe to suppress so
# our structured log stays readable.
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "8")  # AV_LOG_FATAL only
# Some ffmpeg builds still honour this env var for libav* output:
os.environ.setdefault("FFREPORT", "")

from camera_worker import CameraWorker
from backend_client import BackendClient
from detector import VehicleDetector
from config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai-worker")


def main():
    backend = BackendClient()
    detector = VehicleDetector()  # one shared model instance across camera threads
    active_workers: dict[str, CameraWorker] = {}

    logger.info("AI worker started. Polling %s for active cameras every %ss",
                config.backend_base_url, config.camera_poll_interval_seconds)

    MAX_CONCURRENT_CAMERAS = int(os.getenv("MAX_CONCURRENT_CAMERAS", "6"))

    while True:
        try:
            cameras = backend.list_active_cameras()
        except Exception as exc:  # noqa: BLE001
            logger.error("Could not reach backend for camera list: %s", exc)
            time.sleep(config.camera_poll_interval_seconds)
            continue

        target_cameras = cameras[:MAX_CONCURRENT_CAMERAS]
        current_ids = {c["id"] for c in target_cameras}

        # start workers for newly-active cameras within quota
        for cam in target_cameras:
            if cam["id"] not in active_workers:
                worker = CameraWorker(cam, detector, backend)
                worker.start()
                active_workers[cam["id"]] = worker

        # stop workers for cameras that are no longer in target set
        for cam_id in list(active_workers.keys()):
            if cam_id not in current_ids:
                active_workers[cam_id].stop()
                del active_workers[cam_id]

        time.sleep(config.camera_poll_interval_seconds)


if __name__ == "__main__":
    main()