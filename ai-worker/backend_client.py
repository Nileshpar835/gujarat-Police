import logging
from datetime import datetime, timezone

import httpx

from config import config

logger = logging.getLogger(__name__)


class BackendClient:
    def __init__(self, base_url: str = None, api_key: str = None):
        self.base_url = base_url or config.backend_base_url
        self.api_key = api_key or getattr(config, "ai_worker_api_key", None)
        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        self.client = httpx.Client(base_url=self.base_url, timeout=10.0, headers=headers)

    def list_active_cameras(self) -> list[dict]:
        resp = self.client.get("/cameras", params={"status": "active"})
        resp.raise_for_status()
        return resp.json()

    def submit_anpr_detection(
        self,
        camera_id: str,
        raw_plate_text: str,
        ocr_confidence: float,
        detection_confidence: float,
        vehicle_type: str | None = None,
        vehicle_color: str | None = None,
        bounding_box: dict | None = None,
        evidence_uri: str | None = None,
        detected_at: datetime | None = None,
    ) -> dict:
        payload = {
            "camera_id": camera_id,
            "raw_plate_text": raw_plate_text,
            "ocr_confidence": ocr_confidence,
            "detection_confidence": detection_confidence,
            "vehicle_type": vehicle_type,
            "vehicle_color": vehicle_color,
            "bounding_box": bounding_box,
            "evidence_uri": evidence_uri,
            "detected_at": (detected_at or datetime.now(timezone.utc)).isoformat(),
        }
        resp = self.client.post("/detections/anpr", json=payload)
        resp.raise_for_status()
        result = resp.json()
        if result.get("watchlist_match"):
            logger.warning(
                "WATCHLIST MATCH: plate=%s camera=%s alert_id=%s",
                result["normalized_plate"], camera_id, result["alert_id"],
            )
        return result
