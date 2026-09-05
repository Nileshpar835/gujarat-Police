"""
ANPR (plate reading) module.

Heuristic plate detection and Tesseract OCR preprocessing.
"""

import logging
from dataclasses import dataclass

import cv2
import numpy as np
import pytesseract

logger = logging.getLogger(__name__)


@dataclass
class PlateReadResult:
    raw_text: str
    ocr_confidence: float


def _candidate_plate_crop(frame: np.ndarray, bbox: tuple) -> np.ndarray | None:
    x1, y1, x2, y2 = bbox
    h = y2 - y1
    w = x2 - x1
    if h <= 0 or w <= 0:
        return None
    crop_y1 = y1 + int(h * 0.55)
    crop_y2 = y1 + int(h * 0.95)
    crop_x1 = x1 + int(w * 0.15)
    crop_x2 = x1 + int(w * 0.85)
    crop = frame[max(0, crop_y1):crop_y2, max(0, crop_x1):crop_x2]
    if crop.size == 0:
        return None
    return crop


def _preprocess_for_ocr(crop: np.ndarray) -> list[np.ndarray]:
    """Produces multiple candidate preprocessed images (Otsu and Adaptive) for robust OCR."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    scale = max(1, 220 // max(gray.shape[0], 1))
    if scale > 1:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.bilateralFilter(enhanced, 9, 75, 75)

    _, thresh_otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresh_adapt = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )

    return [thresh_otsu, thresh_adapt]


def read_plate(frame: np.ndarray, vehicle_bbox: tuple) -> PlateReadResult | None:
    crop = _candidate_plate_crop(frame, vehicle_bbox)
    if crop is None:
        return None

    candidates = _preprocess_for_ocr(crop)
    best_result: PlateReadResult | None = None

    for psm in ["--psm 7", "--psm 6"]:
        config_str = f"{psm} -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        for img in candidates:
            try:
                data = pytesseract.image_to_data(img, config=config_str, output_type=pytesseract.Output.DICT)
            except Exception:
                continue

            words, confidences = [], []
            for text, conf in zip(data.get("text", []), data.get("conf", [])):
                text = str(text).strip()
                try:
                    c = float(conf)
                except (ValueError, TypeError):
                    c = 0.0
                if text and c > 10.0:
                    words.append(text)
                    confidences.append(c)

            if words:
                raw_text = "".join(words)
                if len(raw_text) >= 4:
                    avg_conf = (sum(confidences) / len(confidences)) / 100.0
                    result = PlateReadResult(raw_text=raw_text, ocr_confidence=round(avg_conf, 3))
                    if best_result is None or result.ocr_confidence > best_result.ocr_confidence:
                        best_result = result

    return best_result