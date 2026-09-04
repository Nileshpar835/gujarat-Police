"""
ANPR (plate reading) module.

IMPORTANT — honest limitation: this hackathon-scope implementation does NOT
use a dedicated license-plate detector model (e.g. a YOLO model fine-tuned
on plates). It uses a heuristic crop of the lower-middle portion of each
detected vehicle's bounding box as the plate candidate region, then runs
OCR (Tesseract) on that crop. This is fast to stand up and works
reasonably on head-on/rear traffic-camera angles typical of ANPR gantries,
but is meaningfully less accurate than a dedicated plate-detection model
would be, especially at oblique angles. For production this should be
replaced with a plate-localisation model (see HLD Section 17 roadmap).
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
    ocr_confidence: float  # 0.0-1.0, averaged from Tesseract word-level confidences


def _candidate_plate_crop(frame: np.ndarray, bbox: tuple) -> np.ndarray | None:
    x1, y1, x2, y2 = bbox
    h = y2 - y1
    w = x2 - x1
    if h <= 0 or w <= 0:
        return None
    # Heuristic: plates on Indian vehicles are typically in the lower-middle
    # third of the vehicle's bounding box.
    crop_y1 = y1 + int(h * 0.55)
    crop_y2 = y1 + int(h * 0.95)
    crop_x1 = x1 + int(w * 0.15)
    crop_x2 = x1 + int(w * 0.85)
    crop = frame[max(0, crop_y1):crop_y2, max(0, crop_x1):crop_x2]
    if crop.size == 0:
        return None
    return crop


def _preprocess_for_ocr(crop: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    # upscale small crops — OCR accuracy drops sharply below ~30px char height
    scale = max(1, 200 // max(gray.shape[0], 1))
    if scale > 1:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh


def read_plate(frame: np.ndarray, vehicle_bbox: tuple) -> PlateReadResult | None:
    crop = _candidate_plate_crop(frame, vehicle_bbox)
    if crop is None:
        return None

    processed = _preprocess_for_ocr(crop)

    config_str = "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    data = pytesseract.image_to_data(
        processed, config=config_str, output_type=pytesseract.Output.DICT
    )

    words, confidences = [], []
    for text, conf in zip(data["text"], data["conf"]):
        text = text.strip()
        conf = float(conf)
        if text and conf > 0:
            words.append(text)
            confidences.append(conf)

    if not words:
        return None

    raw_text = "".join(words)
    avg_confidence = (sum(confidences) / len(confidences)) / 100.0  # Tesseract gives 0-100

    return PlateReadResult(raw_text=raw_text, ocr_confidence=round(avg_confidence, 3))
