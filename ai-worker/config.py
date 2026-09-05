import os
from dataclasses import dataclass


@dataclass
class WorkerConfig:
    backend_base_url: str = os.getenv("BACKEND_BASE_URL", "http://localhost:8000/api/v1")
    ai_worker_api_key: str = os.getenv("AI_WORKER_API_KEY", "CHANGE_ME_dev_only_ai_worker_key")

    # AI pipeline tuning (see HLD Section 9)
    detection_confidence_threshold: float = float(os.getenv("DETECTION_CONFIDENCE_THRESHOLD", "0.5"))
    ocr_confidence_threshold: float = float(os.getenv("OCR_CONFIDENCE_THRESHOLD", "0.60"))
    sample_fps: float = float(os.getenv("SAMPLE_FPS", "1.0"))  # frames/sec sampled from each camera, not full FPS
    camera_poll_interval_seconds: int = int(os.getenv("CAMERA_POLL_INTERVAL_SECONDS", "30"))

    # COCO class IDs relevant to vehicle detection (YOLOv8 default weights)
    vehicle_class_ids: tuple = (2, 3, 5, 7)  # car, motorcycle, bus, truck
    vehicle_class_names: dict = None

    def __post_init__(self):
        self.vehicle_class_names = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


config = WorkerConfig()
