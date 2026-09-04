"""
Vehicle detection using YOLOv8 (nano weights — CPU-viable, matches the
hackathon feasibility requirement in HLD Section 11: "GPU recommended for
concurrent 50-camera load" but the nano model runs adequately on CPU for
lower concurrency / single-camera testing).
"""

import logging
from dataclasses import dataclass

import numpy as np
from ultralytics import YOLO

from config import config

logger = logging.getLogger(__name__)


@dataclass
class VehicleDetection:
    class_id: int
    class_name: str
    confidence: float
    bbox: tuple  # (x1, y1, x2, y2) in pixel coordinates


class VehicleDetector:
    def __init__(self, weights: str = "yolov8n.pt"):
        logger.info("Loading vehicle detection model: %s", weights)
        self.model = YOLO(weights)

    def detect(self, frame: np.ndarray) -> list[VehicleDetection]:
        """Runs detection on a single frame, returns only vehicle-class detections above threshold."""
        results = self.model.predict(
            frame,
            classes=list(config.vehicle_class_ids),
            conf=config.detection_confidence_threshold,
            verbose=False,
        )
        detections = []
        for r in results:
            for box in r.boxes:
                class_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append(
                    VehicleDetection(
                        class_id=class_id,
                        class_name=config.vehicle_class_names.get(class_id, "vehicle"),
                        confidence=conf,
                        bbox=(int(x1), int(y1), int(x2), int(y2)),
                    )
                )
        return detections
