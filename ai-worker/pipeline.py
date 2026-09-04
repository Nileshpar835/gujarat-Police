"""
Per-frame processing pipeline. This is the piece that turns a raw video
frame into calls against the backend's POST /detections/anpr endpoint,
which then runs the normalize -> dedup -> confidence-gate -> watchlist
match -> alert workflow described in HLD Section 8.
"""

import logging
from datetime import datetime, timezone

import numpy as np

from detector import VehicleDetector
from anpr import read_plate
from backend_client import BackendClient
from config import config

logger = logging.getLogger(__name__)


def process_frame(
    frame: np.ndarray,
    camera_id: str,
    detector: VehicleDetector,
    backend: BackendClient,
    frame_timestamp: datetime | None = None,
) -> list[dict]:
    """
    Runs the full detect -> ANPR -> submit pipeline on a single frame.
    Returns the list of submission results (one per vehicle detection that
    produced a plate read), for logging/testing.
    """
    frame_timestamp = frame_timestamp or datetime.now(timezone.utc)
    vehicle_detections = detector.detect(frame)
    results = []

    for vd in vehicle_detections:
        plate_read = read_plate(frame, vd.bbox)
        if plate_read is None or not plate_read.raw_text:
            continue

        # Submission always happens — the backend itself applies the
        # OCR-confidence gate before attempting a watchlist match (Section 8).
        # We still avoid submitting pure noise reads (empty/very short strings).
        if len(plate_read.raw_text) < 4:
            continue

        try:
            result = backend.submit_anpr_detection(
                camera_id=camera_id,
                raw_plate_text=plate_read.raw_text,
                ocr_confidence=plate_read.ocr_confidence,
                detection_confidence=vd.confidence,
                vehicle_type=vd.class_name,
                bounding_box={"x1": vd.bbox[0], "y1": vd.bbox[1], "x2": vd.bbox[2], "y2": vd.bbox[3]},
                detected_at=frame_timestamp,
            )
            results.append(result)
        except Exception as exc:  # noqa: BLE001 - one failed submission shouldn't kill the pipeline
            logger.error("Failed to submit detection for camera %s: %s", camera_id, exc)

    return results
